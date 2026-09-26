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
- 📊 **Results table** — row numbers, an always-expanded dialog for adding and editing documents, EJSON-aware filters for `find` / `count` / `aggregate` / `distinct`
- 🕑 **Query history** — per-connection history so you can rerun anything you’ve touched before
- 📥 **Import dialog** — drop in JSON / EJSON documents
- 🎯 **Keyboard-first UX** — thoughtful focus management (Base UI Dialogs) and shortcuts throughout
- 🌙 **Dark by default** — CodeMirror one-dark theme, easy on the eyes
- 🖥 **Cross-platform native builds** — Windows, macOS (Apple Silicon), and Linux
- 🤖 **Built-in MCP server** — point Claude, Cursor, or any MCP client at your live MongoDB connection (read tools plus gated document and collection writes; aggregation output stages can still write without approval)

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

## 🤖 MCP Server

MongoBuddy ships with a built-in [Model Context Protocol](https://modelcontextprotocol.io/) server so you can let Claude, Cursor, or any MCP-aware tool inspect the MongoDB connection you already have open in the app.

The server starts automatically on launch and exposes a Streamable HTTP endpoint:

```
http://localhost:27099/mcp
```

The MCP server uses the **active connection in the app** — open a connection in MongoBuddy and your MCP client will see the same databases and collections. Close the app and the server goes with it.

During initialization, the server instructs MCP clients to perform all MongoDB CRUD interactions exclusively through MongoBuddy MCP tools, using the app's active connection.

The HTTP server binds `0.0.0.0:27099` by default and has **no authentication**. Anyone who can reach it can run read tools on the active connection, propose writes (including approval-flood attempts), and run aggregation output stages without approval. Restrict access at your firewall/network boundary; do not expose this port to untrusted networks. MCP annotations and tool descriptions do not authorize writes.

### Tools

Most MCP tools read data. `insertOne`, `updateOne`, `deleteOne`, `updateMany`, `deleteMany`, `createCollection`, `renameCollection`, `emptyCollection`, `dropCollection`, `dropCollections`, `createIndex`, and `dropIndex` are standalone writes requiring explicit local approval for each request in the MongoBuddy GUI. Each proposal displays the exact command, active connection key (host, not a credential-bearing URI), database, collection target(s), and complete EJSON input (including a document identifier and replacement for `updateOne`, or index keys/name and options for `createIndex`); denial, timeout (60 seconds), lost GUI, client cancellation, or connection switch prevents execution. Empty-filter `deleteMany`, `emptyCollection`, and `dropCollection` additionally require typing the exact collection name; `dropCollections` requires the exact database name. Other writes require only an approval click. `updateOne`, `updateMany`, and `renameCollection` advertise destructive MCP annotations because replacing a document, removing fields, or removing an old namespace is not additive; this does not change their existing GUI approval requirements. **Exception:** `aggregate` accepts pipelines with `$out` or `$merge`, which can write without this approval gate.

| Tool | Purpose |
| --- | --- |
| `listDatabases` | List databases on the connected server |
| `listCollections` | List collections in a database |
| `sampleFields` | Sample a collection and return its top-level field names |
| `find` | Query documents (supports `filter`, `sort`, `skip`, `limit`, EJSON) |
| `count` | Count documents matching a filter |
| `aggregate` | Run an aggregation pipeline; `$out` and `$merge` can write to collections without GUI approval |
| `distinct` | Distinct values of a field |
| `listIndexes` | List indexes on a collection |
| `explain` | Return a query plan and execution stats |
| `insertOne` | **WRITE — MongoBuddy confirmation required.** Insert one EJSON document; review command, active connection key (host), namespace and complete input in the GUI, then approve once or deny. Denial, lost GUI, timeout (60 seconds), client cancellation or connection switch prevents execution. |
| `updateOne` | **WRITE — MongoBuddy confirmation required.** Replace one document selected by an EJSON `id`; the replacement excludes `_id`, and the returned record is read back from the collection (or `null` if none matches). Review the identifier and full replacement in the GUI before approving once. |
| `deleteOne` | **WRITE — MongoBuddy confirmation required.** Delete one document selected by an EJSON `id`; review the identifier and full input in the GUI before approving once. Returns `null` as valid MCP success text, including when no document matches. |
| `updateMany` | **WRITE — MongoBuddy confirmation required.** Update matching documents using an EJSON update document or pipeline; optional update options include `arrayFilters`. The dialog shows the full filter, update, and options; approval applies once to that input and returns matched/modified counts. |
| `deleteMany` | **WRITE — MongoBuddy confirmation required.** Delete matching documents and return the deleted count. A non-empty filter needs an approval click; `{}` also requires typing the exact collection name to approve deletion of all documents. Denial, lost GUI, timeout, cancellation, or connection switch prevents either write. |
| `createCollection` | **WRITE — MongoBuddy confirmation required.** Create an empty collection; review the target and complete input, then approve once. |
| `renameCollection` | **WRITE — MongoBuddy confirmation required.** Rename a collection within a database; review the exact source and destination names, then approve once. |
| `emptyCollection` | **WRITE — MongoBuddy confirmation required.** Delete all documents without dropping the collection and return the deleted count; type its exact collection name to approve. |
| `dropCollection` | **WRITE — MongoBuddy confirmation required.** Drop a collection and its data; type its exact collection name to approve. |
| `dropCollections` | **WRITE — MongoBuddy confirmation required.** Drop named collections in a database; type the exact database name to approve. Returns separate `dropped` names and `failed` entries with error messages when only some drops succeed. |
| `createIndex` | **WRITE — MongoBuddy confirmation required.** Create an index from key directions, an optional name and a uniqueness flag; review the keys, name (or MongoDB-generated name), options, and complete input before approving once. Returns the index name from MongoDB; invalid index specifications return the driver error. |
| `dropIndex` | **WRITE — MongoBuddy confirmation required.** Drop the named index after reviewing the name and complete input; the `_id_` index is protected. Returns `null` as valid MCP success text, or an error if MongoDB rejects the drop. |

### CLI flags

| Flag | Default | What it does |
| --- | --- | --- |
| `--mcp-port=N` | `27099` | Bind the MCP server to port `N` (1–65535) |
| `--disable-mcp` | off | Don’t start the MCP server |

### Wiring up a client

For [Claude Code](https://docs.claude.com/en/docs/claude-code), register the server with the `claude` CLI:

```bash
claude mcp add --transport http mongo-buddy http://localhost:27099/mcp
```

For other MCP clients that support Streamable HTTP, point them at the same URL. If you change the port with `--mcp-port=N`, update the URL to match.

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

`pnpm install` installs a pre-commit hook that runs ESLint with `--fix` on staged JavaScript and TypeScript files (including JSX/TSX). Fixed files are restaged automatically; remaining lint errors block the commit.

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
