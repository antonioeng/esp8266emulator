/**
 * SerialService — Servicio de comunicación WebSerial API
 *
 * Rol: Encapsula toda la lógica de conexión física con un ESP8266
 * real vía puerto serie USB. Proporciona:
 *   - Detección de soporte WebSerial
 *   - Conexión/desconexión del dispositivo
 *   - Envío de datos (código, comandos)
 *   - Recepción de logs en tiempo real
 *   - Manejo robusto de errores
 *
 * Emite eventos vía EventBus para que la UI reaccione.
 * Si WebSerial no está disponible, el sistema debe activar
 * automáticamente el modo simulación.
 */

import eventBus from "../engine/eventBus.js";

class SerialService {
  constructor() {
    /** @type {SerialPort|null} */
    this._port = null;

    /** @type {ReadableStreamDefaultReader|null} */
    this._reader = null;

    /** @type {WritableStreamDefaultWriter|null} */
    this._writer = null;

    /** Flag de conexión activa */
    this._connected = false;

    /** Flag para detener lectura */
    this._reading = false;

    /** Baudrate por defecto */
    this._baudRate = 115200;

    /** Decodificador de texto para stream binario */
    this._decoder = new TextDecoder();
  }

  // ── Detección ────────────────────────────────────────────────────

  /**
   * Verifica si el navegador soporta WebSerial API.
   * @returns {boolean}
   */
  isSupported() {
    return "serial" in navigator;
  }

  /**
   * Verifica si hay un dispositivo conectado.
   * @returns {boolean}
   */
  isConnected() {
    return this._connected;
  }

  // ── Conexión ─────────────────────────────────────────────────────

  /**
   * Solicita al usuario seleccionar un puerto serie y se conecta.
   * @param {number} [baudRate=115200]
   * @returns {Promise<boolean>} true si la conexión fue exitosa
   */
  async connect(baudRate = 115200) {
    if (!this.isSupported()) {
      eventBus.emit("serial-log", {
        message: "❌ WebSerial API no disponible en este navegador",
        type: "error",
      });
      eventBus.emit("connection-change", { connected: false, mode: "simulation" });
      return false;
    }

    try {
      // Solicitar puerto al usuario (abre diálogo del navegador)
      this._port = await navigator.serial.requestPort({
        filters: [
          { usbVendorId: 0x1a86 }, // CH340 (común en NodeMCU)
          { usbVendorId: 0x10c4 }, // CP2102 (común en ESP8266)
          { usbVendorId: 0x0403 }, // FTDI
        ],
      });

      // Abrir el puerto
      await this._port.open({ baudRate });
      this._baudRate = baudRate;
      this._connected = true;

      eventBus.emit("serial-log", {
        message: `✅ Conectado al ESP8266 (${baudRate} baud)`,
        type: "info",
      });
      eventBus.emit("connection-change", { connected: true, mode: "hardware" });

      // Iniciar lectura de datos
      this._startReading();

      // Escuchar desconexión
      this._port.addEventListener("disconnect", () => {
        this._handleDisconnect();
      });

      return true;
    } catch (error) {
      if (error.name === "NotFoundError") {
        eventBus.emit("serial-log", {
          message: "ℹ No se seleccionó ningún dispositivo",
          type: "warn",
        });
      } else {
        eventBus.emit("serial-log", {
          message: `❌ Error de conexión: ${error.message}`,
          type: "error",
        });
      }
      eventBus.emit("connection-change", { connected: false, mode: "simulation" });
      return false;
    }
  }

  /**
   * Desconecta el puerto serie.
   */
  async disconnect() {
    this._reading = false;

    try {
      if (this._reader) {
        await this._reader.cancel();
        this._reader = null;
      }
      if (this._writer) {
        await this._writer.close();
        this._writer = null;
      }
      if (this._port) {
        await this._port.close();
        this._port = null;
      }
    } catch (error) {
      console.warn("[SerialService] Error closing port:", error);
    }

    this._connected = false;
    eventBus.emit("serial-log", {
      message: "🔌 Desconectado del ESP8266",
      type: "info",
    });
    eventBus.emit("connection-change", { connected: false, mode: "simulation" });
  }

  // ── Envío ────────────────────────────────────────────────────────

  /**
   * Envía datos al dispositivo conectado.
   * @param {string} data
   */
  async send(data) {
    if (!this._connected || !this._port) {
      eventBus.emit("serial-log", {
        message: "❌ No hay dispositivo conectado",
        type: "error",
      });
      return;
    }

    try {
      if (!this._writer) {
        this._writer = this._port.writable.getWriter();
      }
      const encoder = new TextEncoder();
      await this._writer.write(encoder.encode(data));
    } catch (error) {
      eventBus.emit("serial-log", {
        message: `❌ Error de envío: ${error.message}`,
        type: "error",
      });
      this._handleDisconnect();
    }
  }

  /**
   * Envía una línea completa (agrega \\n).
   * @param {string} data
   */
  async sendLine(data) {
    await this.send(data + "\n");
  }

  // ── Lectura ──────────────────────────────────────────────────────

  /**
   * Inicia la lectura continua del puerto serie.
   * Los datos recibidos se emiten como eventos "serial-log".
   */
  async _startReading() {
    if (!this._port || !this._port.readable) return;

    this._reading = true;
    let buffer = "";

    try {
      while (this._reading && this._port.readable) {
        this._reader = this._port.readable.getReader();

        try {
          while (this._reading) {
            const { value, done } = await this._reader.read();
            if (done) break;

            // Decodificar bytes a texto
            const text = this._decoder.decode(value, { stream: true });
            buffer += text;

            // Procesar líneas completas
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // Último fragmento incompleto

            lines.forEach((line) => {
              const trimmed = line.trim();
              if (trimmed) {
                eventBus.emit("serial-log", {
                  message: trimmed,
                  type: "info",
                  source: "hardware",
                });
              }
            });
          }
        } finally {
          this._reader.releaseLock();
          this._reader = null;
        }
      }
    } catch (error) {
      if (this._reading) {
        eventBus.emit("serial-log", {
          message: `❌ Error de lectura: ${error.message}`,
          type: "error",
        });
        this._handleDisconnect();
      }
    }
  }

  // ── Utilidades ───────────────────────────────────────────────────

  /**
   * Maneja una desconexión inesperada.
   */
  _handleDisconnect() {
    this._connected = false;
    this._reading = false;
    this._reader = null;
    this._writer = null;
    this._port = null;

    eventBus.emit("serial-log", {
      message: "⚡ Dispositivo desconectado inesperadamente",
      type: "error",
    });
    eventBus.emit("connection-change", { connected: false, mode: "simulation" });
  }
}

// Singleton
const serialService = new SerialService();
export default serialService;
