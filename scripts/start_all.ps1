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
    $lockPath = Join-Path $repoRoot "frontend\.next\dev\lock"
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

function Ensure-Env {
    param(
        [Parameter(Mandatory)]
        [string]$Dir
    )
    $envFile = Join-Path $Dir ".env"
    $exampleFile = Join-Path $Dir ".env.example"
    if ((-not (Test-Path $envFile)) -and (Test-Path $exampleFile)) {
        Write-Host "Creating $envFile from .env.example ..."
        Copy-Item -Path $exampleFile -Destination $envFile
    }
}

$serverDir = Join-Path $repoRoot "server"
$clientDir = Join-Path $repoRoot "client"
$frontendDir = Join-Path $repoRoot "frontend"

Ensure-Env -Dir $serverDir
Ensure-Env -Dir $frontendDir
Ensure-Env -Dir $clientDir

function Check-ServerEnv {
    $envFile = Join-Path $serverDir ".env"
    $placeholders = @("your-api-key", "your-asr-api-key", "your-tavily-api-key", "your-gemini-api-key")
    $warnings = @()

    foreach ($line in (Get-Content -Path $envFile -Encoding UTF8)) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
        if ($trimmed -match "^([^=]+)=(.*)$") {
            $key = $Matches[1].Trim()
            $value = $Matches[2].Trim()
            if ($placeholders -contains $value) {
                $warnings += "  $key=$value"
            }
        }
    }

    if ($warnings.Count -eq 0) { return }

    Write-Host ""
    Write-Host "WARNING: server/.env still contains default placeholder values:" -ForegroundColor Yellow
    foreach ($w in $warnings) {
        Write-Host $w -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "Please edit server/.env and fill in your real API keys (LIFETRACE_LLM__API_KEY is required):" -ForegroundColor Yellow
    Write-Host "  notepad $envFile" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Then re-run:" -ForegroundColor Yellow
    Write-Host "  .\scripts\start_all.ps1" -ForegroundColor Cyan
    exit 1
}

Check-ServerEnv

Start-LoggedProcess -Name "server" -Command "uv run python server.py" -WorkingDirectory $serverDir
Start-Sleep -Seconds 2

Start-LoggedProcess -Name "agent_os" -Command "uv run python agent_os.py" -WorkingDirectory $serverDir
Start-Sleep -Seconds 1

Cleanup-FrontendLock
Start-LoggedProcess -Name "frontend" -Command "pnpm --dir frontend dev"
Start-Sleep -Seconds 1

Start-LoggedProcess -Name "client" -Command "uv run python sensor.py" -WorkingDirectory $clientDir

Write-Host ""
Write-Host "All processes started."
Write-Host "Logs: $logDir"
Write-Host "Server API:   http://localhost:8001"
Write-Host "AgentOS API:  http://localhost:8002"
Write-Host "Frontend UI:  http://localhost:3000"
Write-Host ""
Write-Host "Stop all:   pwsh -File scripts/stop_all.ps1"
Write-Host "Status all: pwsh -File scripts/status_all.ps1"
