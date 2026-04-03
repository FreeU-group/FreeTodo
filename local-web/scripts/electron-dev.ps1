# PowerShell script to run electron:dev with UTF-8 encoding
# This ensures Next.js output displays correctly without garbled characters

# Set console output encoding to UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# Change code page to UTF-8 (65001)
chcp 65001 | Out-Null

# Build Electron main process and run Electron
cd $PSScriptRoot/..
pnpm electron:build-main
electron .
