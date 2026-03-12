# FreeTodo Tauri Packaging Guide (Web Mode)

This document describes how to build and locate Tauri packaging outputs for the **Web mode** app.

Island mode is **not packaged** yet (still in development).

## Table of Contents

- [Quick Start](#quick-start)
- [Build Outputs](#build-outputs)
- [Build Notes](#build-notes)
- [Troubleshooting](#troubleshooting)

## Quick Start

Run from the repository root:

```bash
cd free-todo-frontend

# Web mode (default)
pnpm build:tauri:web:full

# Platform specific
pnpm build:tauri:web:full:win
pnpm build:tauri:web:full:mac
pnpm build:tauri:web:full:linux
```

## Build Outputs

Tauri build artifacts are written under:

```
free-todo-frontend/src-tauri/target/<profile>/bundle/
```

Where `<profile>` is:
- `release` for `tauri build` (default)
- `debug` for `tauri build --debug`

### Windows (NSIS)

```
free-todo-frontend/src-tauri/target/release/bundle/nsis/
  FreeTodo_<version>_x64-setup.exe
```

### macOS (app / dmg)

```
free-todo-frontend/src-tauri/target/release/bundle/macos/
  FreeTodo.app
  FreeTodo_<version>_universal.dmg
```

### Linux (AppImage / deb)

```
free-todo-frontend/src-tauri/target/release/bundle/
  appimage/FreeTodo_<version>_amd64.AppImage
  deb/free-todo_<version>_amd64.deb
```

## Build Notes

### Web Mode Only

Current Tauri configuration builds **Web mode only**:

- Standard window (1200x800)
- With window decorations
- Non-transparent

Island mode is not packaged by default.

### Frontend Assets

Tauri uses a local loading page:

```
free-todo-frontend/src-tauri/dist/index.html
```

This page redirects to the running Next.js server.

### Next.js Build

The build command runs:

```
pnpm build:frontend:web
```

Next.js artifacts:

```
free-todo-frontend/.next/
```

## Troubleshooting

### Where is the app after build?

Check:

```
free-todo-frontend/src-tauri/target/release/bundle/
```

### Build uses the wrong window mode

Tauri currently packages **Web mode only**. Island mode is intentionally excluded.

---

**Last Updated**: 2026-01-29
