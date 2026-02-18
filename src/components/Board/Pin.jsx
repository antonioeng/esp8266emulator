/**
 * Pin — Realistic gold through-hole header pin
 *
 * Renders as a gold circle (mimicking a real header pin seen from above)
 * with a rotated label next to it. Supports:
 *   - Visual state: HIGH (green glow) / LOW (default gold)
 *   - Mode indicator: INPUT pins are clickable to toggle
 *   - Tooltip on hover with full pin details
 *   - Power/GND pins shown in distinct colors
 */

import { useState, useCallback } from "react";
import gpioManager from "../../engine/gpioManager.js";
import "./Pin.css";

export default function Pin({ gpio, alias, label, mode, value, side, isPower, pwmValue = 0, brightness = 0 }) {
  const [showTooltip, setShowTooltip] = useState(false);

  const isOutput = mode === "OUTPUT";
  const isHigh = value === 1;
  const isConfigured = mode !== null && mode !== undefined;
  const isGpio = gpio != null && !isPower;

  const handleClick = useCallback(() => {
    if (isGpio && !isOutput && isConfigured) {
      gpioManager.setExternalValue(gpio, isHigh ? 0 : 1);
    }
  }, [gpio, isGpio, isOutput, isConfigured, isHigh]);

  const pinClass = [
    "hdr-pin",
    side,
    isPower ? "power" : "",
    isConfigured ? "configured" : "",
    isHigh ? "high" : "",
    isOutput ? "output" : "input",
    isGpio && !isOutput && isConfigured ? "clickable" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={pinClass}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      onClick={handleClick}
    >
      {/* Pin label (rotated text along the edge) */}
      {side === "left" && (
        <span className="hdr-label left-label">{label || alias || `G${gpio}`}</span>
      )}

      {/* Gold pin circle */}
      <div className={`hdr-dot ${isHigh ? "high" : ""} ${isPower ? (alias === "GND" ? "gnd" : "pwr") : ""}`} />

      {side === "right" && (
        <span className="hdr-label right-label">{label || alias || `G${gpio}`}</span>
      )}

      {/* Tooltip */}
      {showTooltip && isGpio && (
        <div className={`hdr-tooltip ${side}`}>
          <div className="tt-row">
            <span className="tt-key">GPIO</span>
            <span className="tt-val">{gpio}</span>
          </div>
          {alias && (
            <div className="tt-row">
              <span className="tt-key">Alias</span>
              <span className="tt-val">{alias}</span>
            </div>
          )}
          <div className="tt-row">
            <span className="tt-key">Mode</span>
            <span className="tt-val">{mode || "—"}</span>
          </div>
          <div className="tt-row">
            <span className="tt-key">State</span>
            <span className={`tt-val ${isHigh ? "v-high" : "v-low"}`}>
              {isHigh ? "HIGH" : "LOW"}
            </span>
          </div>
          {pwmValue > 0 && pwmValue < 1023 && (
            <div className="tt-row">
              <span className="tt-key">PWM</span>
              <span className="tt-val v-pwm">
                {pwmValue}/1023 ({Math.round(brightness * 100)}%)
              </span>
            </div>
          )}
          {!isOutput && isConfigured && (
            <div className="tt-hint">Click to toggle</div>
          )}
        </div>
      )}
    </div>
  );
}
