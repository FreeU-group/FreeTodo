# 跨平台虚拟音频设备配置指南

## 📋 概述

为了实现跨平台的系统音频捕获，我们为不同操作系统提供了虚拟音频设备配置方案：

| 操作系统 | 虚拟音频设备 | 配置方式 |
|---------|------------|---------|
| **Windows** | VB-CABLE | PowerShell 脚本自动检测和配置 |
| **macOS** | BlackHole | Shell 脚本自动检测和配置 |
| **Linux** | PulseAudio 环回模块 | Shell 脚本自动加载模块 |

---

## 🪟 Windows 配置

### 方案1：VB-CABLE（推荐）

**优点**：
- ✅ 稳定可靠
- ✅ 低延迟
- ✅ 免费

**安装步骤**：

1. **下载并安装 VB-CABLE**：
   - 访问：https://vb-audio.com/Cable/
   - 下载并运行安装程序（需要管理员权限）
   - 重启应用

2. **自动检测**：
   ```powershell
   # 在 Electron 应用中会自动检测
   # 或手动运行：
   .\scripts\audio\setup_virtual_audio_windows.ps1 -CheckOnly
   ```

3. **配置音频路由**（推荐使用 Voicemeeter）：
   - 安装 Voicemeeter: https://vb-audio.com/Voicemeeter/
   - 配置系统音频同时输出到真实设备和 VB-CABLE
   - 这样既能听到声音，又能捕获音频

### 方案2：手动切换默认设备

- 将系统默认播放设备切换为 VB-CABLE
- 应用从 VB-CABLE 捕获音频
- ⚠️ 注意：这样会听不到声音，除非使用音频混音器

---

## 🍎 macOS 配置

### 方案1：BlackHole（推荐）

**安装步骤**：

1. **使用 Homebrew 安装**（推荐）：
   ```bash
   brew install blackhole-2ch
   ```

2. **或从 GitHub 下载**：
   - 访问：https://github.com/ExistentialAudio/BlackHole
   - 下载并安装 `.pkg` 文件
   - 在系统设置中授权麦克风权限

3. **自动检测**：
   ```bash
   # 在 Electron 应用中会自动检测
   # 或手动运行：
   ./scripts/audio/setup_virtual_audio_macos.sh --check-only
   ```

4. **配置多输出设备**：
   - 打开"音频 MIDI 设置"（应用程序 > 实用工具）
   - 创建多输出设备：
     - 添加你的真实输出设备（如扬声器）
     - 添加 BlackHole 2ch
   - 将系统音频输出设置为这个多输出设备

### 方案2：使用 Loopback

- 安装 Loopback: https://rogueamoeba.com/loopback/
- 配置音频路由（商业软件，功能更强大）

---

## 🐧 Linux 配置

### 使用 PulseAudio 环回模块

**前提条件**：
- PulseAudio 已安装并运行

**自动配置**：

1. **自动加载环回模块**：
   ```bash
   # 在 Electron 应用中会自动加载
   # 或手动运行：
   ./scripts/audio/setup_virtual_audio_linux.sh --load-module
   ```

2. **虚拟设备**：
   - 自动创建 `virtual_audio_sink` 虚拟音频设备
   - 系统音频自动路由到此设备
   - 应用从此设备捕获音频

**手动配置**（如果需要）：

```bash
# 创建虚拟 sink
pactl load-module module-null-sink sink_name=virtual_audio_sink

# 创建环回（将默认输出路由到虚拟 sink）
pactl load-module module-loopback source=<default_output>.monitor sink=virtual_audio_sink
```

---

## 🔧 Electron 集成

### 自动检测和配置

在 Electron 应用中，虚拟音频设备的检测和配置已自动集成：

1. **检查设备状态**：
   ```typescript
   const status = await window.electronAPI.checkVirtualAudioDevice();
   if (status.available) {
     console.log('虚拟音频设备已配置');
   } else {
     console.log('需要配置虚拟音频设备');
   }
   ```

2. **自动配置**：
   ```typescript
   const result = await window.electronAPI.setupVirtualAudioDevice();
   if (result.success) {
     console.log('配置成功');
   } else {
     console.log('配置失败:', result.message);
   }
   ```

### API 路由

后端也提供了 REST API：

- `GET /api/audio/device/status` - 获取设备状态
- `POST /api/audio/device/check` - 检查虚拟音频设备
- `POST /api/audio/device/setup` - 设置虚拟音频设备

---

## 📝 使用流程

### 首次使用

1. **启动应用**：
   - Electron 应用会自动检测虚拟音频设备
   - 如果未配置，会提示用户

2. **配置设备**：
   - 点击"配置虚拟音频设备"按钮
   - 或按照上述步骤手动安装

3. **开始录音**：
   - 选择"系统音频"作为音频源
   - 应用会自动从虚拟设备捕获音频

### 日常使用

- 虚拟音频设备配置一次后，后续无需重复配置
- 应用启动时会自动检测设备状态
- 如果设备不可用，会提示重新配置

---

## 🐛 故障排除

### Windows

**问题**：VB-CABLE 未检测到
- 检查是否已安装并重启
- 运行 `Get-PnpDevice -Class AudioEndpoint` 查看设备列表
- 确保设备已启用

**问题**：无法捕获音频
- 检查系统默认播放设备设置
- 使用 Voicemeeter 混音器（推荐）
- 确保应用有音频权限

### macOS

**问题**：BlackHole 未检测到
- 检查是否已安装：`system_profiler SPAudioDataType | grep BlackHole`
- 确保在系统设置中授权了麦克风权限
- 可能需要重启系统

**问题**：无法捕获音频
- 检查多输出设备配置
- 确保系统音频输出设置为多输出设备
- 检查应用音频权限

### Linux

**问题**：PulseAudio 未运行
- 启动 PulseAudio：`pulseaudio --start`
- 检查状态：`pgrep -x pulseaudio`

**问题**：环回模块未加载
- 手动加载：`./scripts/audio/setup_virtual_audio_linux.sh --load-module`
- 检查模块：`pactl list modules short | grep loopback`

---

## 🎯 最佳实践

1. **使用音频混音器**（Windows/macOS）：
   - 可以同时输出到真实设备和虚拟设备
   - 既能听到声音，又能捕获音频
   - 推荐：Voicemeeter (Windows) 或多输出设备 (macOS)

2. **自动配置**：
   - 首次使用时，让应用自动检测和配置
   - 如果自动配置失败，按照上述步骤手动安装

3. **权限管理**：
   - 确保应用有音频捕获权限
   - macOS 需要在系统设置中授权
   - Linux 需要 PulseAudio 权限

4. **性能优化**：
   - 虚拟音频设备会增加少量延迟（通常 < 10ms）
   - 对于实时转录，这个延迟可以忽略
   - 如果延迟明显，检查系统音频设置

---

## 📚 参考资料

- [VB-CABLE 官网](https://vb-audio.com/Cable/)
- [BlackHole GitHub](https://github.com/ExistentialAudio/BlackHole)
- [PulseAudio 文档](https://www.freedesktop.org/wiki/Software/PulseAudio/Documentation/)
- [WhisperLiveKit 集成文档](./WHISPERLIVEKIT_INTEGRATION_STRATEGY.md)

























