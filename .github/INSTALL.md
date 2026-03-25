# One-Click Install (Full Options)

This document contains the full one-click install options referenced in the main README.

## Requirements
- Python 3.12+
- Node.js 20+
- Git
- Rust (only required for Tauri builds)

## Basic usage

macOS/Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.sh | bash
```

Windows (PowerShell):

```powershell
iwr -useb https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.ps1 | iex
```

## Defaults

`mode=tauri`, `variant=web`, `frontend=build`, `backend=script`.

Note: the current desktop packaging flow is **Web-mode Tauri only**. Island and PyInstaller packaging paths are no longer maintained.

## Environment variables

- `LIFETRACE_DIR`: install directory (defaults to repo name)
- `LIFETRACE_REPO`: repo URL (defaults to `https://github.com/FreeU-group/FreeTodo.git`)
- `LIFETRACE_REF`: branch or tag (defaults to `main`, use `dev` for unstable builds)
- `LIFETRACE_MODE`: `web`, `tauri`, or `electron`
- `LIFETRACE_VARIANT`: use `web`
- `LIFETRACE_FRONTEND`: `build` or `dev` (web defaults to `dev`)
- `LIFETRACE_BACKEND`: `script` or `pyinstaller`
- `LIFETRACE_RUN`: `1` (default) to run after install, `0` to only install

## Examples

```bash
# Web dev
curl -fsSL https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.sh | bash -s -- --mode web --frontend dev

# Tauri dev
curl -fsSL https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.sh | bash -s -- --mode tauri --frontend dev

# Tauri build (recommended Web-only packaging flow)
curl -fsSL https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.sh | bash -s -- --mode tauri --frontend build --backend script

# Switch ref
curl -fsSL https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.sh | bash -s -- --ref dev
```

```powershell
# Web dev
$env:LIFETRACE_MODE="web"; $env:LIFETRACE_FRONTEND="dev"; iwr -useb https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.ps1 | iex

# Tauri dev
$env:LIFETRACE_MODE="tauri"; $env:LIFETRACE_FRONTEND="dev"; iwr -useb https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.ps1 | iex

# Tauri build (recommended Web-only packaging flow)
$env:LIFETRACE_MODE="tauri"; $env:LIFETRACE_FRONTEND="build"; $env:LIFETRACE_BACKEND="script"; iwr -useb https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.ps1 | iex

# Switch ref
$env:LIFETRACE_REF="dev"; iwr -useb https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.ps1 | iex
```
