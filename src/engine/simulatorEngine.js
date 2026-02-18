/**
 * SimulatorEngine — Motor de simulación principal del ESP8266
 *
 * Rol: Orquesta la ejecución del código Arduino transformado.
 * Independiente de React. Se comunica SOLO vía EventBus.
 *
 * Ciclo de vida:
 *   1. load(code)   → Parsea y compila el código
 *   2. start()      → Ejecuta setup() y luego loop() en bucle infinito
 *   3. stop()       → Detiene la ejecución del loop
 *   4. reset()      → Detiene + limpia estado GPIO + limpia logs
 *
 * El loop() se ejecuta de forma asíncrona usando setTimeout recursivo
 * para no bloquear el hilo principal del navegador y permitir que
 * la UI se actualice entre iteraciones.
 *
 * Arquitectura:
 *   - Parser transforma Arduino → JS
 *   - GPIOManager mantiene estado de pines
 *   - EventBus comunica cambios a la UI
 *   - Engine solo orquesta
 */

import eventBus from "./eventBus.js";
import gpioManager from "./gpioManager.js";
import { validateCode, parseArduinoCode, compileFunctions } from "./parser.js";

// ── Estados del motor ──────────────────────────────────────────────
const ENGINE_STATE = {
  IDLE: "idle",
  RUNNING: "running",
  STOPPED: "stopped",
  ERROR: "error",
};

class SimulatorEngine {
  constructor() {
    /** Estado actual del motor */
    this._state = ENGINE_STATE.IDLE;

    /** Flag para detener el loop */
    this._running = false;

    /** Referencia al timeout del loop (para cancelar) */
    this._loopTimeout = null;

    /** Funciones compiladas del sketch actual */
    this._compiled = null;

    /** Código fuente actual */
    this._sourceCode = "";

    /** Timestamp de inicio (para millis()) */
    this._startTime = 0;

    /** Contador de iteraciones del loop */
    this._loopCount = 0;

    /** Velocidad de simulación (ms entre iteraciones, 0 = máxima) */
    this._loopDelay = 1;
  }

  // ── API Pública ──────────────────────────────────────────────────

  /**
   * Carga y compila código Arduino.
   * @param {string} code  Código fuente Arduino/C++
   * @returns {{success: boolean, errors: Array, warnings: Array}}
   */
  load(code) {
    this._sourceCode = code;

    // 1. Validación estática
    const validation = validateCode(code);

    if (validation.errors.length > 0) {
      validation.errors.forEach((err) => {
        eventBus.emit("serial-log", {
          message: `❌ Línea ${err.line}: ${err.message}`,
          type: "error",
        });
      });
      return { success: false, ...validation };
    }

    // Emitir warnings
    validation.warnings.forEach((warn) => {
      eventBus.emit("serial-log", {
        message: `⚠ Línea ${warn.line}: ${warn.message}`,
        type: "warn",
      });
    });

    // 2. Transformar Arduino → JS
    try {
      const jsCode = parseArduinoCode(code);

      // 3. Compilar funciones con contexto
      const context = this._buildContext();
      this._compiled = compileFunctions(jsCode, context);

      eventBus.emit("serial-log", {
        message: "✅ Compilación exitosa",
        type: "info",
      });

      return { success: true, ...validation };
    } catch (error) {
      eventBus.emit("serial-log", {
        message: `❌ ${error.message}`,
        type: "error",
      });

      this._setState(ENGINE_STATE.ERROR);
      return {
        success: false,
        errors: [{ line: 0, message: error.message, severity: "error" }],
        warnings: validation.warnings,
      };
    }
  }

  /**
   * Inicia la ejecución: setup() → loop() infinito.
   */
  async start() {
    if (!this._compiled) {
      eventBus.emit("serial-log", {
        message: "❌ No hay código compilado. Use Run primero.",
        type: "error",
      });
      return;
    }

    if (this._state === ENGINE_STATE.RUNNING) {
      eventBus.emit("serial-log", {
        message: "⚠ El simulador ya está en ejecución",
        type: "warn",
      });
      return;
    }

    this._running = true;
    this._startTime = Date.now();
    this._loopCount = 0;
    this._setState(ENGINE_STATE.RUNNING);

    eventBus.emit("serial-log", {
      message: "🚀 Iniciando simulación ESP8266...",
      type: "info",
    });

    try {
      // Ejecutar setup() una vez
      await this._compiled.setup();

      eventBus.emit("serial-log", {
        message: "✅ setup() completado",
        type: "info",
      });

      // Ejecutar loop() de forma asíncrona infinita
      this._runLoop();
    } catch (error) {
      if (error.message === "__STOP__") {
        // Detención controlada
        return;
      }
      this._handleError(error);
    }
  }

  /**
   * Detiene la ejecución del loop.
   */
  stop() {
    this._running = false;

    if (this._loopTimeout) {
      clearTimeout(this._loopTimeout);
      this._loopTimeout = null;
    }

    this._setState(ENGINE_STATE.STOPPED);

    eventBus.emit("serial-log", {
      message: `⏹ Simulación detenida (${this._loopCount} iteraciones)`,
      type: "info",
    });
  }

  /**
   * Reset completo: detiene ejecución + limpia GPIO + limpia logs.
   */
  reset() {
    this.stop();
    gpioManager.reset();
    this._compiled = null;
    this._sourceCode = "";
    this._loopCount = 0;
    this._setState(ENGINE_STATE.IDLE);

    eventBus.emit("serial-log", {
      message: "🔄 Simulador reseteado",
      type: "info",
    });
    eventBus.emit("engine-reset", {});
  }

  /**
   * Obtiene el estado actual del motor.
   * @returns {string}
   */
  getState() {
    return this._state;
  }

  /**
   * Compila y ejecuta en un solo paso (botón Run).
   * @param {string} code
   */
  async run(code) {
    // Detener ejecución previa si existe
    if (this._state === ENGINE_STATE.RUNNING) {
      this.stop();
      // Pequeña pausa para que el loop anterior termine
      await new Promise((r) => setTimeout(r, 50));
    }

    gpioManager.reset();

    const result = this.load(code);
    if (result.success) {
      await this.start();
    }
  }

  // ── Internos ─────────────────────────────────────────────────────

  /**
   * Ejecuta loop() de forma asíncrona e infinita sin bloquear el hilo.
   * Usa setTimeout recursivo para ceder control al browser entre ciclos.
   */
  _runLoop() {
    if (!this._running) return;

    this._loopTimeout = setTimeout(async () => {
      if (!this._running) return;

      try {
        await this._compiled.loop();
        this._loopCount++;
        // Continuar el loop
        this._runLoop();
      } catch (error) {
        if (error.message === "__STOP__") {
          return;
        }
        this._handleError(error);
      }
    }, this._loopDelay);
  }

  /**
   * Construye el objeto de contexto que se inyecta al código compilado.
   * Esto es lo que el código Arduino "ve" como API disponible.
   */
  _buildContext() {
    return {
      __gpio: gpioManager,
      __serial: this._buildSerialAPI(),
      __delay: this._delay.bind(this),
      __millis: () => Date.now() - this._startTime,
      __micros: () => (Date.now() - this._startTime) * 1000,
      __checkRunning: () => {
        if (!this._running) throw new Error("__STOP__");
      },
    };
  }

  /**
   * Construye la API Serial simulada.
   */
  _buildSerialAPI() {
    return {
      begin: (baud) => {
        eventBus.emit("serial-log", {
          message: `Serial iniciado a ${baud} baud`,
          type: "info",
        });
      },
      println: (msg) => {
        eventBus.emit("serial-log", {
          message: String(msg),
          type: "info",
        });
      },
      print: (msg) => {
        eventBus.emit("serial-log", {
          message: String(msg),
          type: "info",
        });
      },
      available: () => 0,
      read: () => -1,
    };
  }

  /**
   * Implementación de delay() que:
   * 1. Pausa la ejecución (await)
   * 2. Verifica si el motor sigue corriendo (para permitir STOP durante delay)
   * 3. Escala el delay para simulación rápida
   *
   * @param {number} ms  Milisegundos a esperar
   * @returns {Promise<void>}
   */
  _delay(ms) {
    return new Promise((resolve, reject) => {
      // Escalar delay: máximo 2 segundos reales para no hacer la sim lenta
      const realDelay = Math.min(ms, 2000);

      // Dividir delays largos en chunks para poder detener
      const chunkSize = 50; // Verificar cada 50ms si sigue corriendo
      let elapsed = 0;

      const tick = () => {
        if (!this._running) {
          reject(new Error("__STOP__"));
          return;
        }
        elapsed += chunkSize;
        if (elapsed >= realDelay) {
          resolve();
        } else {
          setTimeout(tick, chunkSize);
        }
      };

      if (realDelay <= chunkSize) {
        setTimeout(() => {
          if (!this._running) {
            reject(new Error("__STOP__"));
            return;
          }
          resolve();
        }, realDelay);
      } else {
        setTimeout(tick, chunkSize);
      }
    });
  }

  /**
   * Actualiza el estado y emite evento.
   * @param {string} newState
   */
  _setState(newState) {
    this._state = newState;
    eventBus.emit("engine-state", { state: newState });
  }

  /**
   * Maneja errores de ejecución.
   * @param {Error} error
   */
  _handleError(error) {
    this._running = false;
    this._setState(ENGINE_STATE.ERROR);

    // Try to extract line info from the stack trace
    let location = '';
    if (error.stack) {
      const evalMatch = error.stack.match(/<anonymous>:(\d+):(\d+)/);
      if (evalMatch) {
        location = ` (línea ~${evalMatch[1]})`;
      }
    }

    eventBus.emit("serial-log", {
      message: `💥 Error de ejecución${location}: ${error.message}`,
      type: "error",
    });

    console.error("[SimulatorEngine] Runtime error:", error);
    if (this._sourceCode) {
      console.error("[SimulatorEngine] Source code:", this._sourceCode);
    }
  }
}

// Singleton
const simulatorEngine = new SimulatorEngine();
export default simulatorEngine;
