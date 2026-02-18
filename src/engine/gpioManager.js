/**
 * GPIOManager — Administrador del estado GPIO del ESP8266
 *
 * Rol: Mantiene el estado de cada pin (modo, valor, alias) y expone
 * la API que utiliza el motor de simulación (pinMode, digitalWrite, digitalRead).
 * Emite eventos a través del EventBus cuando cambia el estado de un pin.
 *
 * Mapeo real del ESP8266 (NodeMCU):
 *   D0 = GPIO16    D5 = GPIO14
 *   D1 = GPIO5     D6 = GPIO12
 *   D2 = GPIO4     D7 = GPIO13
 *   D3 = GPIO0     D8 = GPIO15
 *   D4 = GPIO2     A0 = ADC (analog)
 *
 * Los componentes externos (LEDs, Botones, Sensores) se registran
 * asociados a un pin y reaccionan a sus cambios.
 */

import eventBus from "./eventBus.js";

// ── Constantes de pin ──────────────────────────────────────────────
export const PIN_MODE = {
  INPUT: "INPUT",
  OUTPUT: "OUTPUT",
  INPUT_PULLUP: "INPUT_PULLUP",
};

export const PIN_VALUE = {
  LOW: 0,
  HIGH: 1,
};

/**
 * Mapeo oficial NodeMCU ESP8266 → GPIO real
 * Permite usar D0-D8, A0 o GPIO directo.
 */
export const ESP8266_PIN_MAP = {
  D0: 16,
  D1: 5,
  D2: 4,
  D3: 0,
  D4: 2,  // LED_BUILTIN
  D5: 14,
  D6: 12,
  D7: 13,
  D8: 15,
  A0: 17, // ADC (analog)
};

/** GPIO válidos del ESP8266 */
export const VALID_GPIOS = [0, 1, 2, 3, 4, 5, 12, 13, 14, 15, 16, 17];

// ── Clase GPIOManager ──────────────────────────────────────────────

class GPIOManager {
  constructor() {
    /**
     * Estado de cada pin.
     * @type {Map<number, {mode: string|null, value: number, alias: string|null}>}
     */
    this._pins = new Map();

    /**
     * Componentes registrados en pines.
     * @type {Map<number, Array<{id: string, type: string, config: object}>>}
     */
    this._components = new Map();

    this._initializePins();
  }

  /**
   * Inicializa todos los GPIO con estado por defecto.
   */
  _initializePins() {
    VALID_GPIOS.forEach((gpio) => {
      this._pins.set(gpio, {
        mode: null,
        value: PIN_VALUE.LOW,
        pwmValue: 0,      // 0-1023 analog duty cycle
        isPWM: false,      // true when driven by analogWrite
        alias: this._getAlias(gpio),
      });
    });
  }

  /**
   * Obtiene el alias D# para un GPIO dado.
   * @param {number} gpio
   * @returns {string|null}
   */
  _getAlias(gpio) {
    for (const [alias, gpioNum] of Object.entries(ESP8266_PIN_MAP)) {
      if (gpioNum === gpio) return alias;
    }
    return null;
  }

  /**
   * Resuelve un identificador de pin a número GPIO.
   * Acepta: número directo, "D0"-"D8", "A0", constantes LED_BUILTIN.
   * @param {number|string} pin
   * @returns {number}
   */
  resolvePin(pin) {
    if (typeof pin === "string") {
      const upper = pin.toUpperCase();
      if (upper === "LED_BUILTIN") return 2; // D4 = GPIO2
      if (ESP8266_PIN_MAP[upper] !== undefined) return ESP8266_PIN_MAP[upper];
      const parsed = parseInt(pin, 10);
      if (!isNaN(parsed)) return parsed;
      throw new Error(`Pin desconocido: "${pin}"`);
    }
    return pin;
  }

  /**
   * Valida que un GPIO existe en el ESP8266.
   * @param {number} gpio
   */
  _validateGpio(gpio) {
    if (!VALID_GPIOS.includes(gpio)) {
      throw new Error(`GPIO ${gpio} no es válido para ESP8266`);
    }
  }

  // ── API Arduino ────────────────────────────────────────────────

  /**
   * Configura el modo de un pin (INPUT, OUTPUT, INPUT_PULLUP).
   * @param {number|string} pin
   * @param {string} mode
   */
  pinMode(pin, mode) {
    const gpio = this.resolvePin(pin);
    this._validateGpio(gpio);

    const normalizedMode = mode.toUpperCase();
    if (!Object.values(PIN_MODE).includes(normalizedMode)) {
      throw new Error(`Modo inválido: "${mode}". Use INPUT, OUTPUT o INPUT_PULLUP`);
    }

    const pinState = this._pins.get(gpio);
    pinState.mode = normalizedMode;

    // Si es INPUT_PULLUP, inicializar en HIGH
    if (normalizedMode === PIN_MODE.INPUT_PULLUP) {
      pinState.value = PIN_VALUE.HIGH;
    }

    eventBus.emit("pin-change", {
      pin: gpio,
      alias: pinState.alias,
      mode: normalizedMode,
      value: pinState.value,
    });
  }

  /**
   * Escribe un valor digital en un pin configurado como OUTPUT.
   * @param {number|string} pin
   * @param {number} value  0 (LOW) o 1 (HIGH)
   */
  digitalWrite(pin, value) {
    const gpio = this.resolvePin(pin);
    this._validateGpio(gpio);

    const pinState = this._pins.get(gpio);

    if (pinState.mode !== PIN_MODE.OUTPUT) {
      eventBus.emit("serial-log", {
        message: `⚠ digitalWrite en GPIO${gpio} sin pinMode(OUTPUT)`,
        type: "warn",
      });
    }

    const normalizedValue = value ? PIN_VALUE.HIGH : PIN_VALUE.LOW;
    pinState.value = normalizedValue;

    // ── Clear PWM state: digitalWrite overrides analogWrite ─────
    pinState.isPWM = false;
    pinState.pwmValue = normalizedValue === PIN_VALUE.HIGH ? 1023 : 0;
    const brightness = normalizedValue === PIN_VALUE.HIGH ? 1.0 : 0.0;

    // Emit pwm-change so LEDs snap to full-on / full-off
    eventBus.emit("pwm-change", {
      pin: gpio,
      alias: pinState.alias,
      value: pinState.pwmValue,
      brightness,
    });

    eventBus.emit("pin-change", {
      pin: gpio,
      alias: pinState.alias,
      mode: pinState.mode,
      value: normalizedValue,
      pwmValue: pinState.pwmValue,
      brightness,
    });

    // Notificar a componentes registrados en este pin
    this._notifyComponents(gpio, normalizedValue, pinState.pwmValue);
  }

  /**
   * Lee el valor digital de un pin.
   * @param {number|string} pin
   * @returns {number} 0 o 1
   */
  digitalRead(pin) {
    const gpio = this.resolvePin(pin);
    this._validateGpio(gpio);

    const pinState = this._pins.get(gpio);

    if (!pinState.mode) {
      eventBus.emit("serial-log", {
        message: `⚠ digitalRead en GPIO${gpio} sin configurar modo`,
        type: "warn",
      });
    }

    return pinState.value;
  }

  /**
   * Lee valor analógico de A0 (0-1023 simulado).
   * @returns {number}
   */
  analogRead() {
    const pinState = this._pins.get(17); // A0
    return pinState.value;
  }

  /**
   * Escribe un valor PWM (0-1023) en un pin. ESP8266 soporta PWM por software
   * en todos los GPIO excepto GPIO16.
   *
   * Arquitectura PWM simulada:
   *   - Almacena pwmValue (0-1023) como duty-cycle analógico
   *   - Marca el pin como isPWM = true para distinguir de digitalWrite
   *   - Emite "pwm-change" (datos analógicos para LEDs/servos)
   *   - También emite "pin-change" (compatibilidad con Pin visualización digital)
   *   - Notifica componentes registrados con el valor analógico
   *
   * @param {number|string} pin   Identificador del pin
   * @param {number}         value Duty cycle 0-1023
   */
  analogWrite(pin, value) {
    const gpio = this.resolvePin(pin);
    this._validateGpio(gpio);

    const pinState = this._pins.get(gpio);

    // ── Validación de rango ──────────────────────────────────────
    if (value < 0 || value > 1023) {
      eventBus.emit("serial-log", {
        message: `⚠ analogWrite(${gpio}, ${value}): valor fuera de rango 0-1023, clamped`,
        type: "warn",
      });
    }
    const clampedValue = Math.max(0, Math.min(1023, Math.round(value)));

    // ── Validación de modo ───────────────────────────────────────
    if (pinState.mode !== PIN_MODE.OUTPUT && pinState.mode !== null) {
      eventBus.emit("serial-log", {
        message: `⚠ analogWrite en GPIO${gpio} sin pinMode(OUTPUT)`,
        type: "warn",
      });
    }

    // GPIO16 no soporta PWM en ESP8266 real
    if (gpio === 16) {
      eventBus.emit("serial-log", {
        message: `⚠ GPIO16 no soporta PWM hardware; simulando por software`,
        type: "warn",
      });
    }

    // ── Actualizar estado del pin ────────────────────────────────
    pinState.isPWM = true;
    pinState.pwmValue = clampedValue;
    pinState.value = clampedValue > 0 ? PIN_VALUE.HIGH : PIN_VALUE.LOW;

    // ── Emitir evento PWM dedicado (para LEDs con brillo) ───────
    const brightness = clampedValue / 1023;
    eventBus.emit("pwm-change", {
      pin: gpio,
      alias: pinState.alias,
      value: clampedValue,
      brightness,               // 0.0 – 1.0 normalizado
    });

    // ── Emitir pin-change para compatibilidad con Pin dots ──────
    eventBus.emit("pin-change", {
      pin: gpio,
      alias: pinState.alias,
      mode: pinState.mode,
      value: pinState.value,
      pwmValue: clampedValue,
      brightness,
    });

    // ── Notificar componentes registrados ────────────────────────
    this._notifyComponents(gpio, pinState.value, clampedValue);
  }

  /**
   * Establece el valor de un pin externamente (ej: botón presionado).
   * @param {number} gpio
   * @param {number} value
   */
  setExternalValue(gpio, value) {
    this._validateGpio(gpio);
    const pinState = this._pins.get(gpio);
    pinState.value = value ? PIN_VALUE.HIGH : PIN_VALUE.LOW;

    eventBus.emit("pin-change", {
      pin: gpio,
      alias: pinState.alias,
      mode: pinState.mode,
      value: pinState.value,
    });
  }

  // ── Componentes ────────────────────────────────────────────────

  /**
   * Registra un componente asociado a un pin.
   * @param {{type: string, pin: number|string, id?: string, config?: object}} component
   * @returns {string} ID del componente
   */
  registerComponent(component) {
    const gpio = this.resolvePin(component.pin);
    this._validateGpio(gpio);

    const id = component.id || `${component.type}_${gpio}_${Date.now()}`;

    if (!this._components.has(gpio)) {
      this._components.set(gpio, []);
    }

    this._components.get(gpio).push({
      id,
      type: component.type,
      config: component.config || {},
    });

    eventBus.emit("component-registered", {
      id,
      type: component.type,
      pin: gpio,
      alias: this._getAlias(gpio),
    });

    return id;
  }

  /**
   * Elimina un componente por ID.
   * @param {string} componentId
   */
  unregisterComponent(componentId) {
    for (const [gpio, components] of this._components) {
      const index = components.findIndex((c) => c.id === componentId);
      if (index !== -1) {
        components.splice(index, 1);
        if (components.length === 0) {
          this._components.delete(gpio);
        }
        eventBus.emit("component-unregistered", { id: componentId });
        return;
      }
    }
  }

  /**
   * Notifica a componentes registrados en un pin sobre cambio de valor.
   * @param {number} gpio
   * @param {number} value
   */
  _notifyComponents(gpio, value, analogValue = 0) {
    const components = this._components.get(gpio);
    if (components) {
      components.forEach((comp) => {
        eventBus.emit("component-update", {
          id: comp.id,
          type: comp.type,
          pin: gpio,
          value,
          analogValue,
          brightness: analogValue / 1023,
        });
      });
    }
  }

  // ── Utilidades ─────────────────────────────────────────────────

  /**
   * Obtiene el estado completo de un pin.
   * @param {number|string} pin
   * @returns {{mode: string|null, value: number, alias: string|null}}
   */
  getPinState(pin) {
    const gpio = this.resolvePin(pin);
    return { ...this._pins.get(gpio), gpio };
  }

  /**
   * Obtiene el estado de todos los pines.
   * @returns {Array<{gpio: number, mode: string|null, value: number, alias: string|null}>}
   */
  getAllPins() {
    const result = [];
    this._pins.forEach((state, gpio) => {
      result.push({ gpio, ...state });
    });
    return result;
  }

  /**
   * Obtiene todos los componentes registrados.
   * @returns {Array}
   */
  getAllComponents() {
    const result = [];
    this._components.forEach((components, gpio) => {
      components.forEach((comp) => {
        result.push({ ...comp, pin: gpio });
      });
    });
    return result;
  }

  /**
   * Resetea todos los pines a su estado inicial.
   */
  reset() {
    this._initializePins();
    // No eliminar componentes en reset, solo resetear estado
    eventBus.emit("gpio-reset", {});
  }
}

// Singleton
const gpioManager = new GPIOManager();
export default gpioManager;
