# ⚡ ESP8266 Simulator

A browser-based ESP8266 (NodeMCU) simulator built with React. Write Arduino-style C++ code, run it in the browser, and see real-time GPIO, PWM, and Serial output — no hardware required.

🔗 **Live Demo:** [antonioeng.github.io/esp8266emulator](https://antonioeng.github.io/esp8266emulator/)

---

## ✨ Features

- **Monaco Code Editor** — Full-featured editor with Arduino/C++ syntax highlighting, autocomplete, and error markers
- **Real-time Simulation** — Execute `setup()` and `loop()` cycles directly in the browser
- **GPIO & PWM Support** — `pinMode`, `digitalWrite`, `digitalRead`, `analogRead`, `analogWrite` with full PWM brightness control (0–1023)
- **Serial Monitor** — `Serial.begin()`, `Serial.print()`, `Serial.println()` output displayed in a built-in terminal
- **Realistic Board Visualization** — NodeMCU-style PCB with labeled pins, built-in SMD LED, antenna, USB connector, and tactile buttons
- **External Components** — Connect LEDs to any GPIO pin with progressive PWM brightness
- **Light & Dark Themes** — Catppuccin Mocha (dark) and Catppuccin Latte (light) with one-click toggle
- **Project Management** — Auto-save, rename projects, export/import `.ino` files
- **Resizable Panels** — Drag to resize editor and simulation panels

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| UI Framework | React 19 |
| Build Tool | Vite 7 |
| State Management | Zustand |
| Code Editor | Monaco Editor (`@monaco-editor/react`) |
| Styling | CSS Custom Properties + Catppuccin |
| Deployment | GitHub Pages via GitHub Actions |

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm 9+

### Install & Run

```bash
git clone https://github.com/antonioeng/esp8266emulator.git
cd esp8266emulator
npm install
npm run dev
```

Open [http://localhost:5173/esp8266emulator/](http://localhost:5173/esp8266emulator/) in your browser.

### Build for Production

```bash
npm run build
npm run preview
```

## 📁 Project Structure

```
src/
├── engine/
│   ├── eventBus.js          # Pub/Sub event system
│   ├── gpioManager.js       # GPIO & PWM pin management
│   ├── parser.js            # Arduino C++ → JavaScript transpiler
│   └── simulatorEngine.js   # Simulation orchestrator
├── components/
│   ├── Board/
│   │   ├── ESP8266Board.jsx # NodeMCU board visualization
│   │   ├── LED.jsx          # PWM-aware LED component
│   │   └── Pin.jsx          # GPIO pin with tooltip
│   ├── Editor/
│   │   └── CodeEditor.jsx   # Monaco editor + toolbar
│   └── Console/
│       └── Terminal.jsx      # Serial monitor output
├── store/
│   └── useSimulatorStore.js # Zustand global state
├── services/
│   ├── projectService.js    # Save/load/autosave
│   └── serialService.js     # WebSerial bridge (optional)
├── App.jsx                  # Root layout & theme management
└── index.css                # Theme variables (Catppuccin)
```

## 🎮 Supported Arduino API

| Category | Functions |
|----------|-----------|
| GPIO | `pinMode()`, `digitalWrite()`, `digitalRead()` |
| Analog | `analogRead()`, `analogWrite()` (PWM 0–1023) |
| Serial | `Serial.begin()`, `Serial.print()`, `Serial.println()` |
| Timing | `delay()`, `millis()`, `micros()` |
| Constants | `HIGH`, `LOW`, `OUTPUT`, `INPUT`, `INPUT_PULLUP`, `LED_BUILTIN` |
| Types | `int`, `long`, `bool`, `uint8_t`, `uint16_t`, `uint32_t`, `String`, `size_t` |

## 📝 License

MIT

## 👤 Author

**antonioeng** — [GitHub](https://github.com/antonioeng)
