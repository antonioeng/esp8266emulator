/**
 * App.jsx — Componente raíz del ESP8266 Simulator
 *
 * Rol: Layout principal de la aplicación. Organiza los tres paneles:
 *   1. Editor de código (izquierda)
 *   2. Placa ESP8266 (centro-derecha)
 *   3. Terminal / Serial Monitor (inferior)
 *
 * Responsabilidades:
 *   - Inicializar conexión EventBus ↔ Zustand store
 *   - Cargar proyecto guardado (localStorage)
 *   - Iniciar autosave
 *   - Detectar soporte WebSerial
 */

import { useEffect, useRef, useCallback, useState } from "react";
import CodeEditor from "./components/Editor/CodeEditor.jsx";
import ESP8266Board from "./components/Board/ESP8266Board.jsx";
import Terminal from "./components/Console/Terminal.jsx";
import useSimulatorStore from "./store/useSimulatorStore.js";
import eventBus from "./engine/eventBus.js";
import serialService from "./services/serialService.js";
import projectService from "./services/projectService.js";
import "./App.css";

// ── Theme helper ──────────────────────────────────────────────────
function getInitialTheme() {
  try {
    return localStorage.getItem("esp-sim-theme") || "dark";
  } catch { return "dark"; }
}

export default function App() {
  const setEngineState = useSimulatorStore((s) => s.setEngineState);
  const setConnectionMode = useSimulatorStore((s) => s.setConnectionMode);
  const setConnected = useSimulatorStore((s) => s.setConnected);
  const setCode = useSimulatorStore((s) => s.setCode);
  const setProjectName = useSimulatorStore((s) => s.setProjectName);
  const setProjectSaved = useSimulatorStore((s) => s.setProjectSaved);
  const connectionMode = useSimulatorStore((s) => s.connectionMode);
  const projectName = useSimulatorStore((s) => s.projectName);
  const projectSaved = useSimulatorStore((s) => s.projectSaved);
  const lastSaved = useSimulatorStore((s) => s.lastSaved);

  // ── Theme toggle ─────────────────────────────────────────────────
  const [theme, setTheme] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("esp-sim-theme", theme); } catch {}
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === "dark" ? "light" : "dark"));
  }, []);

  // ── Resize logic ─────────────────────────────────────────────────
  const [sidebarWidth, setSidebarWidth] = useState(null); // null = use CSS default 50%
  const isDragging = useRef(false);
  const mainRef = useRef(null);

  const handleMouseDown = useCallback((e) => {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }, []);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging.current || !mainRef.current) return;
      const rect = mainRef.current.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      const minW = 280;
      const maxW = rect.width - 280;
      setSidebarWidth(Math.max(minW, Math.min(maxW, newWidth)));
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        isDragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // ── Inicialización ───────────────────────────────────────────────
  useEffect(() => {
    // 1. Suscribir store a eventos del engine
    const unsubEngine = eventBus.on("engine-state", (data) => {
      setEngineState(data.state);
    });

    const unsubConnection = eventBus.on("connection-change", (data) => {
      setConnected(data.connected);
      setConnectionMode(data.mode);
    });

    // 2. Detectar soporte WebSerial
    if (!serialService.isSupported()) {
      setConnectionMode("simulation");
    }

    // 3. Cargar proyecto guardado
    projectService.loadCurrentProject().then((project) => {
      if (project) {
        setCode(project.code);
        setProjectName(project.name || "Mi Proyecto ESP8266");
        setProjectSaved(true);
      }
    });

    // 4. Iniciar autosave
    projectService.startAutosave(
      () => ({
        name: useSimulatorStore.getState().projectName,
        code: useSimulatorStore.getState().code,
      }),
      () => {
        useSimulatorStore.getState().setProjectSaved(true);
      }
    );

    return () => {
      unsubEngine();
      unsubConnection();
      projectService.stopAutosave();
    };
  }, []);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <span className="logo-icon">⚡</span>
            <span className="logo-text">ESP8266 Simulator</span>
            <span className="logo-version">v1.0</span>
          </div>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? "☀️" : "🌙"}
          </button>
        </div>
        <div className="header-center">
          <input
            className="project-name-input"
            value={projectName}
            onChange={(e) => {
              setProjectName(e.target.value);
              setProjectSaved(false);
            }}
            spellCheck={false}
          />
          {!projectSaved && <span className="unsaved-dot" title="Cambios sin guardar">●</span>}
          {projectSaved && lastSaved && (
            <span className="saved-indicator" title={`Guardado: ${new Date(lastSaved).toLocaleTimeString()}`}>
              ✓
            </span>
          )}
        </div>
        <div className="header-right">
          <span className={`connection-badge ${connectionMode}`}>
            {connectionMode === "simulation" ? "🔬 Simulación" : "🔌 Hardware"}
          </span>
        </div>
      </header>

      {/* Main Layout */}
      <main className="app-main" ref={mainRef}>
        {/* Left Panel — Code Editor */}
        <div
          className="panel panel-sidebar"
          style={sidebarWidth ? { width: sidebarWidth, flexShrink: 0 } : undefined}
        >
          <CodeEditor />
          {/* Terminal below editor */}
          <div className="panel-terminal-inline">
            <Terminal />
          </div>
        </div>

        {/* Resize Handle */}
        <div className="resize-handle" onMouseDown={handleMouseDown} />

        {/* Right Panel — Simulation Canvas */}
        <div className="panel panel-canvas">
          <div className="simulation-area">
            <div className="simulation-header">
              <span className="sim-tab active">Simulation</span>
            </div>
            <div className="simulation-canvas">
              <ESP8266Board />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
