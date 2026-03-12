# PowerShell script to run Electron only (without starting frontend dev server)
# This assumes the frontend dev server is already running separately
# Use: pnpm electron:dev:electron (after starting frontend with pnpm electron:dev:frontend)

# Set console output encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Change code page to UTF-8 (65001)
chcp 65001 | Out-Null

# Build Electron main process and run Electron
cd $PSScriptRoot/..
pnpm electron:build-main
electron .
