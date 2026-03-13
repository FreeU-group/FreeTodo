Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $repoRoot ".run-logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$pwsh = Get-Command pwsh -ErrorAction SilentlyContinue
$shell = if ($pwsh) { $pwsh.Source } else { (Get-Command powershell).Source }

function Start-LoggedProcess {
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        [Parameter(Mandatory)]
        [string]$Command,
        [string]$WorkingDirectory = $repoRoot
    )

    $logFile = Join-Path $logDir "$Name.log"
    $pidFile = Join-Path $logDir "$Name.pid"
    $wrappedCommand = "$Command *>> `"$logFile`""

    Write-Host "Starting $Name..."
    $process = Start-Process -FilePath $shell -WorkingDirectory $WorkingDirectory -PassThru -ArgumentList @(
        "-NoExit",
        "-Command",
        $wrappedCommand
    )
    Set-Content -Path $pidFile -Value $process.Id
}

function Test-FrontendDevRunning {
    $escapedRepo = [Regex]::Escape($repoRoot)
    $processes = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue
    foreach ($process in $processes) {
        $commandLine = $process.CommandLine
        if ($commandLine -and $commandLine -match "next dev" -and $commandLine -match $escapedRepo) {
            return $true
        }
    }
    return $false
}

function Cleanup-FrontendLock {
    $lockPath = Join-Path $repoRoot "free-todo-frontend\.next\dev\lock"
    if (-not (Test-Path $lockPath)) {
        return
    }
    if (Test-FrontendDevRunning) {
        Write-Host "Frontend dev lock present and Next.js appears running; leaving lock in place."
        return
    }
    Write-Host "Removing stale frontend dev lock: $lockPath"
    Remove-Item -Force $lockPath
}

Start-LoggedProcess -Name "phoenix" -Command "uv run phoenix serve"

Start-Sleep -Seconds 2

Start-LoggedProcess -Name "lifetrace.agent_os" -Command "uv run python -m lifetrace.agent_os"

Start-Sleep -Seconds 1

Start-LoggedProcess -Name "lifetrace.server" -Command "uv run python -m lifetrace.server"

Start-Sleep -Seconds 1

Cleanup-FrontendLock
Start-LoggedProcess -Name "frontend.dev" -Command "pnpm -C free-todo-frontend dev"

Write-Host "All processes started."
Write-Host "Logs: $logDir"
Write-Host "Phoenix UI: http://localhost:6006"
Write-Host "Stop all: pwsh -File scripts/stop_all.ps1"
