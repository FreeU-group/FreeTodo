Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $repoRoot ".run-logs"

if (-not (Test-Path $logDir)) {
    Write-Host "No log directory found: $logDir"
    exit 1
}

function Stop-ProcessWithTimeout {
    param(
        [Parameter(Mandatory)]
        [int]$Id,
        [int]$TimeoutSeconds = 5
    )

    try {
        Stop-Process -Id $Id -ErrorAction SilentlyContinue
        Wait-Process -Id $Id -Timeout $TimeoutSeconds -ErrorAction SilentlyContinue
    } catch {
        # Ignore if the process already exited.
    }

    if (Get-Process -Id $Id -ErrorAction SilentlyContinue) {
        Stop-Process -Id $Id -Force -ErrorAction SilentlyContinue
    }
}

function Cleanup-FrontendLock {
    $lockPath = Join-Path $repoRoot "free-todo-frontend\.next\dev\lock"
    if (Test-Path $lockPath) {
        Write-Host "Removing frontend dev lock: $lockPath"
        Remove-Item -Force $lockPath
    }
}

$stoppedAny = $false

Get-ChildItem -Path $logDir -Filter "*.pid" -ErrorAction SilentlyContinue | ForEach-Object {
    $pidFile = $_.FullName
    $name = $_.BaseName
    $pidText = (Get-Content -Path $pidFile -Raw -ErrorAction SilentlyContinue).Trim()

    if (-not $pidText -or $pidText -notmatch '^\d+$') {
        Write-Host "[SKIP] $name (invalid pid file)"
        Remove-Item -Force $pidFile -ErrorAction SilentlyContinue
        return
    }

    $pid = [int]$pidText
    if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
        Write-Host "[STOP] $name (PID $pid)"
        Stop-ProcessWithTimeout -Id $pid
        $stoppedAny = $true
    } else {
        Write-Host "[SKIP] $name (PID $pid not running)"
    }

    Remove-Item -Force $pidFile -ErrorAction SilentlyContinue
    Remove-Item -Force ($pidFile -replace '\.pid$', '.pgid') -ErrorAction SilentlyContinue
}

Cleanup-FrontendLock

if (-not $stoppedAny) {
    Write-Host "No running processes found."
}
