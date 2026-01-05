# Windows 虚拟音频设备配置脚本
# 使用 VB-CABLE 或类似虚拟音频环回设备

param(
    [switch]$CheckOnly,
    [switch]$Install
)

$ErrorActionPreference = "Stop"

function Test-VBCableInstalled {
    # 检查 VB-CABLE 是否已安装
    $vbCablePath = "HKLM:\SOFTWARE\VB-Audio\Virtual Cable"
    return Test-Path $vbCablePath
}

function Get-VBCableDevice {
    # 获取 VB-CABLE 设备信息
    $devices = Get-PnpDevice -Class AudioEndpoint -Status OK | Where-Object {
        $_.FriendlyName -like "*VB-Audio Virtual Cable*" -or
        $_.FriendlyName -like "*CABLE*"
    }
    return $devices
}

function Set-DefaultPlaybackDevice {
    param([string]$DeviceName)

    # 使用 nircmd 或 PowerShell 设置默认播放设备
    # 注意：这需要管理员权限

    try {
        # 方法1：使用 AudioDeviceCmdlets (需要先安装)
        # Set-AudioDevice -Name $DeviceName

        # 方法2：使用 Windows API (需要 C# 代码)
        # 这里提供一个简化的 PowerShell 实现

        Write-Host "提示：需要手动将默认播放设备设置为: $DeviceName" -ForegroundColor Yellow
        Write-Host "或者使用音频混音器（如 Voicemeeter）同时输出到真实和虚拟设备" -ForegroundColor Yellow

        return $true
    } catch {
        Write-Error "设置默认播放设备失败: $_"
        return $false
    }
}

function Install-VBCable {
    # 下载并安装 VB-CABLE
    Write-Host "正在检查 VB-CABLE 安装..." -ForegroundColor Cyan

    if (Test-VBCableInstalled) {
        Write-Host "✅ VB-CABLE 已安装" -ForegroundColor Green
        return $true
    }

    Write-Host "⚠️  VB-CABLE 未安装" -ForegroundColor Yellow
    Write-Host "请从以下地址下载并安装:" -ForegroundColor Yellow
    Write-Host "  https://vb-audio.com/Cable/" -ForegroundColor Cyan
    Write-Host "或者运行安装程序后重新运行此脚本" -ForegroundColor Yellow

    return $false
}

# 主逻辑
Write-Host "=== Windows 虚拟音频设备配置 ===" -ForegroundColor Cyan

if ($CheckOnly) {
    Write-Host "`n检查虚拟音频设备状态..." -ForegroundColor Cyan

    $installed = Test-VBCableInstalled
    if ($installed) {
        Write-Host "✅ VB-CABLE 已安装" -ForegroundColor Green

        $devices = Get-VBCableDevice
        if ($devices) {
            Write-Host "`n找到的虚拟音频设备:" -ForegroundColor Green
            $devices | ForEach-Object {
                Write-Host "  - $($_.FriendlyName)" -ForegroundColor White
            }
        } else {
            Write-Host "⚠️  未找到虚拟音频设备，可能需要重启或重新安装" -ForegroundColor Yellow
        }
    } else {
        Write-Host "❌ VB-CABLE 未安装" -ForegroundColor Red
        Write-Host "请运行: .\setup_virtual_audio_windows.ps1 -Install" -ForegroundColor Yellow
    }

    exit 0
}

if ($Install) {
    Install-VBCable
    exit 0
}

# 默认：检查并提示
Write-Host "`n检查虚拟音频设备..." -ForegroundColor Cyan

$installed = Test-VBCableInstalled
if (-not $installed) {
    Write-Host "❌ VB-CABLE 未安装" -ForegroundColor Red
    Write-Host "`n安装步骤:" -ForegroundColor Yellow
    Write-Host "1. 下载 VB-CABLE: https://vb-audio.com/Cable/" -ForegroundColor White
    Write-Host "2. 运行安装程序（需要管理员权限）" -ForegroundColor White
    Write-Host "3. 重启应用" -ForegroundColor White
    exit 1
}

Write-Host "✅ VB-CABLE 已安装" -ForegroundColor Green

$devices = Get-VBCableDevice
if ($devices) {
    Write-Host "`n找到的虚拟音频设备:" -ForegroundColor Green
    $devices | ForEach-Object {
        Write-Host "  - $($_.FriendlyName)" -ForegroundColor White
    }

    Write-Host "`n配置建议:" -ForegroundColor Yellow
    Write-Host "1. 使用音频混音器（推荐）：" -ForegroundColor White
    Write-Host "   - 安装 Voicemeeter (https://vb-audio.com/Voicemeeter/)" -ForegroundColor White
    Write-Host "   - 配置系统音频同时输出到真实设备和 VB-CABLE" -ForegroundColor White
    Write-Host "2. 或手动切换默认播放设备为 VB-CABLE" -ForegroundColor White
} else {
    Write-Host "⚠️  未找到虚拟音频设备" -ForegroundColor Yellow
    Write-Host "可能需要重启系统或重新安装 VB-CABLE" -ForegroundColor Yellow
}

Write-Host "`n✅ 配置完成" -ForegroundColor Green
