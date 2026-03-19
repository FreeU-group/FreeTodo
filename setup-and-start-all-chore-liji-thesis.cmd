@echo off
setlocal

set "SELF=%~f0"
set "TEMP_PS1=%TEMP%\setup-and-start-all-%RANDOM%%RANDOM%.ps1"

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
    [switch]$DryRun,
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

function Quote-Ps {
    param([string]$Value)
    return "'" + ($Value -replace "'", "''") + "'"
}

function Test-Command {
    param([string]$Name)
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Test-PythonAvailable {
    return (Test-Command "python") -or (Test-Command "py")
}

function Get-DefaultBranchForScriptName {
    param([string]$ScriptBaseName)

    switch -Exact ($ScriptBaseName) {
        "setup-and-start-all-main" { return "main" }
        "setup-and-start-all-dev" { return "dev" }
        "setup-and-start-all-chore-liji-thesis" { return "chore/liji/thesis" }
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

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $paths = New-Object System.Collections.Generic.List[string]

    foreach ($entry in @(
            (Join-Path $env:USERPROFILE ".local\bin"),
            (Join-Path $env:USERPROFILE ".local\share\pnpm"),
            (Join-Path $env:USERPROFILE "AppData\Local\Microsoft\WinGet\Links")
        )) {
        if ($entry -and (Test-Path $entry) -and -not $paths.Contains($entry)) {
            $paths.Add($entry)
        }
    }

    foreach ($segment in @($machinePath, $userPath)) {
        if ([string]::IsNullOrWhiteSpace($segment)) {
            continue
        }

        foreach ($item in ($segment -split ';')) {
            if ([string]::IsNullOrWhiteSpace($item)) {
                continue
            }

            if (-not $paths.Contains($item)) {
                $paths.Add($item)
            }
        }
    }

    $env:Path = ($paths -join ';')
}

function Ensure-Winget {
    if (Test-Command "winget") {
        return
    }

    throw "winget is not available on this PC. Please install App Installer from Microsoft Store, then run this script again."
}

function Install-WingetPackage {
    param(
        [string]$CommandName,
        [string]$DisplayName,
        [string]$WingetId
    )

    if (Test-Command $CommandName) {
        Write-Ok "$DisplayName is already installed."
        return
    }

    Ensure-Winget
    Write-Info "Installing $DisplayName..."
    & winget install --id $WingetId -e --accept-package-agreements --accept-source-agreements
    Refresh-Path

    if (-not (Test-Command $CommandName)) {
        throw "$DisplayName installation completed, but '$CommandName' is still not available in PATH. Please reopen the script once Windows finishes refreshing PATH."
    }

    Write-Ok "$DisplayName installed."
}

function Ensure-Uv {
    if (Test-Command "uv") {
        Write-Ok "uv is already installed."
        return
    }

    Write-Info "Installing uv..."
    & powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"
    Refresh-Path

    if (-not (Test-Command "uv")) {
        throw "uv installation finished, but 'uv' is still not available. Please run the script again."
    }

    Write-Ok "uv installed."
}

function Ensure-Pnpm {
    if (Test-Command "pnpm") {
        Write-Ok "pnpm is already installed."
        return
    }

    if (Test-Command "corepack") {
        Write-Info "Activating pnpm via corepack..."
        try {
            & corepack enable
            & corepack prepare pnpm@latest --activate
        } catch {
            Write-WarnLine "corepack activation failed. Falling back to npm global install."
        }
        Refresh-Path
    }

    if (-not (Test-Command "pnpm") -and (Test-Command "npm")) {
        Write-Info "Installing pnpm with npm..."
        & npm install -g pnpm
        Refresh-Path
    }

    if (-not (Test-Command "pnpm")) {
        throw "pnpm could not be installed automatically. Please install Node.js LTS and run this script again."
    }

    Write-Ok "pnpm is ready."
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

function Ensure-Directory {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        New-Item -ItemType Directory -Force -Path $Path | Out-Null
    }
}

function Invoke-Git {
    param(
        [string]$RepositoryPath,
        [string[]]$Arguments
    )

    & git -C $RepositoryPath @Arguments
}

function Ensure-Repository {
    param(
        [string]$RepoRoot,
        [string]$RepoUrl,
        [string]$BranchName
    )

    $scriptLayout = Get-RepoLayout $scriptDirectory
    if ($scriptLayout) {
        Write-Ok "Using repository next to the launcher script."
        return $scriptDirectory
    }

    if (-not (Test-Path $RepoRoot)) {
        $parentDir = Split-Path -Parent $RepoRoot
        Ensure-Directory $parentDir

        Write-Info "Cloning FreeTodo branch '$BranchName'..."
        & git clone --depth 1 --branch $BranchName $RepoUrl $RepoRoot

        if (-not (Get-RepoLayout $RepoRoot)) {
            throw "Clone completed, but the repository layout is not valid: $RepoRoot"
        }

        Write-Ok "Repository cloned to $RepoRoot"
        return $RepoRoot
    }

    if (Get-RepoLayout $RepoRoot) {
        $gitDir = Join-Path $RepoRoot ".git"
        if (Test-Path $gitDir) {
            try {
                $status = (& git -C $RepoRoot status --porcelain 2>$null)
                if ([string]::IsNullOrWhiteSpace(($status | Out-String))) {
                    Write-Info "Updating existing FreeTodo repository to branch '$BranchName'..."
                    & git -C $RepoRoot fetch origin $BranchName --depth 1 | Out-Host
                    & git -C $RepoRoot checkout -q -B $BranchName FETCH_HEAD
                    Write-Ok "Repository is up to date."
                } else {
                    Write-WarnLine "Existing repository has local changes. Skipping git pull."
                }
            } catch {
                Write-WarnLine "Could not update repository automatically. Continuing with the existing copy."
            }
        } else {
            Write-Ok "Using existing repository folder (non-git copy)."
        }

        return $RepoRoot
    }

    throw "Target folder already exists but is not a FreeTodo repository: $RepoRoot"
}

function Test-PortAvailable {
    param([int]$Port)

    try {
        $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        $listener.Start()
        $listener.Stop()
        return $true
    } catch {
        return $false
    }
}

function Resolve-Port {
    param(
        [int]$PreferredPort,
        [int]$FallbackPort,
        [int[]]$ExcludedPorts = @()
    )

    foreach ($candidate in @($PreferredPort, $FallbackPort)) {
        if ($candidate -gt 0 -and $ExcludedPorts -notcontains $candidate -and (Test-PortAvailable -Port $candidate)) {
            return $candidate
        }
    }

    $port = [Math]::Max($FallbackPort, 1024)
    while ($true) {
        if ($ExcludedPorts -notcontains $port -and (Test-PortAvailable -Port $port)) {
            return $port
        }
        $port++
    }
}

function Read-JsonFile {
    param([string]$Path)

    if (-not (Test-Path $Path)) {
        return $null
    }

    try {
        return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
    } catch {
        return $null
    }
}

function Write-JsonFile {
    param(
        [string]$Path,
        [hashtable]$Data
    )

    $json = $Data | ConvertTo-Json -Depth 5
    Set-Content -LiteralPath $Path -Value $json -Encoding UTF8
}

function Get-LivePid {
    param([string]$PidFile)

    if (-not (Test-Path $PidFile)) {
        return $null
    }

    $text = (Get-Content -LiteralPath $PidFile -Raw -ErrorAction SilentlyContinue).Trim()
    if ($text -notmatch '^[0-9]+$') {
        Remove-Item -Force $PidFile -ErrorAction SilentlyContinue
        return $null
    }

    $pidValue = [int]$text
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($null -eq $process) {
        Remove-Item -Force $PidFile -ErrorAction SilentlyContinue
        return $null
    }

    return $pidValue
}

function Test-FreeTodoBackend {
    param([int]$Port)

    try {
        $result = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -Method Get -TimeoutSec 2
        return ($null -ne $result -and $result.app -eq "lifetrace")
    } catch {
        return $false
    }
}

function Wait-HttpReady {
    param(
        [string]$Url,
        [int]$TimeoutSeconds,
        [string]$Name
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $Url -Method Get -TimeoutSec 3 -UseBasicParsing | Out-Null
            Write-Ok "$Name is ready at $Url"
            return $true
        } catch {
            Start-Sleep -Seconds 2
        }
    }

    Write-WarnLine "$Name did not become ready within $TimeoutSeconds seconds: $Url"
    return $false
}

function Convert-ToEncodedCommand {
    param([string]$ScriptText)

    return [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($ScriptText))
}

function Start-ServiceWindow {
    param(
        [string]$Name,
        [string]$Title,
        [string]$Body,
        [string]$RepoRoot,
        [string]$RunStateDir
    )

    Ensure-Directory $RunStateDir
    $pidFile = Join-Path $RunStateDir "$Name.pid"
    $logFile = Join-Path $RunStateDir "$Name.log"
    $repoRootQuoted = Quote-Ps $RepoRoot
    $logFileQuoted = Quote-Ps $logFile
    $titleQuoted = Quote-Ps $Title

    $scriptText = @"
Set-StrictMode -Version Latest
`$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Set-Location $repoRootQuoted
`$Host.UI.RawUI.WindowTitle = $titleQuoted
Write-Host 'FreeTodo service window: $Title'
Write-Host 'Log file: $logFile'
Write-Host ''
function Invoke-LoggedCommand {
    param([scriptblock]`$Command)

    `$previousPreference = `$ErrorActionPreference
    `$ErrorActionPreference = 'Continue'
    try {
        & `$Command 2>&1 | Tee-Object -FilePath $logFileQuoted -Append
        `$exitCode = `$LASTEXITCODE
    } finally {
        `$ErrorActionPreference = `$previousPreference
    }

    if (`$exitCode -ne 0) {
        throw "Command exited with code `$exitCode"
    }
}

try {
$Body
} catch {
    Write-Host ''
    Write-Host ('Service failed: ' + `$_.Exception.Message) -ForegroundColor Red
    throw
}
"@

    $encoded = Convert-ToEncodedCommand -ScriptText $scriptText
    $process = Start-Process -FilePath "powershell.exe" -WorkingDirectory $RepoRoot -PassThru -ArgumentList @(
        "-NoExit",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        $encoded
    )

    Set-Content -LiteralPath $pidFile -Value $process.Id -Encoding ASCII
    Write-Ok "$Title started in a new window."
    return $process.Id
}

function Ensure-InstallStep {
    param(
        [string]$Name,
        [string]$MarkerPath,
        [scriptblock]$Action
    )

    if (Test-Path $MarkerPath) {
        Write-Ok "$Name already installed."
        return
    }

    Write-Info "Installing $Name..."
    & $Action

    if (-not (Test-Path $MarkerPath)) {
        throw "$Name install step finished, but expected marker was not found: $MarkerPath"
    }

    Write-Ok "$Name installed."
}

$repoUrl = "https://github.com/FreeU-group/FreeTodo.git"
$launcherFullPath = [IO.Path]::GetFullPath($LauncherPath)
$launcherBaseName = [IO.Path]::GetFileNameWithoutExtension($launcherFullPath)
$scriptDirectory = Split-Path -Parent $launcherFullPath
$defaultBranch = Get-DefaultBranchForScriptName -ScriptBaseName $launcherBaseName
if ([string]::IsNullOrWhiteSpace($Branch)) {
    $Branch = $defaultBranch
}
if ([string]::IsNullOrWhiteSpace($Branch)) {
    throw "Branch cannot be empty."
}

$branchSlug = Get-BranchSlug -BranchName $Branch
$defaultRepoRoot = if (Get-RepoLayout $scriptDirectory) { $scriptDirectory } else { Join-Path $scriptDirectory ("FreeTodo-" + $branchSlug) }

try {
    Write-Host ""
    Write-Host "FreeTodo setup-and-start-all" -ForegroundColor Magenta
    Write-Host "Default branch: $defaultBranch"
    Write-Host "Using branch  : $Branch"
    Write-Host ""

    Refresh-Path

    $needsRepositoryClone = -not (Get-RepoLayout $scriptDirectory) -and -not (Test-Path $defaultRepoRoot)
    if ($needsRepositoryClone) {
        Install-WingetPackage -CommandName "git" -DisplayName "Git" -WingetId "Git.Git"
    }

    Install-WingetPackage -CommandName "node" -DisplayName "Node.js LTS" -WingetId "OpenJS.NodeJS.LTS"
    if (Test-PythonAvailable) {
        Write-Ok "Python 3.12 is already installed."
    } else {
        Install-WingetPackage -CommandName "python" -DisplayName "Python 3.12" -WingetId "Python.Python.3.12"
    }
    Ensure-Uv
    Ensure-Pnpm

    $repoRoot = Ensure-Repository -RepoRoot $defaultRepoRoot -RepoUrl $repoUrl -BranchName $Branch
    $repoLayout = Get-RepoLayout $repoRoot
    if (-not $repoLayout) {
        throw "Could not detect a supported FreeTodo repository layout in $repoRoot"
    }

    $runStateDir = Join-Path $repoRoot ".run-logs\setup-and-start-all"
    Ensure-Directory $runStateDir

    if ($repoLayout -eq "split") {
        $serverVenvMarker = Join-Path $repoRoot "server\.venv\Scripts\python.exe"
        $frontendNodeModulesMarker = Join-Path $repoRoot "frontend\node_modules"
        $frontendDirName = "frontend"
        $serverProjectDir = Join-Path $repoRoot "server"
    } else {
        $serverVenvMarker = Join-Path $repoRoot ".venv\Scripts\python.exe"
        $frontendNodeModulesMarker = Join-Path $repoRoot "free-todo-frontend\node_modules"
        $frontendDirName = "free-todo-frontend"
        $serverProjectDir = $repoRoot
    }
    $frontendProjectDir = Join-Path $repoRoot $frontendDirName

    if ($DryRun) {
        Write-Info "Dry run requested. Skipping install and startup actions."
        Write-Host "Repository: $repoRoot"
        Write-Host "Branch    : $Branch"
        Pause-IfNeeded
        exit 0
    }

    if ($repoLayout -eq "split") {
        Ensure-InstallStep -Name "server dependencies" -MarkerPath $serverVenvMarker -Action {
            & uv sync --directory $serverProjectDir
        }
    } else {
        Ensure-InstallStep -Name "server dependencies" -MarkerPath $serverVenvMarker -Action {
            & uv sync --directory $serverProjectDir
        }
    }

    Ensure-InstallStep -Name "frontend dependencies" -MarkerPath $frontendNodeModulesMarker -Action {
        & pnpm --dir $frontendProjectDir install
    }

    $portsPath = Join-Path $runStateDir "ports.json"
    $storedPorts = Read-JsonFile -Path $portsPath

    $backendPid = Get-LivePid -PidFile (Join-Path $runStateDir "backend.pid")
    $agentosPid = Get-LivePid -PidFile (Join-Path $runStateDir "agentos.pid")
    $frontendPid = Get-LivePid -PidFile (Join-Path $runStateDir "frontend.pid")

    $backendPort = 0
    if ($storedPorts -and $storedPorts.backend -and (Test-FreeTodoBackend -Port ([int]$storedPorts.backend))) {
        $backendPort = [int]$storedPorts.backend
        Write-Ok "Backend is already running on port $backendPort."
    } else {
        foreach ($candidate in 8001..8099) {
            if (Test-FreeTodoBackend -Port $candidate) {
                $backendPort = $candidate
                Write-Ok "Backend is already running on port $backendPort."
                break
            }
        }
    }

    if ($backendPort -eq 0) {
        $preferredBackendPort = if ($storedPorts -and $storedPorts.backend) { [int]$storedPorts.backend } else { 8001 }
        $backendPort = Resolve-Port -PreferredPort $preferredBackendPort -FallbackPort 8001
    }

    $agentosPort = if ($repoLayout -eq "split") {
        if ($storedPorts -and $storedPorts.agentos) { [int]$storedPorts.agentos } else { 8002 }
    } else {
        0
    }
    if ($repoLayout -eq "split" -and -not $agentosPid) {
        $agentosPort = Resolve-Port -PreferredPort $agentosPort -FallbackPort 8002 -ExcludedPorts @($backendPort)
    }

    $frontendPort = if ($storedPorts -and $storedPorts.frontend) { [int]$storedPorts.frontend } else { 3001 }
    if (-not $frontendPid) {
        $frontendPort = Resolve-Port -PreferredPort $frontendPort -FallbackPort 3001 -ExcludedPorts @($backendPort, $agentosPort)
    }

    Write-JsonFile -Path $portsPath -Data @{
        backend = $backendPort
        agentos = $agentosPort
        frontend = $frontendPort
    }

    if ($repoLayout -eq "split" -and -not $agentosPid) {
        $agentosLog = Quote-Ps (Join-Path $runStateDir "agentos.log")
        $agentosBody = @"
`$env:LIFETRACE__AGNO__AGENT_OS__HOST = '127.0.0.1'
`$env:LIFETRACE__AGNO__AGENT_OS__PORT = '$agentosPort'
Invoke-LoggedCommand { uv run --directory server python agent_os.py }
"@
        $agentosPid = Start-ServiceWindow -Name "agentos" -Title "FreeTodo AgentOS" -Body $agentosBody -RepoRoot $repoRoot -RunStateDir $runStateDir
        Start-Sleep -Seconds 3
    } elseif ($repoLayout -eq "split") {
        Write-Ok "AgentOS is already running (PID $agentosPid)."
    }

    if ($backendPort -and -not (Test-FreeTodoBackend -Port $backendPort)) {
        $backendLog = Quote-Ps (Join-Path $runStateDir "backend.log")
        if ($repoLayout -eq "split") {
            $backendBody = @"
`$env:LIFETRACE__SERVER__HOST = '127.0.0.1'
`$env:LIFETRACE__SERVER__PORT = '$backendPort'
`$env:LIFETRACE__AGNO__AGENT_OS__HOST = '127.0.0.1'
`$env:LIFETRACE__AGNO__AGENT_OS__PORT = '$agentosPort'
Invoke-LoggedCommand { uv run --directory server python server.py }
"@
        } else {
            $backendBody = @"
Invoke-LoggedCommand { uv run python -m lifetrace.server --port $backendPort }
"@
        }
        $backendPid = Start-ServiceWindow -Name "backend" -Title "FreeTodo Backend" -Body $backendBody -RepoRoot $repoRoot -RunStateDir $runStateDir
    } else {
        Write-Ok "Backend start skipped because it is already running."
    }

    Wait-HttpReady -Url "http://127.0.0.1:$backendPort/health" -TimeoutSeconds 120 -Name "Backend" | Out-Null

    if (-not $frontendPid) {
        $frontendLog = Quote-Ps (Join-Path $runStateDir "frontend.log")
        $frontendBody = @"
`$env:PORT = '$frontendPort'
`$env:NEXT_PUBLIC_API_URL = 'http://127.0.0.1:$backendPort'
Invoke-LoggedCommand { pnpm --dir $frontendDirName dev }
"@
        $frontendPid = Start-ServiceWindow -Name "frontend" -Title "FreeTodo Frontend" -Body $frontendBody -RepoRoot $repoRoot -RunStateDir $runStateDir
    } else {
        Write-Ok "Frontend is already running (PID $frontendPid)."
    }

    Wait-HttpReady -Url "http://127.0.0.1:$frontendPort" -TimeoutSeconds 180 -Name "Frontend" | Out-Null

    Write-Host ""
    Write-Host "FreeTodo is ready." -ForegroundColor Green
    Write-Host "Repository : $repoRoot"
    Write-Host "Branch     : $Branch"
    Write-Host "Backend    : http://127.0.0.1:$backendPort"
    if ($repoLayout -eq "split") {
        Write-Host "AgentOS    : http://127.0.0.1:$agentosPort"
    }
    Write-Host "Frontend   : http://127.0.0.1:$frontendPort"

    try {
        Start-Process "http://127.0.0.1:$frontendPort" | Out-Null
        Write-Ok "Opened the browser."
    } catch {
        Write-WarnLine "Could not open the browser automatically. Please open the frontend URL manually."
    }

    Pause-IfNeeded
} catch {
    Write-Host ""
    Write-ErrLine $_.Exception.Message
    Pause-IfNeeded
    exit 1
}
