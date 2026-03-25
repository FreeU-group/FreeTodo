# FreeTodo Tauri Packaging Guide

This document describes the current Tauri packaging flow for the desktop app.

The desktop app now ships in a single **Web mode** only:

- Tauri launches a bundled Next.js standalone server locally
- Tauri exposes a small local proxy at `http://127.0.0.1:8100`
- The proxy forwards requests to the remote backend configured in the desktop settings file

Island mode and Python/PyInstaller backend packaging are no longer part of the Tauri build flow.

## Requirements

Run from the repository root and make sure these are installed first:

- Node.js 20+
- `pnpm`
- Rust / Cargo (`rustup`)

Install frontend dependencies:

```bash
pnpm --dir frontend install
```

## Build Commands

Recommended full packaging command:

```bash
pnpm --dir frontend build:tauri:web:script:full
```

This command will:

1. Build the frontend with `next build`
2. Prepare the Tauri loading page and standalone assets
3. Run `tauri build` with the Web-mode config
4. Copy standalone assets and desktop config into the packaged app bundle

You can also run the base Tauri build directly:

```bash
pnpm --dir frontend tauri:build
```

But `build:tauri:web:script:full` is the safer command because it includes the final resource copy step.

## Output Locations

The main build outputs are written under:

```text
frontend/src-tauri/target/release/bundle/
```

macOS outputs:

```text
frontend/src-tauri/target/release/bundle/macos/FreeTodo.app
frontend/src-tauri/target/release/bundle/dmg/FreeTodo_0.1.2_aarch64.dmg
```

## Runtime Config

On first launch, the desktop app creates a config file here:

```text
~/Library/Application Support/com.freeugroup.freetodo/config.json
```

Default contents:

```json
{
  "apiBaseUrl": "http://127.0.0.1:8001"
}
```

Change `apiBaseUrl` to your real remote backend, or update it inside the app from:

- `Settings`
- `Developer`
- `Desktop server`

## How the App Runs

When you open the packaged app:

1. Tauri starts the local proxy on `127.0.0.1:8100`
2. Tauri starts the bundled Next.js standalone server on a local port such as `3100+`
3. The frontend loads inside the Tauri window
4. API requests go through the local proxy and then to your configured remote backend

## Running the Packaged App

### macOS

Open the app bundle directly:

```bash
open "frontend/src-tauri/target/release/bundle/macos/FreeTodo.app"
```

Or double-click:

```text
frontend/src-tauri/target/release/bundle/macos/FreeTodo.app
```

If you want to distribute it, use the generated DMG:

```text
frontend/src-tauri/target/release/bundle/dmg/FreeTodo_0.1.2_aarch64.dmg
```

## Troubleshooting

### Build succeeds but app opens blank

Check that the packaged app contains standalone assets:

```text
frontend/src-tauri/target/release/bundle/macos/FreeTodo.app/Contents/Resources/standalone/
```

If that directory is missing, rebuild with:

```bash
pnpm --dir frontend build:tauri:web:script:full
```

### App opens but API calls fail

Check the desktop config file:

```text
~/Library/Application Support/com.freeugroup.freetodo/config.json
```

Make sure `apiBaseUrl` points to a reachable remote backend.

### Local proxy health check

While the app is running, this should respond with JSON:

```bash
curl http://127.0.0.1:8100/ready
```

### Rebuild after changing code

Always use the full command so packaged resources stay in sync:

```bash
pnpm --dir frontend build:tauri:web:script:full
```

---

Last updated: 2026-03-25
