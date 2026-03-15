Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $repoRoot ".run-logs"

$services = @("server", "agent_os", "frontend", "client")

function Get-ServiceStatus {
    param(
        [Parameter(Mandatory)]
        [string]$Name
    )

    $pidFile = Join-Path $logDir "$Name.pid"

    if (-not (Test-Path $pidFile)) {
        Write-Host ("  {0,-12} " -f $Name) -NoNewline
        Write-Host "# stopped (no pid file)" -ForegroundColor Red
        return
    }

    $pidText = (Get-Content -Path $pidFile -Raw -ErrorAction SilentlyContinue).Trim()

    if (-not $pidText -or $pidText -notmatch '^\d+$') {
        Write-Host ("  {0,-12} " -f $Name) -NoNewline
        Write-Host "# stopped (invalid pid file)" -ForegroundColor Red
        return
    }

    $pid = [int]$pidText
    if (Get-Process -Id $pid -ErrorAction SilentlyContinue) {
        Write-Host ("  {0,-12} " -f $Name) -NoNewline
        Write-Host "# running (PID $pid)" -ForegroundColor Green
    } else {
        Write-Host ("  {0,-12} " -f $Name) -NoNewline
        Write-Host "# dead (PID $pid exited)" -ForegroundColor Yellow
    }
}

Write-Host "FreeTodo Service Status"
Write-Host ([string][char]0x2500 * 29)

foreach ($svc in $services) {
    Get-ServiceStatus -Name $svc
}

Write-Host ""
Write-Host "Logs: $logDir"
