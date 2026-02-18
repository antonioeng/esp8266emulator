/**
 * LED — PWM-aware LED component with progressive brightness
 *
 * Rol: Representación visual de un LED conectado a un pin GPIO.
 * Arquitectura:
 *   - Escucha "pwm-change" para brillo progresivo (analogWrite)
 *   - Escucha "pin-change" como fallback digital (digitalWrite)
 *   - Escucha "gpio-reset" para apagar
 *   - brightness = pwmValue / 1023 → controla opacity, glow radius, color intensity
 *   - CSS transitions suavizan todo cambio de brillo (0.15s ease)
 *   - value = 0 → LED completamente OFF
 *   - value = 1023 → LED full brightness
 *   - Valores intermedios → brillo proporcional (NO binario)
 */

import { useState, useEffect, useRef } from "react";
import eventBus from "../../engine/eventBus.js";
import "./LED.css";

export default function LED({ pin, color = "#00ff88", label = "LED" }) {
  // brightness: 0.0 (off) → 1.0 (full)
  const [brightness, setBrightness] = useState(0);
  const [pwmRaw, setPwmRaw] = useState(0);
  const lastSourceRef = useRef("digital"); // "pwm" | "digital"

  useEffect(() => {
    // ── Primary: PWM events from analogWrite ─────────────────
    const unsubPwm = eventBus.on("pwm-change", (data) => {
      if (data.pin === pin) {
        lastSourceRef.current = "pwm";
        setBrightness(data.brightness);
        setPwmRaw(data.value);
      }
    });

    // ── Fallback: digital pin-change from digitalWrite ───────
    const unsubPin = eventBus.on("pin-change", (data) => {
      if (data.pin === pin) {
        // If this pin-change came from a PWM path, pwm-change
        // already handled it; only act on pure digital writes
        if (data.brightness !== undefined) return;
        lastSourceRef.current = "digital";
        const b = data.value === 1 ? 1.0 : 0.0;
        setBrightness(b);
        setPwmRaw(data.value === 1 ? 1023 : 0);
      }
    });

    // ── Reset ────────────────────────────────────────────────
    const unsubReset = eventBus.on("gpio-reset", () => {
      setBrightness(0);
      setPwmRaw(0);
      lastSourceRef.current = "digital";
    });

    return () => {
      unsubPwm();
      unsubPin();
      unsubReset();
    };
  }, [pin]);

  const isOn = brightness > 0;
  const percent = Math.round(brightness * 100);

  // Compute dynamic glow radius: 5px (dim) → 30px (full)
  const glowRadius = 5 + brightness * 25;

  return (
    <div className={`led-component ${isOn ? "on" : "off"}`}>
      <div
        className="led-bulb"
        style={{
          "--led-color": color,
          "--led-brightness": brightness,
          "--led-glow-radius": `${glowRadius}px`,
          "--led-glow-spread": `${glowRadius * 2}px`,
        }}
      >
        <div className="led-glass" />
        <div className="led-reflection" />
      </div>
      <div className="led-label">
        <span className="led-name">{label}</span>
        <span className="led-pin">GPIO{pin}</span>
        <span className={`led-state ${isOn ? "on" : ""}`}>
          {!isOn
            ? "OFF"
            : pwmRaw === 1023
              ? "ON"
              : `${percent}%`}
        </span>
        {isOn && pwmRaw > 0 && pwmRaw < 1023 && (
          <span className="led-pwm-value">{pwmRaw}/1023</span>
        )}
      </div>
    </div>
  );
}
