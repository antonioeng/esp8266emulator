/**
 * useSimulatorStore — Estado global con Zustand
 *
 * Rol: Única fuente de verdad para el estado de la UI.
 * El motor de simulación NO usa este store directamente;
 * React escucha eventos del EventBus y actualiza el store.
 *
 * Secciones:
 *   - Editor: código fuente, errores de validación
 *   - Engine: estado del motor (running, stopped, etc.)
 *   - Serial: logs de la consola
 *   - Connection: estado de WebSerial
 *   - Pins: estado visual de los pines
 *   - Components: componentes registrados
 *   - Project: metadatos del proyecto
 */

import { create } from "zustand";

const DEFAULT_CODE = `// ESP8266 Blink - Ejemplo básico
// LED integrado en GPIO2 (D4)

void setup() {
  Serial.begin(115200);
  pinMode(2, OUTPUT);
  Serial.println("ESP8266 Simulator Ready!");
}

void loop() {
  digitalWrite(2, HIGH);
  Serial.println("LED ON");
  delay(1000);
  
  digitalWrite(2, LOW);
  Serial.println("LED OFF");
  delay(1000);
}
`;

const useSimulatorStore = create((set, get) => ({
  // ── Editor ─────────────────────────────────────────────────────
  code: DEFAULT_CODE,
  validationErrors: [],
  validationWarnings: [],

  setCode: (code) => set({ code }),
  setValidation: (errors, warnings) =>
    set({ validationErrors: errors, validationWarnings: warnings }),

  // ── Engine State ───────────────────────────────────────────────
  engineState: "idle", // idle | running | stopped | error
  loopCount: 0,

  setEngineState: (state) => set({ engineState: state }),
  setLoopCount: (count) => set({ loopCount: count }),

  // ── Serial / Console Logs ──────────────────────────────────────
  logs: [],
  maxLogs: 500,

  addLog: (log) =>
    set((state) => {
      const entry = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toLocaleTimeString("es-ES", {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          fractionalSecondDigits: 3,
        }),
        ...log,
      };
      const logs = state.logs.length >= state.maxLogs
        ? [...state.logs.slice(-(state.maxLogs - 1)), entry]
        : [...state.logs, entry];
      return { logs };
    }),

  clearLogs: () => set({ logs: [] }),

  // ── Connection (WebSerial) ─────────────────────────────────────
  isConnected: false,
  connectionMode: "simulation", // "simulation" | "hardware"
  serialPort: null,

  setConnected: (connected) => set({ isConnected: connected }),
  setConnectionMode: (mode) => set({ connectionMode: mode }),
  setSerialPort: (port) => set({ serialPort: port }),

  // ── Pin States (para UI visual) ────────────────────────────────
  pinStates: {},

  setPinState: (gpio, state) =>
    set((prev) => ({
      pinStates: {
        ...prev.pinStates,
        [gpio]: { ...prev.pinStates[gpio], ...state },
      },
    })),

  resetPinStates: () => set({ pinStates: {} }),

  // ── Components ─────────────────────────────────────────────────
  components: [
    { id: "led_builtin", type: "LED", pin: 2, label: "LED_BUILTIN", color: "#00ff88" },
  ],

  addComponent: (component) =>
    set((state) => ({
      components: [...state.components, component],
    })),

  removeComponent: (id) =>
    set((state) => ({
      components: state.components.filter((c) => c.id !== id),
    })),

  // ── Project ────────────────────────────────────────────────────
  projectName: "Mi Proyecto ESP8266",
  projectSaved: true,
  lastSaved: null,

  setProjectName: (name) => set({ projectName: name }),
  setProjectSaved: (saved) => set({ projectSaved: saved, lastSaved: saved ? new Date().toISOString() : get().lastSaved }),

  // ── UI State ───────────────────────────────────────────────────
  showWifiIndicator: false,
  setShowWifiIndicator: (show) => set({ showWifiIndicator: show }),
}));

export default useSimulatorStore;
