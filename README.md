# CubicJ Brewing

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Desktop-brightgreen)
![Version](https://img.shields.io/badge/version-0.1.0-orange)

An [Obsidian](https://obsidian.md) plugin for coffee brewing — real-time BLE scale integration, guided brew flow, and structured record keeping, all inside your vault.

> Currently supports **Acaia Pearl S** on **Windows**. Other Acaia models and platforms are planned.

<p align="center">
  <img src="assets/sidebar.png" alt="Brewing sidebar with real-time scale display" width="360">
  <br>
  <em>Dot-matrix scale display with 6-step guided brew flow</em>
</p>

## Features

### BLE Scale Integration
- Direct Bluetooth LE connection to Acaia Pearl S via [@stoprocent/noble](https://github.com/nicedoc/noble) — no companion app required
- Real-time weight display with stability indicator (10Hz)
- Timer sync from scale, tare, and power off commands
- Auto-reconnect with tiered silence detection and write health monitoring
- Global hotkeys for hands-free operation (connect, tare, start/stop brew)

### Guided Brew Flow
- 6-step accordion UI: method → bean → parameters → brew → profile → save
- Filter and espresso modes with method-specific parameter sets
- Recipe reference during brewing (vault-based YAML recipes)
- Real-time brew profile chart (Canvas 2D, dual-curve: raw + smoothed)
- Signal processing pipeline: spike filter → Savitzky-Golay / EMA smoothing

<p>
  <img src="assets/brews-data.png" alt="Brew record detail with profile chart" width="720">
  <br>
  <em>Brew record with weight-over-time profile chart and extraction parameters</em>
</p>

### Bean & Record Management
- Bean notes with frontmatter metadata (origin, roaster, roast date, weight tracking)
- Automatic roast-days calculation and refresh
- Per-bean brew history via `brews` code blocks
- Equipment registry (grinders, drippers, filters, baskets, accessories)
- Brew profiles stored as JSON — weight-over-time curves for every brew

<p>
  <img src="assets/beans-data.png" alt="Bean inventory with roast days and remaining weight" width="720">
  <br>
  <em>Bean inventory — roast days, remaining weight, and status tracking per bean</em>
</p>

### Vault-Native Storage
- All data lives in your vault as plain files — Obsidian Sync compatible
- Bean/recipe discovery via Obsidian's metadata cache
- No external database, no cloud dependency

## Architecture

```
8,200+ lines TypeScript · 119 tests (vitest) · esbuild CommonJS bundle
```

| Layer | Key Components |
|-------|----------------|
| **BLE** | Binary protocol codec, packet buffer (fragmentation handling), typed EventEmitter service |
| **Brew State** | 6-step finite state machine with step guards and discriminated union records |
| **Signal** | Median spike filter, Savitzky-Golay smoothing (order 2), EMA trend line |
| **Storage** | File-adapter abstraction, JSON CRUD with schema validation, corrupt-file backup |
| **Views** | Accordion manager, stepper component, Canvas 2D chart, code block processors |

## Requirements

- **Obsidian Desktop** (Electron-based — BLE requires native addon)
- **Windows** with Bluetooth LE support
- **Acaia Pearl S** scale

> macOS/Linux support depends on [@stoprocent/noble](https://github.com/nicedoc/noble) platform compatibility. Not tested yet.

## Installation

### Manual Install (GitHub Release)

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/cubicj/CubicJ-Brewing/releases/latest)
2. Create folder: `<your-vault>/.obsidian/plugins/cubicj-brewing/`
3. Copy the three files into the folder
4. Restart Obsidian → Settings → Community plugins → Enable "CubicJ Brewing"

### Build from Source

```bash
git clone https://github.com/cubicj/CubicJ-Brewing.git
cd CubicJ-Brewing
npm install
npm run build
```

Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin directory.

## Development

```bash
npm run dev          # watch mode + auto-copy to vault
npm run build        # test → typecheck → production build
npm run test         # vitest (single run)
npm run test:watch   # vitest (watch mode)
npm run check        # typecheck only
npm run lint         # eslint
```

## Acknowledgments

- [Matrix Sans](https://github.com/FriedOrange/MatrixSans) dot-matrix font — [SIL Open Font License 1.1](FONT-LICENSE-OFL.txt)

## License

[MIT](LICENSE)
