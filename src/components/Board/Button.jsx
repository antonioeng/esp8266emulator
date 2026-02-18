/**
 * BoardButton — Componente visual de un botón físico simulado
 *
 * Rol: Simula un botón físico conectado a un pin GPIO del ESP8266.
 * Comportamiento:
 *   - Mousedown → pin LOW (presionado, activo bajo)
 *   - Mouseup → pin HIGH (suelto, pull-up)
 *   - Configurable como activo alto o bajo
 */

import { useState, useCallback, useEffect } from "react";
import gpioManager from "../../engine/gpioManager.js";
import eventBus from "../../engine/eventBus.js";
import "./Button.css";

export default function BoardButton({ pin, label = "BTN", activeLow = true }) {
  const [pressed, setPressed] = useState(false);

  const handlePress = useCallback(() => {
    setPressed(true);
    gpioManager.setExternalValue(pin, activeLow ? 0 : 1);
  }, [pin, activeLow]);

  const handleRelease = useCallback(() => {
    setPressed(false);
    gpioManager.setExternalValue(pin, activeLow ? 1 : 0);
  }, [pin, activeLow]);

  // Reset
  useEffect(() => {
    const unsub = eventBus.on("gpio-reset", () => setPressed(false));
    return unsub;
  }, []);

  return (
    <div className={`board-button ${pressed ? "pressed" : ""}`}>
      <button
        className="btn-physical"
        onMouseDown={handlePress}
        onMouseUp={handleRelease}
        onMouseLeave={handleRelease}
        onTouchStart={handlePress}
        onTouchEnd={handleRelease}
      >
        <div className="btn-cap" />
      </button>
      <div className="btn-info">
        <span className="btn-label">{label}</span>
        <span className="btn-pin">GPIO{pin}</span>
      </div>
    </div>
  );
}
