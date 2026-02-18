/**
 * ESP8266Board — Realistic NodeMCU DevKit V3 board visualization
 *
 * Renders a photorealistic PCB board with:
 *   - Metal RF shield / antenna area at top
 *   - ESP8266 chip with WiFi symbol
 *   - Gold header pins along both edges (matching real NodeMCU)
 *   - Micro-USB connector at bottom
 *   - RST and FLASH tactile buttons
 *   - Builtin LED
 *   - Status indicators
 *
 * Listens to EventBus pin-change events for real-time visual updates.
 */

import { useState, useEffect } from "react";
import eventBus from "../../engine/eventBus.js";
import useSimulatorStore from "../../store/useSimulatorStore.js";
import Pin from "./Pin.jsx";
import LED from "./LED.jsx";
import BoardButton from "./Button.jsx";
import "./ESP8266Board.css";

// NodeMCU V3 pin layout — left side (top to bottom)
const LEFT_PINS = [
  { alias: "A0",   gpio: 17, label: "A0"  },
  { alias: "RSV",  gpio: null, label: "RSV" },
  { alias: "RSV",  gpio: null, label: "RSV" },
  { alias: "D10",  gpio: 1,  label: "SD3" },
  { alias: "D9",   gpio: 3,  label: "SD2" },
  { alias: "D7",   gpio: 13, label: "D7"  },
  { alias: "D6",   gpio: 12, label: "D6"  },
  { alias: "D5",   gpio: 14, label: "D5"  },
  { alias: "GND",  gpio: null, label: "GND" },
  { alias: "3V3",  gpio: null, label: "3V3" },
];

// NodeMCU V3 pin layout — right side (top to bottom)
const RIGHT_PINS = [
  { alias: "D0",   gpio: 16, label: "D0"  },
  { alias: "D1",   gpio: 5,  label: "D1"  },
  { alias: "D2",   gpio: 4,  label: "D2"  },
  { alias: "D3",   gpio: 0,  label: "D3"  },
  { alias: "D4",   gpio: 2,  label: "D4"  },
  { alias: "3V3",  gpio: null, label: "3V3" },
  { alias: "GND",  gpio: null, label: "GND" },
  { alias: "D8",   gpio: 15, label: "D8"  },
  { alias: "RX",   gpio: 3,  label: "RX"  },
  { alias: "TX",   gpio: 1,  label: "TX"  },
  { alias: "GND",  gpio: null, label: "GND" },
  { alias: "VIN",  gpio: null, label: "VIN" },
];

export default function ESP8266Board() {
  const [pinStates, setPinStates] = useState({});
  const [wifiActive, setWifiActive] = useState(false);
  const components = useSimulatorStore((s) => s.components);
  const engineState = useSimulatorStore((s) => s.engineState);

  useEffect(() => {
    const unsubPin = eventBus.on("pin-change", (data) => {
      setPinStates((prev) => ({
        ...prev,
        [data.pin]: {
          mode: data.mode,
          value: data.value,
          alias: data.alias,
          pwmValue: data.pwmValue ?? (data.value === 1 ? 1023 : 0),
          brightness: data.brightness ?? (data.value === 1 ? 1.0 : 0.0),
        },
      }));
    });
    const unsubReset = eventBus.on("gpio-reset", () => {
      setPinStates({});
      setWifiActive(false);
    });
    return () => { unsubPin(); unsubReset(); };
  }, []);

  useEffect(() => {
    if (engineState === "running") {
      const timer = setTimeout(() => setWifiActive(true), 500);
      return () => clearTimeout(timer);
    }
    setWifiActive(false);
  }, [engineState]);

  const getPinState = (gpio) =>
    gpio != null
      ? (pinStates[gpio] || { mode: null, value: 0, pwmValue: 0, brightness: 0 })
      : { mode: null, value: 0, pwmValue: 0, brightness: 0 };

  // Built-in LED brightness (GPIO2)
  const builtinBrightness = getPinState(2).brightness;

  return (
    <div className="board-wrapper">
      {/* External wired components */}
      {components.length > 0 && (
        <div className="external-components">
          {components.map((comp) => {
            if (comp.type === "LED") {
              return (
                <LED key={comp.id} pin={comp.pin}
                  color={comp.color || "#00ff88"}
                  label={comp.label || `LED (G${comp.pin})`} />
              );
            }
            if (comp.type === "Button") {
              return (
                <BoardButton key={comp.id} pin={comp.pin}
                  label={comp.label || `BTN (G${comp.pin})`} />
              );
            }
            return null;
          })}
        </div>
      )}

      {/* The NodeMCU board */}
      <div className="nodemcu-board">
        {/* Left pin header */}
        <div className="pin-header left">
          {LEFT_PINS.map((p, i) => {
            const ps = getPinState(p.gpio);
            return (
              <Pin key={`l-${i}`} gpio={p.gpio} alias={p.alias} label={p.label}
                mode={ps.mode} value={ps.value}
                pwmValue={ps.pwmValue} brightness={ps.brightness}
                side="left" isPower={["3V3","GND","VIN","RSV"].includes(p.alias)} />
            );
          })}
        </div>

        {/* PCB body */}
        <div className="pcb-body">
          {/* Antenna / RF shield */}
          <div className="antenna-area">
            <div className="rf-shield">
              <div className="rf-shield-inner">
                <svg className="wifi-symbol" viewBox="0 0 24 24" width="18" height="18">
                  <path d="M12 18c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z"
                    fill={wifiActive ? "#a6e3a1" : "#585b70"} />
                  <path d="M12 14c-1.7 0-3.24.69-4.35 1.8l1.41 1.41C9.98 16.29 10.93 15.9 12 15.9s2.02.39 2.94 1.31l1.41-1.41A6.1 6.1 0 0012 14z"
                    fill={wifiActive ? "#a6e3a1" : "#585b70"} opacity="0.8" />
                  <path d="M12 10c-2.81 0-5.36 1.14-7.2 2.99l1.41 1.42A8.09 8.09 0 0112 11.9c2.24 0 4.27.91 5.79 2.51l1.41-1.42A10.08 10.08 0 0012 10z"
                    fill={wifiActive ? "#a6e3a1" : "#585b70"} opacity="0.6" />
                  <path d="M12 6C8.07 6 4.52 7.58 1.96 10.14l1.42 1.42A12.04 12.04 0 0112 7.9c3.32 0 6.33 1.35 8.62 3.66l1.42-1.42A14.04 14.04 0 0012 6z"
                    fill={wifiActive ? "#a6e3a1" : "#585b70"} opacity="0.4" />
                </svg>
              </div>
            </div>
            <div className="antenna-trace" />
          </div>

          {/* ESP8266 main chip (QFN package) */}
          <div className="esp-chip">
            <div className="chip-pins-side left-side">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="chip-leg" />)}
            </div>
            <div className="chip-body">
              <span className="chip-text-main">ESP8266</span>
              <span className="chip-text-sub">EX · Espressif</span>
              <div className="chip-dot" />
            </div>
            <div className="chip-pins-side right-side">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="chip-leg" />)}
            </div>
          </div>

          {/* SMD components */}
          <div className="pcb-components">
            <div className="smd-ic">
              <div className="smd-ic-body">
                <span className="smd-ic-label">CH340G</span>
              </div>
              <div className="smd-ic-pins top">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="smd-pin" />)}
              </div>
              <div className="smd-ic-pins bottom">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="smd-pin" />)}
              </div>
            </div>
            <div className="smd-passives">
              <div className="smd-resistor" />
              <div className="smd-resistor" />
              <div className="smd-cap" />
              <div className="smd-resistor" />
            </div>
            <div className="smd-regulator">
              <span className="smd-reg-label">AMS1117</span>
            </div>
          </div>

          {/* Tactile push buttons */}
          <div className="board-buttons">
            <div className="tactile-btn">
              <div className="tactile-cap" />
              <span className="tactile-label">RST</span>
            </div>
            <div className="tactile-btn">
              <div className="tactile-cap" />
              <span className="tactile-label">FLASH</span>
            </div>
          </div>

          {/* Built-in SMD LED — PWM brightness driven */}
          <div className="builtin-led-row">
            <div
              className={`builtin-smd-led ${builtinBrightness > 0 ? "on" : ""}`}
              style={{
                "--led-brightness": builtinBrightness,
                "--led-glow-radius": `${6 + builtinBrightness * 14}px`,
              }}
            >
              <div className="smd-led-glow" />
            </div>
            <span className="builtin-led-text">LED</span>
          </div>

          {/* PCB traces (decorative) */}
          <div className="pcb-traces">
            <div className="trace t1" />
            <div className="trace t2" />
            <div className="trace t3" />
            <div className="trace t4" />
          </div>

          {/* Micro-USB connector */}
          <div className="usb-connector">
            <div className="usb-shell">
              <div className="usb-inner" />
            </div>
          </div>

          {/* Engine status */}
          <div className={`board-status ${engineState}`}>
            {engineState === "running" && "▸ RUN"}
            {engineState === "stopped" && "■ STOP"}
            {engineState === "idle" && "○ IDLE"}
            {engineState === "error" && "✖ ERR"}
          </div>
        </div>

        {/* Right pin header */}
        <div className="pin-header right">
          {RIGHT_PINS.map((p, i) => {
            const ps = getPinState(p.gpio);
            return (
              <Pin key={`r-${i}`} gpio={p.gpio} alias={p.alias} label={p.label}
                mode={ps.mode} value={ps.value}
                pwmValue={ps.pwmValue} brightness={ps.brightness}
                side="right" isPower={["3V3","GND","VIN","RSV"].includes(p.alias)} />
            );
          })}
        </div>
      </div>
    </div>
  );
}
