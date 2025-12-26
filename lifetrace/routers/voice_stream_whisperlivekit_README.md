# WhisperLiveKit 集成说明

## 概述

WhisperLiveKit 是一个实时本地语音转文本工具，提供超低延迟（< 300ms）的实时转录功能，支持发言者区分。

## 特性

- **超低延迟**：延迟 < 300ms，比传统 Whisper 更快
- **发言者区分**：支持识别不同说话人（未来功能）
- **先进算法**：使用 SimulStreaming、WhisperStreaming 和 Stream Sortformer 等算法
- **避免语境丢失**：处理小音频片段时保持语境连贯性

## 安装

### 1. 安装依赖

```bash
# 使用 uv 同步依赖（推荐）
uv sync

# 或使用 pip
pip install whisperlivekit
```

### 2. 安装 FFmpeg

确保 FFmpeg 已安装并在系统 PATH 中可用。

**Windows:**
- 下载 FFmpeg: https://ffmpeg.org/download.html
- 解压并添加到系统 PATH

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt-get install ffmpeg
```

## 使用

### 后端端点

WhisperLiveKit 提供了新的 WebSocket 端点：

- **端点**: `/api/voice/stream-whisperlivekit`
- **协议**: WebSocket
- **数据格式**: PCM Int16 (16kHz, 单声道)
- **返回格式**: JSON

### 前端使用

前端服务已支持选择不同的识别引擎：

```typescript
import { WebSocketRecognitionService, RecognitionEngine } from './services/WebSocketRecognitionService';

// 创建服务实例
const recognitionService = new WebSocketRecognitionService();

// 选择使用 WhisperLiveKit（超低延迟）
recognitionService.setEngine('whisperlivekit');

// 或使用 Faster-Whisper（默认）
recognitionService.setEngine('faster-whisper');

// 设置回调
recognitionService.setCallbacks({
  onResult: (text, isFinal, startTime, endTime) => {
    console.log('识别结果:', text, isFinal, startTime, endTime);
  },
  onError: (error) => {
    console.error('识别错误:', error);
  },
  onStatusChange: (status) => {
    console.log('状态变化:', status);
  },
});

// 开始识别
await recognitionService.start(mediaStream);
```

## 自动降级

如果 WhisperLiveKit 未安装或初始化失败，系统会自动降级到 Faster-Whisper：

1. 首先尝试使用 WhisperLiveKit
2. 如果失败，自动使用 Faster-Whisper
3. 如果 Faster-Whisper 也失败，使用 FunASR（如果可用）

## 配置

可以在 `config/config.yaml` 中配置 WhisperLiveKit 参数：

```yaml
speech_recognition:
  whisper_model_size: "base"  # 模型大小: tiny, base, small, medium, large-v3
  whisper_device: "cpu"        # 设备: cpu, cuda
  language: "zh"               # 语言代码: zh (中文), en (英文)
  server_port: 8002           # WhisperLiveKit 服务器端口（避免与主服务器冲突）
  server_host: "localhost"     # WhisperLiveKit 服务器主机
  auto_start_server: true      # 是否自动启动服务器
```

## 性能对比

| 特性 | Faster-Whisper | WhisperLiveKit |
|------|----------------|----------------|
| 延迟 | < 1秒 | < 300ms |
| 发言者区分 | ❌ | ✅ (未来) |
| 语境保持 | ⚠️ 可能丢失 | ✅ 保持 |
| 资源占用 | 中等 | 中等 |

## 注意事项

1. **首次运行**：WhisperLiveKit 首次运行时会自动下载模型（约 1.5GB）
2. **FFmpeg 要求**：必须安装 FFmpeg 并在 PATH 中
3. **服务器模式**：如果 WhisperLiveKit 作为独立服务器运行，需要配置 WebSocket 客户端连接（当前未实现，会自动降级到 Faster-Whisper）

## 故障排除

### 问题：WhisperLiveKit 未安装

**解决方案**：
```bash
uv pip install whisperlivekit
```

### 问题：FFmpeg 未找到

**解决方案**：
- 确保 FFmpeg 已安装
- 检查系统 PATH 是否包含 FFmpeg 路径

### 问题：模型下载失败

**解决方案**：
- 检查网络连接
- 尝试使用代理或镜像源

## 未来改进

- [ ] 实现 WhisperLiveKit 服务器模式的 WebSocket 客户端连接
- [ ] 支持发言者区分功能
- [ ] 支持实时翻译功能
- [ ] 优化资源占用

## 参考

- [WhisperLiveKit 官方文档](https://github.com/collabora/whisperlivekit)
- [技术推荐文档](../../free-todo-frontend/apps/voice-module/TECHNICAL_RECOMMENDATIONS.md)

