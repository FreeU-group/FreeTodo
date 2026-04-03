# FreeTodo Electron App Packaging Guide

This document describes how to package the FreeTodo application (Next.js frontend + Python backend) as a standalone desktop application.

## Table of Contents

- [Quick Start](#quick-start)
- [System Requirements](#system-requirements)
- [Packaging Process](#packaging-process)
- [Build Output](#build-output)
- [Log Files](#log-files)
- [Troubleshooting](#troubleshooting)
- [Common Issues](#common-issues)

## Quick Start

### macOS

```bash
# Clean previous builds (optional)
rm -rf dist-electron-app dist-electron .next

# Build for macOS
pnpm build:desktop:web:full:mac
```

Output files will be in `dist-electron-app/`:
- `FreeTodo-x.x.x-mac-arm64.dmg` - Apple Silicon Mac
- `FreeTodo-x.x.x-mac-x64.dmg` - Intel Mac

### Windows

```bash
pnpm build:desktop:web:full:win
```

### Linux

```bash
pnpm build:desktop:web:full:linux
```

## System Requirements

### macOS

- **OS**: macOS 10.15 (Catalina) or later
- **Architecture**: Apple Silicon (arm64) or Intel (x64)
- **Tools**:
  - Node.js 18+ and pnpm
  - Python 3.12 (installed automatically on first launch)

### Disk Space

- **Build process**: depends on Next.js build output
- **Final DMG**: depends on frontend assets and backend models

## Packaging Process

The complete packaging flow (`pnpm build:desktop:web:full:mac`) executes these steps:

### 1. Next.js Production Build

```bash
pnpm build:frontend:web
```

Generates:
- `.next/standalone/` - Standalone server files
- `.next/static/` - Static assets (CSS, JS chunks)
- `.next/server/` - Server-side code

### 2. Backend Runtime Packaging (Source)

The backend source (`lifetrace/`) and `requirements-runtime.txt` are bundled into
the Electron app. On first launch, the app installs Python 3.12 and backend
dependencies automatically.

### 3. Resolve Symlinks

```bash
pnpm electron:resolve-symlinks
```

Converts pnpm symlinks in `node_modules` to actual files for packaging compatibility.

### 4. Copy Missing Dependencies

```bash
pnpm electron:copy-missing-deps
```

Copies runtime dependencies that Next.js standalone build may not include:
- `styled-jsx`
- `@swc/helpers`
- `@next/env`
- `client-only`

### 5. Build Electron Main Process (Web mode)

```bash
pnpm build:desktop:web:frontend-shell
```

Compiles TypeScript main process code to `dist-electron/main.js` with Web window mode.

### 6. Create Installer

```bash
pnpm build:desktop:web:full:mac
```

Creates platform-specific installers using `electron-builder.yml` configuration.

## Build Output

### Application Structure

```
FreeTodo.app/Contents/
├── MacOS/
│   └── FreeTodo              # Electron executable
├── Resources/
│   ├── app/
│   │   └── dist-electron/
│   │       └── main.js       # Main process code
│   ├── standalone/           # Next.js server
│   │   ├── server.js
│   │   ├── node_modules/
│   │   ├── .next/
│   │   └── public/
│   └── backend/              # Python backend (source)
│       ├── lifetrace/
│       └── requirements-runtime.txt
└── ...
```

### User Data Directory

**macOS**: `~/Library/Application Support/FreeTodo/lifetrace-data/`
- `config/` - User configuration files
- `data/` - Database and screenshots
- `logs/` - Backend application logs

## Log Files

### Log File Naming

Both frontend and backend use the same naming convention:
- Format: `YYYY-MM-DD-N.log` (N is the session number, starting from 0)
- Each application launch creates a new log file
- Timestamps are in **UTC** format

### Electron Main Process Logs

**Location**: `~/Library/Logs/FreeTodo/`

Example: `2026-01-11-0.log`, `2026-01-11-1.log`

Contains:
- Application startup info
- Backend/frontend server status
- Process stdout/stderr output
- Health check results

### Backend Application Logs

**Location**: `~/Library/Application Support/FreeTodo/lifetrace-data/logs/`

Example: `2026-01-11-0.log`, `2026-01-11-0.error.log`

Contains:
- FastAPI server logs
- Background job status
- Error details with stack traces

### Viewing Logs

```bash
# View latest Electron logs
ls -lt ~/Library/Logs/FreeTodo/*.log | head -5
tail -100 ~/Library/Logs/FreeTodo/$(ls -t ~/Library/Logs/FreeTodo/*.log | head -1)

# View latest backend logs
ls -lt ~/Library/Application\ Support/FreeTodo/lifetrace-data/logs/*.log | head -5
tail -100 "$(ls -t ~/Library/Application\ Support/FreeTodo/lifetrace-data/logs/*.log | head -1)"
```

## Troubleshooting

### Port Configuration

The application uses **dynamic port allocation**:

| Mode | Frontend Port | Backend Port |
|------|--------------|--------------|
| DEV | 3001 (default) | 8001 (default) |
| Build | 3100 (default) | 8100 (default) |

Ports automatically increment if the default is occupied.

### Startup Sequence

1. **Backend Server Start**
   - Ensure Python 3.12 + backend dependencies
   - Start `lifetrace/scripts/start_backend.py`
   - Wait for health check (up to 180 seconds)

2. **Frontend Server Start**
   - Start Next.js standalone server
   - Wait for ready (up to 30 seconds)

3. **Window Creation**
   - Load frontend URL
   - Show application window

### Checking Backend Status

```bash
# Check if backend process is running
ps aux | grep lifetrace

# Check port usage (example for Build mode)
lsof -i :8100

# Test health endpoint
curl http://localhost:8100/health
```

### Checking Frontend Status

```bash
# Check port usage
lsof -i :3100

# Test frontend
curl http://localhost:3100
```

## Common Issues

### Issue 1: Backend Runtime Files Not Found

**Symptoms**:
- "Backend source files were not found" error
- Application fails to start

**Solutions**:
1. Check if backend files exist:
   ```bash
   ls -la /Applications/FreeTodo.app/Contents/Resources/backend/lifetrace
   ```

2. Rebuild the installer and reinstall the app.

### Issue 2: Next.js Server Exits Immediately

**Symptoms**:
- "Server exited unexpectedly with code 0"
- Empty stdout/stderr

**Solutions**:
1. Ensure all build steps were executed:
   ```bash
   pnpm electron:resolve-symlinks
   pnpm electron:copy-missing-deps
   ```

2. Test server manually:
   ```bash
   cd /Applications/FreeTodo.app/Contents/Resources/standalone
   PORT=3100 HOSTNAME=localhost NODE_ENV=production node server.js
   ```

3. If "Cannot find module" error, add the module to `scripts/copy-missing-deps.js`

### Issue 3: API 500 Errors

**Symptoms**:
- Frontend shows "API error: 500"
- Requests fail to reach backend

**Common Causes**:
1. Backend not running - check logs
2. Port mismatch - ensure `NEXT_PUBLIC_API_URL` is correct
3. Backend health check timeout - increase timeout or check backend logs

### Issue 4: CSS/Styles Missing

**Symptoms**:
- Page displays without styling
- Plain text appearance

**Solution**:
Check that `.next/static` was copied to `standalone/.next/static`:
```bash
ls /Applications/FreeTodo.app/Contents/Resources/standalone/.next/static
```

### Issue 5: macOS Security Warning

**Symptoms**:
- "Cannot be opened because developer cannot be verified"

**Solutions**:

Option 1: Allow in System Settings
- System Settings > Privacy & Security > Click "Open Anyway"

Option 2: Remove quarantine attribute
```bash
xattr -cr /Applications/FreeTodo.app
```

### Issue 6: Build Size Too Large

**Symptoms**:
- DMG exceeds 2 GB

**Common causes**:
- Node.js runtime
- Next.js standalone output
- ONNX models for OCR

To reduce size:
- Prune unused frontend assets
- Remove unused backend models or optional dependencies

## Related Files

### Frontend
- `electron/main.ts` - Electron main process
- `electron-builder.yml` - electron-builder configuration
- `scripts/resolve-symlinks.js` - Symlink resolver
- `scripts/copy-missing-deps.js` - Missing dependency copier
- `next.config.ts` - Next.js configuration

### Backend
- `lifetrace/scripts/start_backend.py` - Backend startup entrypoint
- `requirements-runtime.txt` - Runtime dependency list

---

**Last Updated**: 2026-01-29
**Applicable Versions**:
- Next.js 16.x
- Electron 39.x
- electron-builder 26.x
