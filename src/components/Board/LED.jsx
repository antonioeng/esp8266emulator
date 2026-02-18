/**
 * LED — Componente visual de un LED
 *
 * Rol: Representación visual de un LED conectado a un pin GPIO.
 * Características:
 *   - Animación glow realista cuando está encendido
 *   - Color configurable
 *   - Etiqueta con pin asociado
 *   - Reacciona al evento "component-update" del EventBus
 */

import { useState, useEffect } from "react";
import eventBus from "../../engine/eventBus.js";
import "./LED.css";

export default function LED({ pin, color = "#00ff88", label = "LED" }) {
  const [isOn, setIsOn] = useState(false);

  useEffect(() => {
    const unsubPin = eventBus.on("pin-change", (data) => {
      if (data.pin === pin) {
        setIsOn(data.value === 1);
      }
    });

    const unsubReset = eventBus.on("gpio-reset", () => {
      setIsOn(false);
    });

    return () => {
      unsubPin();
      unsubReset();
    };
  }, [pin]);

  return (
    <div className={`led-component ${isOn ? "on" : "off"}`}>
      <div
        className="led-bulb"
        style={{
          "--led-color": color,
          "--led-glow": `${color}80`,
          "--led-glow-strong": `${color}40`,
        }}
      >
        <div className="led-glass" />
        <div className="led-reflection" />
      </div>
      <div className="led-label">
        <span className="led-name">{label}</span>
        <span className="led-pin">GPIO{pin}</span>
        <span className={`led-state ${isOn ? "on" : ""}`}>
          {isOn ? "ON" : "OFF"}
        </span>
      </div>
    </div>
  );
}
