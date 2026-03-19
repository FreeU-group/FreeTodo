@echo off
setlocal

set "SELF=%~f0"
set "TEMP_PS1=%TEMP%\stop-all-%RANDOM%%RANDOM%.ps1"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$marker='__POWERSHELL_BELOW__'; $self=$env:SELF; $temp=$env:TEMP_PS1; $content=Get-Content -LiteralPath $self -Raw; $index=$content.LastIndexOf($marker); if($index -lt 0){ throw 'Embedded PowerShell marker not found.' }; $script=$content.Substring($index + $marker.Length).TrimStart([char]13,[char]10); [System.IO.File]::WriteAllText($temp, $script, [System.Text.UTF8Encoding]::new($false))"
if errorlevel 1 (
    echo Failed to prepare embedded PowerShell script.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP_PS1%" -LauncherPath "%SELF%" %*
set "EXIT_CODE=%ERRORLEVEL%"

del "%TEMP_PS1%" >nul 2>nul
exit /b %EXIT_CODE%

__POWERSHELL_BELOW__
param(
    [Parameter(Mandatory = $true)]
    [string]$LauncherPath,
    [string]$Branch = "",
    [switch]$NoPause
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Info {
    param([string]$Message)
    Write-Host "[*] $Message" -ForegroundColor Cyan
}

function Write-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Write-WarnLine {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Write-ErrLine {
    param([string]$Message)
    Write-Host "[ERR] $Message" -ForegroundColor Red
}

function Pause-IfNeeded {
    if (-not $NoPause) {
        Write-Host ""
        Read-Host "Press Enter to close this window" | Out-Null
    }
}

function Get-DefaultBranchForScriptName {
    param([string]$ScriptBaseName)

    switch -Exact ($ScriptBaseName) {
        "stop-all-chore-liji-thesis" { return "chore/liji/thesis" }
        default { return "main" }
    }
}

function Get-BranchSlug {
    param([string]$BranchName)

    $slug = $BranchName.ToLowerInvariant()
    $slug = $slug -replace "[^a-z0-9]+", "-"
    $slug = $slug.Trim('-')
    if ([string]::IsNullOrWhiteSpace($slug)) {
        return "default"
    }

    return $slug
}

function Get-RepoLayout {
    param([string]$Path)

    if ([string]::IsNullOrWhiteSpace($Path)) {
        return $null
    }

    if (
        (Test-Path (Join-Path $Path "server\server.py")) -and
        (Test-Path (Join-Path $Path "server\agent_os.py")) -and
        (Test-Path (Join-Path $Path "frontend\package.json"))
    ) {
        return "split"
    }

    if (
        (Test-Path (Join-Path $Path "pyproject.toml")) -and
        (Test-Path (Join-Path $Path "lifetrace\server.py")) -and
        (Test-Path (Join-Path $Path "free-todo-frontend\package.json"))
    ) {
        return "root"
    }

    return $null
}

function Get-RepoRootFromLauncher {
    param(
        [string]$LauncherFullPath,
        [string]$BranchName
    )

    $scriptDirectory = Split-Path -Parent $LauncherFullPath
    $layout = Get-RepoLayout $scriptDirectory
    if ($layout) {
        return $scriptDirectory
    }

    $branchSlug = Get-BranchSlug -BranchName $BranchName
    $candidate = Join-Path $scriptDirectory ("FreeTodo-" + $branchSlug)
    if (Get-RepoLayout $candidate) {
        return $candidate
    }

    return $candidate
}

function Stop-ProcessTree {
    param([int]$Id)

    if ($Id -le 0) {
        return $false
    }

    $process = Get-Process -Id $Id -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        return $false
    }

    try {
        & taskkill /PID $Id /T /F | Out-Null
        return $true
    } catch {
        try {
            Stop-Process -Id $Id -Force -ErrorAction SilentlyContinue
            return $true
        } catch {
            return $false
        }
    }
}

function Get-PidFromFile {
    param([string]$PidFile)

    if (-not (Test-Path $PidFile)) {
        return $null
    }

    $text = (Get-Content -LiteralPath $PidFile -Raw -ErrorAction SilentlyContinue).Trim()
    if ($text -notmatch '^[0-9]+$') {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        return $null
    }

    return [int]$text
}

function Find-ProcessIdsByCommandLine {
    param(
        [string[]]$Patterns,
        [string[]]$ProcessNames
    )

    $ids = New-Object System.Collections.Generic.HashSet[int]
    foreach ($processName in $ProcessNames) {
        $processes = Get-CimInstance Win32_Process -Filter "Name='$processName'" -ErrorAction SilentlyContinue
        foreach ($process in $processes) {
            $commandLine = $process.CommandLine
            if ([string]::IsNullOrWhiteSpace($commandLine)) {
                continue
            }

            $matchedAll = $true
            foreach ($pattern in $Patterns) {
                if ($commandLine -notmatch $pattern) {
                    $matchedAll = $false
                    break
                }
            }

            if ($matchedAll) {
                [void]$ids.Add([int]$process.ProcessId)
            }
        }
    }

    return @($ids)
}

function Cleanup-PidFile {
    param([string]$PidFile)

    if (Test-Path $PidFile) {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    }
}

function Cleanup-FrontendLock {
    param(
        [string]$RepoRoot,
        [string]$RepoLayout
    )

    $lockPath = if ($RepoLayout -eq "split") {
        Join-Path $RepoRoot "frontend\.next\dev\lock"
    } else {
        Join-Path $RepoRoot "free-todo-frontend\.next\dev\lock"
    }

    if (Test-Path $lockPath) {
        Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
        Write-Ok "Removed frontend lock: $lockPath"
    }
}

$launcherFullPath = [IO.Path]::GetFullPath($LauncherPath)
$launcherBaseName = [IO.Path]::GetFileNameWithoutExtension($launcherFullPath)
$defaultBranch = Get-DefaultBranchForScriptName -ScriptBaseName $launcherBaseName
if ([string]::IsNullOrWhiteSpace($Branch)) {
    $Branch = $defaultBranch
}

try {
    Write-Host ""
    Write-Host "FreeTodo stop-all" -ForegroundColor Magenta
    Write-Host "Default branch: $defaultBranch"
    Write-Host "Using branch  : $Branch"
    Write-Host ""

    $repoRoot = Get-RepoRootFromLauncher -LauncherFullPath $launcherFullPath -BranchName $Branch
    $repoLayout = Get-RepoLayout $repoRoot
    if (-not $repoLayout) {
        throw "Could not find a matching FreeTodo checkout next to this script: $repoRoot"
    }

    $runStateDir = Join-Path $repoRoot ".run-logs\setup-and-start-all"
    if (-not (Test-Path $runStateDir)) {
        Write-WarnLine "No run-state directory found: $runStateDir"
    }

    $processSpecs = @(
        @{ Name = "sensor"; PidFile = Join-Path $runStateDir "sensor.pid"; Patterns = @([Regex]::Escape((Join-Path $repoRoot "client\sensor.py"))); Names = @("powershell.exe", "pwsh.exe", "python.exe") },
        @{ Name = "frontend"; PidFile = Join-Path $runStateDir "frontend.pid"; Patterns = @([Regex]::Escape($repoRoot), "pnpm", "dev"); Names = @("powershell.exe", "pwsh.exe", "node.exe") },
        @{ Name = "backend"; PidFile = Join-Path $runStateDir "backend.pid"; Patterns = @([Regex]::Escape($repoRoot), "server\.py|lifetrace\.server"); Names = @("powershell.exe", "pwsh.exe", "python.exe") },
        @{ Name = "agentos"; PidFile = Join-Path $runStateDir "agentos.pid"; Patterns = @([Regex]::Escape($repoRoot), "agent_os\.py"); Names = @("powershell.exe", "pwsh.exe", "python.exe") }
    )

    $stoppedAny = $false
    foreach ($spec in $processSpecs) {
        $name = [string]$spec.Name
        $pidFile = [string]$spec.PidFile
        $candidateIds = New-Object System.Collections.Generic.List[int]

        $pidFromFile = Get-PidFromFile -PidFile $pidFile
        if ($pidFromFile) {
            $candidateIds.Add($pidFromFile)
        }

        foreach ($foundId in (Find-ProcessIdsByCommandLine -Patterns $spec.Patterns -ProcessNames $spec.Names)) {
            if (-not $candidateIds.Contains([int]$foundId)) {
                $candidateIds.Add([int]$foundId)
            }
        }

        if ($candidateIds.Count -eq 0) {
            Write-Info "No running $name process found."
            Cleanup-PidFile -PidFile $pidFile
            continue
        }

        foreach ($id in $candidateIds) {
            if (Stop-ProcessTree -Id $id) {
                Write-Ok "Stopped $name (PID $id)"
                $stoppedAny = $true
            } else {
                Write-WarnLine "$name (PID $id) was already stopped."
            }
        }

        Cleanup-PidFile -PidFile $pidFile
    }

    Cleanup-FrontendLock -RepoRoot $repoRoot -RepoLayout $repoLayout

    Write-Host ""
    if ($stoppedAny) {
        Write-Host "All detectable FreeTodo services have been stopped." -ForegroundColor Green
    } else {
        Write-Host "No running FreeTodo services were found." -ForegroundColor Yellow
    }
    Write-Host "Repository : $repoRoot"
    Write-Host "Branch     : $Branch"

    Pause-IfNeeded
} catch {
    Write-Host ""
    Write-ErrLine $_.Exception.Message
    Pause-IfNeeded
    exit 1
}
