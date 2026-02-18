/**
 * Terminal — Consola profesional estilo IDE (Serial Monitor)
 *
 * Rol: Muestra los logs de la simulación y del hardware real.
 * Características:
 *   - Timestamp automático en cada línea
 *   - Colores por tipo: info (verde), warn (amarillo), error (rojo)
 *   - Autoscroll inteligente (se pausa si el usuario hace scroll arriba)
 *   - Comando "clear" para limpiar
 *   - Input para enviar datos al serial (modo hardware)
 *   - Indicador de fuente (Simulación vs Hardware)
 *
 * Escucha eventos "serial-log" del EventBus.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import eventBus from "../../engine/eventBus.js";
import useSimulatorStore from "../../store/useSimulatorStore.js";
import "./Terminal.css";

export default function Terminal() {
  const logs = useSimulatorStore((s) => s.logs);
  const addLog = useSimulatorStore((s) => s.addLog);
  const clearLogs = useSimulatorStore((s) => s.clearLogs);

  const [autoScroll, setAutoScroll] = useState(true);
  const logsEndRef = useRef(null);
  const containerRef = useRef(null);

  // Escuchar eventos de serial-log del EventBus
  useEffect(() => {
    const unsub = eventBus.on("serial-log", (data) => {
      addLog(data);
    });
    return unsub;
  }, [addLog]);

  // Autoscroll inteligente
  useEffect(() => {
    if (autoScroll && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // Detectar si el usuario scrollea arriba → pausar autoscroll
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(isAtBottom);
  }, []);

  const getTypeClass = (type) => {
    switch (type) {
      case "error": return "log-error";
      case "warn": return "log-warn";
      default: return "log-info";
    }
  };

  const getTypePrefix = (type) => {
    switch (type) {
      case "error": return "ERR";
      case "warn": return "WRN";
      default: return "INF";
    }
  };

  return (
    <div className="terminal">
      {/* Header */}
      <div className="terminal-header">
        <div className="terminal-title">
          <span className="terminal-icon">⬛</span>
          Serial Monitor
          <span className="log-count">{logs.length}</span>
        </div>
        <div className="terminal-actions">
          {!autoScroll && (
            <button
              className="terminal-btn"
              onClick={() => {
                setAutoScroll(true);
                logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
              title="Scroll al final"
            >
              ↓ Auto
            </button>
          )}
          <button
            className="terminal-btn"
            onClick={clearLogs}
            title="Limpiar consola"
          >
            🗑 Clear
          </button>
        </div>
      </div>

      {/* Log Output */}
      <div
        className="terminal-output"
        ref={containerRef}
        onScroll={handleScroll}
      >
        {logs.length === 0 && (
          <div className="terminal-empty">
            <span className="empty-icon">📡</span>
            <span>Serial Monitor listo. Ejecuta el código para ver los logs.</span>
            <span className="empty-hint">Escribe "clear" para limpiar la consola</span>
          </div>
        )}

        {logs.map((log) => (
          <div key={log.id} className={`log-line ${getTypeClass(log.type)}`}>
            <span className="log-timestamp">{log.timestamp}</span>
            <span className={`log-type-badge ${log.type}`}>
              {getTypePrefix(log.type)}
            </span>
            {log.source === "hardware" && (
              <span className="log-source-badge">HW</span>
            )}
            <span className="log-message">{log.message}</span>
          </div>
        ))}

        <div ref={logsEndRef} />
      </div>
    </div>
  );
}
