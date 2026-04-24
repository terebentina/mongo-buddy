<div align="center">

<img src="build/icon.png" alt="MongoBuddy" width="128" height="128" />

# MongoBuddy

**A fast, friendly, lightweight MongoDB GUI client for macOS, Windows, and Linux.**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)
[![Latest release](https://img.shields.io/github/v/release/terebentina/mongo-buddy?color=blue)](https://github.com/terebentina/mongo-buddy/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/terebentina/mongo-buddy/total?color=brightgreen)](https://github.com/terebentina/mongo-buddy/releases)
![Electron](https://img.shields.io/badge/Electron-41-47848F?logo=electron&logoColor=white)
![Platforms](https://img.shields.io/badge/platforms-win%20%7C%20mac%20%7C%20linux-lightgrey)

</div>

<!-- TODO: replace with docs/screenshots/hero.png once captured -->
<p align="center">
  <img src="https://placehold.co/1600x900/1e1e2e/cdd6f4?text=MongoBuddy" alt="MongoBuddy main window" />
</p>

MongoBuddy is an open-source desktop MongoDB client built for developers who want a snappy, keyboard-first alternative to heavier GUIs. Connect to any MongoDB instance, run queries and aggregations, edit documents inline, and keep your query history — all in a clean native app.

---

## ✨ Features

- 🔌 **Multi-connection manager** — save and switch between MongoDB connections, credentials stored locally via `electron-store`
- ⌨️ **Powerful query editor** — CodeMirror 6 with JavaScript/JSON syntax highlighting, autocomplete, bracket matching, undo/redo, `Ctrl+F` search and `Ctrl+H` replace
- 📊 **Results table** — row numbers, inline document editor, EJSON-aware filters for `find` / `count` / `aggregate` / `distinct`
- 🕑 **Query history** — per-connection history so you can rerun anything you’ve touched before
- 📥 **Import dialog** — drop in JSON / EJSON documents
- 🎯 **Keyboard-first UX** — thoughtful focus management (Base UI Dialogs) and shortcuts throughout
- 🌙 **Dark by default** — CodeMirror one-dark theme, easy on the eyes
- 🖥 **Cross-platform native builds** — Windows, macOS (Apple Silicon), and Linux

---

## 📸 Screenshots

<!-- TODO: replace placehold.co URLs with real screenshots at docs/screenshots/{connection,query,document,history}.png -->

| Connection dialog | Query editor |
| --- | --- |
| ![Connection dialog](https://placehold.co/800x500?text=Connection+Dialog) | ![Query editor](https://placehold.co/800x500?text=Query+Editor) |

| Document editor | Query history |
| --- | --- |
| ![Document editor](https://placehold.co/800x500?text=Document+Editor) | ![Query history](https://placehold.co/800x500?text=Query+History) |

---

## 📥 Download & Install

Grab the latest build from **[Releases →](https://github.com/terebentina/mongo-buddy/releases/latest)**.

| OS | File | Notes |
| --- | --- | --- |
| 🪟 Windows | `MongoBuddy-Setup-X.Y.Z.exe` | NSIS installer, x64 |
| 🍎 macOS | `MongoBuddy-X.Y.Z-arm64.dmg` | ⚠️ **Apple Silicon only** — Intel Macs not yet supported (see [Roadmap](#-roadmap)) |
| 🐧 Linux | `MongoBuddy-X.Y.Z.AppImage` or `mongo-buddy_X.Y.Z_amd64.deb` | AppImage (portable) or Debian package |

> The app is not yet code-signed, so your OS may show a “publisher unknown” warning the first time you open it. That’s on the roadmap.

---

## 🚀 Quick Start

1. **Download** the build for your OS from [Releases](https://github.com/terebentina/mongo-buddy/releases/latest)
2. **Open** MongoBuddy
3. **Add a connection** — paste any MongoDB URI (`mongodb://…` or `mongodb+srv://…`) and hit connect

That’s it. Pick a database, pick a collection, and start querying.

---

## 🛠 Development

Want to hack on MongoBuddy? Everything runs locally.

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [pnpm 10+](https://pnpm.io/)

### Setup

```bash
git clone https://github.com/terebentina/mongo-buddy.git
cd mongo-buddy
pnpm install
pnpm dev
```

### Scripts

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run the app in development with hot reload |
| `pnpm build` | Build the app bundles |
| `pnpm test` | Run main + renderer Vitest suites |
| `pnpm lint` | ESLint over `src/` |
| `pnpm typecheck` | TypeScript check (node + web) |
| `pnpm format` | Prettier write |
| `pnpm release` | Bump version, tag, push — triggers GitHub Actions to build Win/Mac/Linux artifacts and attach them to the release |

### Project layout

```
src/
├── main/        # Electron main process — Mongo service, IPC handlers, stores
├── preload/     # Preload bridge
├── renderer/    # React 19 + Tailwind UI
└── shared/      # Shared TypeScript types
```

### Commit convention

We use [Conventional Commits](https://www.conventionalcommits.org/) — `commit-and-tag-version` reads them to generate the CHANGELOG and pick the next version.

```
feat(editor): add bracket matching
fix(connection): handle SRV records with no TXT
```

---

## 🧪 Tech Stack

Electron 41 · React 19 · TypeScript · Vite · Tailwind v4 · [Base UI](https://base-ui.com/) · CodeMirror 6 · MongoDB Node driver 7 · Zustand · Vitest

---

## 🗺 Roadmap

Ideas on deck — contributions very welcome:

- macOS Intel (x64) build
- Auto-update via `electron-updater`
- SSH tunnel support
- Schema visualization
- Export results (CSV / JSON / BSON)
- Code-signed Windows + macOS builds

Open an issue if you want to tackle one — or suggest your own.

---

## 🤝 Contributing

PRs are welcome! A few ground rules:

- For anything non-trivial, open an issue first so we can align
- Follow [Conventional Commits](https://www.conventionalcommits.org/)
- Before opening a PR, run `pnpm lint && pnpm test`

A proper `CONTRIBUTING.md` is on the way.

---

## 📜 License

[MIT](./LICENSE) © 2026 Dan Caragea

---

## 🙏 Credits

Built on the shoulders of giants: [Electron](https://www.electronjs.org/), [MongoDB](https://www.mongodb.com/), [CodeMirror](https://codemirror.net/), [Base UI](https://base-ui.com/), [Tailwind CSS](https://tailwindcss.com/), and many more.
