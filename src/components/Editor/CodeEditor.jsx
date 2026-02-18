/**
 * CodeEditor — Editor de código Arduino profesional con Monaco Editor
 *
 * Rol: Interfaz de edición principal del simulador.
 * Características:
 *   - Syntax highlighting para Arduino/C++
 *   - Autocompletado básico de funciones Arduino
 *   - Validación en tiempo real (errores/warnings del parser)
 *   - Toolbar con botones Run, Stop, Reset, Connect Device
 *   - Indicador de modo (Simulación / Hardware)
 *
 * Principio: El editor NO ejecuta lógica de simulación.
 * Solo modifica el store y delega al engine vía servicios.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import Editor from "@monaco-editor/react";
import useSimulatorStore from "../../store/useSimulatorStore.js";
import simulatorEngine from "../../engine/simulatorEngine.js";
import serialService from "../../services/serialService.js";
import projectService from "../../services/projectService.js";
import { validateCode } from "../../engine/parser.js";
import "./CodeEditor.css";

// ── Definición del lenguaje Arduino para Monaco ────────────────────

const ARDUINO_LANGUAGE_ID = "arduino";

/**
 * Registra el lenguaje Arduino en Monaco (syntax + autocompletado).
 */
function registerArduinoLanguage(monaco) {
  // Registrar lenguaje si no existe
  if (!monaco.languages.getLanguages().some((l) => l.id === ARDUINO_LANGUAGE_ID)) {
    monaco.languages.register({ id: ARDUINO_LANGUAGE_ID });
  }

  // Tokenizer (syntax highlighting)
  monaco.languages.setMonarchTokensProvider(ARDUINO_LANGUAGE_ID, {
    keywords: [
      "void", "int", "float", "double", "char", "bool", "boolean",
      "byte", "long", "short", "unsigned", "signed", "const",
      "if", "else", "for", "while", "do", "switch", "case",
      "break", "continue", "return", "true", "false",
      "String", "HIGH", "LOW", "INPUT", "OUTPUT", "INPUT_PULLUP",
      "LED_BUILTIN", "struct", "class", "enum", "typedef",
      "static", "volatile", "extern",
    ],
    functions: [
      "pinMode", "digitalWrite", "digitalRead", "analogRead", "analogWrite",
      "delay", "delayMicroseconds", "millis", "micros",
      "map", "constrain", "min", "max", "abs", "pow", "sqrt",
      "setup", "loop",
    ],
    serialFunctions: [
      "begin", "print", "println", "available", "read",
      "write", "flush", "end",
    ],
    typeKeywords: ["void", "int", "float", "double", "char", "bool", "boolean", "byte", "long", "short", "String"],
    operators: ["=", ">", "<", "!", "~", "?", ":", "==", "<=", ">=", "!=", "&&", "||", "++", "--", "+", "-", "*", "/", "&", "|", "^", "%", "<<", ">>"],

    tokenizer: {
      root: [
        [/#\w+/, "keyword.directive"],
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/"[^"]*"/, "string"],
        [/'[^']*'/, "string"],
        [/\bSerial\b/, "type.identifier"],
        [/\b(D[0-8]|A0)\b/, "constant.numeric"],
        [
          /[a-zA-Z_]\w*/,
          {
            cases: {
              "@keywords": "keyword",
              "@functions": "keyword.function",
              "@typeKeywords": "type",
              "@default": "identifier",
            },
          },
        ],
        [/\d+/, "number"],
        [/[{}()\[\]]/, "bracket"],
        [/[;,.]/, "delimiter"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
    },
  });

  // Autocompletado
  monaco.languages.registerCompletionItemProvider(ARDUINO_LANGUAGE_ID, {
    provideCompletionItems: (model, position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const suggestions = [
        // Funciones principales
        {
          label: "pinMode",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "pinMode(${1:pin}, ${2|OUTPUT,INPUT,INPUT_PULLUP|});",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Configura modo de un pin GPIO",
          documentation: "pinMode(pin, mode)\nModos: OUTPUT, INPUT, INPUT_PULLUP",
          range,
        },
        {
          label: "digitalWrite",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "digitalWrite(${1:pin}, ${2|HIGH,LOW|});",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Escribe valor digital en un pin",
          documentation: "digitalWrite(pin, value)\nValores: HIGH (1) o LOW (0)",
          range,
        },
        {
          label: "digitalRead",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "digitalRead(${1:pin})",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Lee valor digital de un pin",
          range,
        },
        {
          label: "analogRead",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "analogRead(${1:A0})",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Lee valor analógico (0-1023)",
          range,
        },
        {
          label: "delay",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "delay(${1:1000});",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Pausa la ejecución (milisegundos)",
          range,
        },
        {
          label: "Serial.begin",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: "Serial.begin(${1|115200,9600,57600|});",
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Inicia comunicación serie",
          range,
        },
        {
          label: "Serial.println",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: 'Serial.println(${1:"mensaje"});',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Imprime línea en Serial Monitor",
          range,
        },
        {
          label: "Serial.print",
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: 'Serial.print(${1:"mensaje"});',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Imprime en Serial Monitor (sin salto de línea)",
          range,
        },
        // Templates
        {
          label: "setup-loop",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: [
            "void setup() {",
            "  Serial.begin(115200);",
            "  ${1:// Código de inicialización}",
            "}",
            "",
            "void loop() {",
            "  ${2:// Código principal}",
            "}",
          ].join("\n"),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Plantilla setup + loop",
          range,
        },
        {
          label: "blink",
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: [
            "void setup() {",
            "  pinMode(${1:2}, OUTPUT);",
            "}",
            "",
            "void loop() {",
            "  digitalWrite(${1:2}, HIGH);",
            "  delay(${2:1000});",
            "  digitalWrite(${1:2}, LOW);",
            "  delay(${2:1000});",
            "}",
          ].join("\n"),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: "Plantilla Blink LED",
          range,
        },
        // Constantes
        { label: "HIGH", kind: monaco.languages.CompletionItemKind.Constant, insertText: "HIGH", detail: "Valor digital alto (1)", range },
        { label: "LOW", kind: monaco.languages.CompletionItemKind.Constant, insertText: "LOW", detail: "Valor digital bajo (0)", range },
        { label: "OUTPUT", kind: monaco.languages.CompletionItemKind.Constant, insertText: "OUTPUT", detail: "Modo salida", range },
        { label: "INPUT", kind: monaco.languages.CompletionItemKind.Constant, insertText: "INPUT", detail: "Modo entrada", range },
        { label: "INPUT_PULLUP", kind: monaco.languages.CompletionItemKind.Constant, insertText: "INPUT_PULLUP", detail: "Modo entrada con pull-up interno", range },
        { label: "LED_BUILTIN", kind: monaco.languages.CompletionItemKind.Constant, insertText: "LED_BUILTIN", detail: "GPIO2 (D4) - LED integrado", range },
      ];

      return { suggestions };
    },
  });
}

// ── Componente React ───────────────────────────────────────────────

export default function CodeEditor() {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  const code = useSimulatorStore((s) => s.code);
  const setCode = useSimulatorStore((s) => s.setCode);
  const engineState = useSimulatorStore((s) => s.engineState);
  const connectionMode = useSimulatorStore((s) => s.connectionMode);
  const isConnected = useSimulatorStore((s) => s.isConnected);
  const projectName = useSimulatorStore((s) => s.projectName);
  const setProjectSaved = useSimulatorStore((s) => s.setProjectSaved);

  // Track page theme for Monaco
  const [editorTheme, setEditorTheme] = useState(
    () => document.documentElement.getAttribute("data-theme") === "light" ? "vs" : "vs-dark"
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute("data-theme");
      setEditorTheme(t === "light" ? "vs" : "vs-dark");
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  // Handlers
  const handleRun = useCallback(() => {
    simulatorEngine.run(code);
  }, [code]);

  const handleStop = useCallback(() => {
    simulatorEngine.stop();
  }, []);

  const handleReset = useCallback(() => {
    simulatorEngine.reset();
  }, []);

  const handleConnect = useCallback(async () => {
    if (isConnected) {
      await serialService.disconnect();
    } else {
      await serialService.connect();
    }
  }, [isConnected]);

  const handleSave = useCallback(async () => {
    await projectService.saveProject({
      name: projectName,
      code,
    });
    setProjectSaved(true);
  }, [code, projectName, setProjectSaved]);

  const handleExport = useCallback(() => {
    projectService.exportAsIno(projectName.replace(/\s+/g, "_"), code);
  }, [code, projectName]);

  const handleImport = useCallback(async () => {
    const result = await projectService.importIno();
    if (result) {
      setCode(result.code);
    }
  }, [setCode]);

  // Configurar Monaco al montar
  const handleEditorMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerArduinoLanguage(monaco);

    // Re-setear el modelo con el lenguaje Arduino
    const model = editor.getModel();
    monaco.editor.setModelLanguage(model, ARDUINO_LANGUAGE_ID);

    // Atajos de teclado
    editor.addAction({
      id: "run-code",
      label: "Run Code",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run: () => handleRun(),
    });

    editor.addAction({
      id: "save-project",
      label: "Save Project",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      run: () => handleSave(),
    });
  }, [handleRun, handleSave]);

  // Marcar como no guardado cuando cambia el código
  const handleCodeChange = useCallback(
    (value) => {
      setCode(value || "");
      setProjectSaved(false);
    },
    [setCode, setProjectSaved]
  );

  // Validación en tiempo real con markers de Monaco
  useEffect(() => {
    if (!monacoRef.current || !editorRef.current) return;
    const monaco = monacoRef.current;
    const model = editorRef.current.getModel();
    if (!model) return;

    const timer = setTimeout(() => {
      const { errors, warnings } = validateCode(code);

      const markers = [
        ...errors.map((e) => ({
          severity: monaco.MarkerSeverity.Error,
          message: e.message,
          startLineNumber: e.line,
          startColumn: 1,
          endLineNumber: e.line,
          endColumn: 1000,
        })),
        ...warnings.map((w) => ({
          severity: monaco.MarkerSeverity.Warning,
          message: w.message,
          startLineNumber: w.line,
          startColumn: 1,
          endLineNumber: w.line,
          endColumn: 1000,
        })),
      ];

      monaco.editor.setModelMarkers(model, "arduino-validator", markers);
    }, 500);

    return () => clearTimeout(timer);
  }, [code]);

  const isRunning = engineState === "running";

  return (
    <div className="code-editor">
      {/* Toolbar */}
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <button
            className={`toolbar-btn btn-run ${isRunning ? "active" : ""}`}
            onClick={handleRun}
            disabled={isRunning}
            title="Ejecutar (Ctrl+Enter)"
          >
            <span className="btn-icon">▶</span>
            {isRunning ? "Running…" : "Run"}
          </button>
          <button
            className="toolbar-btn btn-stop"
            onClick={handleStop}
            disabled={!isRunning}
            title="Detener"
          >
            <span className="btn-icon">■</span>
            Stop
          </button>
          <button
            className="toolbar-btn btn-reset"
            onClick={handleReset}
            title="Reset"
          >
            <span className="btn-icon">⟳</span>
            Reset
          </button>

          <div className="toolbar-separator" />

          <button
            className={`toolbar-btn btn-connect ${isConnected ? "connected" : ""}`}
            onClick={handleConnect}
            title={isConnected ? "Desconectar" : "Conectar ESP8266"}
          >
            <span className="btn-icon">{isConnected ? "⚡" : "🔌"}</span>
            {isConnected ? "Disconnect" : "Connect"}
          </button>
        </div>

        <div className="toolbar-right">
          <button className="toolbar-btn btn-secondary" onClick={handleSave} title="Guardar (Ctrl+S)">
            💾 Save
          </button>
          <button className="toolbar-btn btn-secondary" onClick={handleExport} title="Exportar .ino">
            📤 Export
          </button>
          <button className="toolbar-btn btn-secondary" onClick={handleImport} title="Importar archivo">
            📥 Import
          </button>
        </div>
      </div>

      {/* Mode Badge */}
      <div className={`mode-badge ${connectionMode}`}>
        {connectionMode === "simulation" ? "🔬 SIMULATION MODE" : "🔌 HARDWARE MODE"}
      </div>

      {/* Monaco Editor */}
      <div className="editor-container">
        <Editor
          height="100%"
          defaultLanguage="cpp"
          theme={editorTheme}
          value={code}
          onChange={handleCodeChange}
          onMount={handleEditorMount}
          options={{
            fontSize: 14,
            fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
            fontLigatures: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
            lineNumbers: "on",
            renderLineHighlight: "all",
            bracketPairColorization: { enabled: true },
            padding: { top: 12 },
            smoothScrolling: true,
            cursorSmoothCaretAnimation: "on",
            cursorBlinking: "smooth",
          }}
        />
      </div>
    </div>
  );
}
