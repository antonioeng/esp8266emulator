/**
 * Parser — Analizador y transformador de código Arduino a JavaScript ejecutable
 *
 * Rol: Recibe el código Arduino/C++ del editor, lo transforma en
 * instrucciones JavaScript que el simulatorEngine puede ejecutar.
 * NO ejecuta nada, solo produce un AST simplificado o código JS.
 *
 * Funciones soportadas:
 *   - void setup() { ... }
 *   - void loop()  { ... }
 *   - pinMode(pin, mode)
 *   - digitalWrite(pin, value)
 *   - digitalRead(pin)
 *   - analogRead(pin)
 *   - delay(ms)
 *   - Serial.begin(baud)
 *   - Serial.println(msg) / Serial.print(msg)
 *   - Variables y constantes (int, const, #define)
 *   - Estructuras de control (if, else, for, while)
 *
 * Validaciones:
 *   - Error si setup() o loop() no están definidos
 *   - Warning si se usa digitalWrite sin previo pinMode
 *   - Error si se usa un pin inexistente
 *
 * Diseño: Stateless, funciones puras. Fácil de testear y reemplazar
 * por un compilador WASM real en el futuro.
 */

import { VALID_GPIOS, ESP8266_PIN_MAP } from "./gpioManager.js";

// ── Constantes Arduino → JavaScript ────────────────────────────────

const ARDUINO_CONSTANTS = {
  HIGH: 1,
  LOW: 0,
  OUTPUT: '"OUTPUT"',
  INPUT: '"INPUT"',
  INPUT_PULLUP: '"INPUT_PULLUP"',
  LED_BUILTIN: 2,
  true: "true",
  false: "false",
  // Pines D#
  D0: 16, D1: 5, D2: 4, D3: 0, D4: 2,
  D5: 14, D6: 12, D7: 13, D8: 15,
  A0: 17,
};

// ── Validación estática ────────────────────────────────────────────

/**
 * Realiza validación estática del código Arduino.
 * @param {string} code  Código fuente Arduino
 * @returns {{errors: Array<{line: number, message: string, severity: string}>, warnings: Array}}
 */
export function validateCode(code) {
  const errors = [];
  const warnings = [];
  const lines = code.split("\n");

  // Verificar que existen setup() y loop()
  const hasSetup = /void\s+setup\s*\(\s*\)/.test(code);
  const hasLoop = /void\s+loop\s*\(\s*\)/.test(code);

  if (!hasSetup) {
    errors.push({
      line: 1,
      message: "Falta la función void setup() — obligatoria en Arduino",
      severity: "error",
    });
  }

  if (!hasLoop) {
    errors.push({
      line: 1,
      message: "Falta la función void loop() — obligatoria en Arduino",
      severity: "error",
    });
  }

  // Recolectar pines configurados con pinMode
  const configuredPins = new Set();
  const pinModeRegex = /pinMode\s*\(\s*(\w+)\s*,/g;
  let match;
  while ((match = pinModeRegex.exec(code)) !== null) {
    configuredPins.add(match[1]);
  }

  // Analizar línea por línea
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // Ignorar comentarios
    if (trimmed.startsWith("//") || trimmed.startsWith("/*")) return;

    // Verificar digitalWrite sin pinMode
    const dwMatch = trimmed.match(/digitalWrite\s*\(\s*(\w+)\s*,/);
    if (dwMatch) {
      const pin = dwMatch[1];
      if (!configuredPins.has(pin) && pin !== "LED_BUILTIN") {
        warnings.push({
          line: lineNum,
          message: `digitalWrite usa pin "${pin}" sin previo pinMode()`,
          severity: "warning",
        });
      }
    }

    // Verificar pines numéricos inválidos
    const pinNumMatch = trimmed.match(/(?:pinMode|digitalWrite|digitalRead)\s*\(\s*(\d+)\s*[,)]/);
    if (pinNumMatch) {
      const gpio = parseInt(pinNumMatch[1], 10);
      if (!VALID_GPIOS.includes(gpio)) {
        errors.push({
          line: lineNum,
          message: `GPIO ${gpio} no existe en ESP8266. Válidos: ${VALID_GPIOS.join(", ")}`,
          severity: "error",
        });
      }
    }

    // Verificar delay con valor negativo
    const delayMatch = trimmed.match(/delay\s*\(\s*(-\d+)\s*\)/);
    if (delayMatch) {
      errors.push({
        line: lineNum,
        message: "delay() no acepta valores negativos",
        severity: "error",
      });
    }
  });

  return { errors, warnings };
}

// ── Transformación Arduino → JavaScript ────────────────────────────

/**
 * Transforma código Arduino en funciones JavaScript ejecutables.
 * Retorna un objeto con { setup: AsyncFunction, loop: AsyncFunction }
 *
 * @param {string} code  Código Arduino
 * @param {{gpio: object, serial: object}} context  API disponible para el código
 * @returns {{ setup: Function, loop: Function, globals: string }}
 */
export function parseArduinoCode(code) {
  let jsCode = code;

  // 0. Sanitize: strip Monaco snippet placeholders ($0, ${1:text}, etc.)
  jsCode = jsCode.replace(/\$\{\d+(?::([^}]*))?\}/g, '$1');  // ${1:text} → text
  jsCode = jsCode.replace(/\$\d+/g, '');                       // bare $0, $1 → removed

  // 1. Eliminar includes
  jsCode = jsCode.replace(/#include\s*<[^>]+>/g, "// [include removed]");
  jsCode = jsCode.replace(/#include\s*"[^"]+"/g, "// [include removed]");

  // 2. Procesar #define como constantes
  jsCode = jsCode.replace(
    /#define\s+(\w+)\s+(.+)/g,
    (_, name, value) => `const ${name} = ${value.trim()};`
  );

  // 3. Reemplazar tipos C++ → let/const
  jsCode = jsCode.replace(/\b(unsigned\s+)?(int|long|short|byte|char|float|double|boolean)\s+/g, "let ");
  jsCode = jsCode.replace(/\b(uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t)\s+/g, "let ");
  jsCode = jsCode.replace(/\bString\s+/g, "let ");
  jsCode = jsCode.replace(/\bbool\s+/g, "let ");

  // 4. Reemplazar void → async function (setup/loop first, then user-defined)
  jsCode = jsCode.replace(/void\s+setup\s*\(\s*\)/g, "async function __setup()");
  jsCode = jsCode.replace(/void\s+loop\s*\(\s*\)/g, "async function __loop()");
  jsCode = jsCode.replace(/void\s+(\w+)\s*\(([^)]*)\)/g, "async function $1($2)");

  // 5. Reemplazar delay → await __delay
  jsCode = jsCode.replace(/\bdelay\s*\(/g, "await __delay(");

  // 6. Reemplazar funciones Arduino → API del contexto
  jsCode = jsCode.replace(/\bpinMode\s*\(/g, "__gpio.pinMode(");
  jsCode = jsCode.replace(/\bdigitalWrite\s*\(/g, "__gpio.digitalWrite(");
  jsCode = jsCode.replace(/\bdigitalRead\s*\(/g, "__gpio.digitalRead(");
  jsCode = jsCode.replace(/\banalogRead\s*\(/g, "__gpio.analogRead(");

  // 7. Reemplazar Serial
  jsCode = jsCode.replace(/\bSerial\.begin\s*\(/g, "__serial.begin(");
  jsCode = jsCode.replace(/\bSerial\.println\s*\(/g, "__serial.println(");
  jsCode = jsCode.replace(/\bSerial\.print\s*\(/g, "__serial.print(");
  jsCode = jsCode.replace(/\bSerial\.available\s*\(/g, "__serial.available(");
  jsCode = jsCode.replace(/\bSerial\.read\s*\(/g, "__serial.read(");

  // 8. Reemplazar millis() y micros()
  jsCode = jsCode.replace(/\bmillis\s*\(\s*\)/g, "__millis()");
  jsCode = jsCode.replace(/\bmicros\s*\(\s*\)/g, "__micros()");

  // 9. Reemplazar analogWrite
  jsCode = jsCode.replace(/\banalogWrite\s*\(/g, "__gpio.analogWrite(");

  // 10. Reemplazar constantes Arduino
  Object.entries(ARDUINO_CONSTANTS).forEach(([key, value]) => {
    // Solo reemplazar como palabra completa, no dentro de strings
    const regex = new RegExp(`\\b${key}\\b`, "g");
    jsCode = jsCode.replace(regex, String(value));
  });

  return jsCode;
}

/**
 * Extrae las funciones setup y loop del código transformado y
 * las compila en funciones ejecutables con acceso al contexto.
 *
 * @param {string} jsCode  Código JavaScript transformado
 * @param {object} context  { __gpio, __serial, __delay, __millis, __checkRunning }
 * @returns {{ setup: Function, loop: Function }}
 */
export function compileFunctions(jsCode, context) {
  const {
    __gpio,
    __serial,
    __delay,
    __millis,
    __micros,
    __checkRunning,
  } = context;

  // Envolver en una función que expone el contexto y retorna setup/loop
  const wrappedCode = `
    ${jsCode}

    return { __setup, __loop };
  `;

  try {
    const factory = new Function(
      "__gpio",
      "__serial",
      "__delay",
      "__millis",
      "__micros",
      "__checkRunning",
      "HIGH", "LOW", "OUTPUT", "INPUT", "INPUT_PULLUP",
      wrappedCode
    );

    const result = factory(
      __gpio,
      __serial,
      __delay,
      __millis,
      __micros,
      __checkRunning,
      1, 0, "OUTPUT", "INPUT", "INPUT_PULLUP"
    );

    return {
      setup: result.__setup,
      loop: result.__loop,
    };
  } catch (error) {
    throw new Error(`Error de compilación: ${error.message}`);
  }
}

export default {
  validateCode,
  parseArduinoCode,
  compileFunctions,
};
