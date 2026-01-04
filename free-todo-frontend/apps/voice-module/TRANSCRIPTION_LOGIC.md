# 音频转录逻辑详解

## 📊 当前转录架构

### 双通道设计

```
音频流 (MediaStream)
    │
    ├─→ 存储通道 (MediaRecorder)
    │   └─ 48kHz, WebM格式, 每30秒分段
    │
    └─→ 识别通道
        ├─ 麦克风: Web Speech API
        └─ 系统音频: WebSocket → Faster-Whisper
```

---

## 🎤 麦克风模式：Web Speech API

### 转录逻辑

**特点**：
- 浏览器内置，无需后端
- 基于停顿识别（不是固定时长）
- 延迟低（< 1秒）

**工作方式**：
1. **连续监听**：`continuous: true` - 持续监听音频
2. **临时结果**：`interimResults: true` - 实时返回临时识别结果
3. **识别触发**：检测到语音停顿（通常 0.5-2秒）后返回最终结果

**音频块大小**：
- ❌ **不是固定块**：基于停顿动态识别
- ✅ **识别范围**：通常识别最近 1-3秒的音频
- ✅ **临时结果**：实时更新，显示灰色斜体
- ✅ **最终结果**：停顿后 1-2秒确认

**时间戳处理**：
- Web Speech API 不直接提供时间戳
- 前端根据文本长度和距离上次结果的时间估算
- 最终结果：从上次最终结果之后开始计算
- 临时结果：使用更短的时间窗口（不超过2秒）

---

## 🔊 系统音频模式：WebSocket + Faster-Whisper

### 前端发送逻辑

**音频处理流程**：
```
MediaStream (48kHz)
    ↓
AudioContext (重采样到 16kHz)
    ↓
ScriptProcessor (4096 samples/buffer)
    ↓
PCM Int16 转换
    ↓
WebSocket 实时发送
```

**关键参数**：
- **采样率**：16kHz（与后端 Faster-Whisper 一致）
- **缓冲区大小**：4096 samples = **256ms** @ 16kHz
- **发送频率**：每 256ms 发送一次 PCM 数据块
- **数据格式**：Int16 PCM（-32768 到 32767）

**代码位置**：
```typescript
// WebSocketRecognitionService.ts
this.audioContext = new AudioContext({
  sampleRate: 16000, // 16kHz
});

this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
// bufferSize: 4096 samples = 256ms @ 16kHz

this.scriptProcessor.onaudioprocess = (e) => {
  // 每 256ms 触发一次
  const inputData = e.inputBuffer.getChannelData(0); // Float32Array
  // 转换为 Int16 PCM
  this.ws.send(int16.buffer); // 发送到后端
};
```

### 后端处理逻辑

**音频块处理**：
```
PCM Int16 数据流
    ↓
缓冲区 (deque, 最多10秒)
    ↓
每 0.8秒 检查一次
    ↓
满足条件时处理：
  - 至少 0.5秒数据 (8000 samples)
  - 距离上次处理 >= 0.8秒
    ↓
提取处理块（保留 0.3秒重叠）
    ↓
Faster-Whisper 识别
    ↓
返回识别结果
```

**关键参数**（后端 `voice_stream_whisper.py`）：
- **采样率**：16000 Hz
- **处理间隔**：**0.8秒** (`chunk_duration`)
- **重叠时间**：**0.3秒** (`overlap`)
- **最小样本数**：**8000 samples** (约 0.5秒)
- **最大缓冲区**：10秒（防止溢出）

**处理条件**：
```python
# 后端逻辑
should_process = (
    current_samples >= min_samples (8000)  # 至少0.5秒
    and time_since_last >= chunk_duration (0.8秒)
)
```

**实际处理的数据量**：
- 每次处理约 **0.8-1.1秒** 的音频
- 保留 **0.3秒** 重叠，确保不丢失边界内容
- 处理延迟：**< 1秒**

---

## 📈 数据流对比

| 模式 | 音频块大小 | 处理频率 | 延迟 | 识别方式 |
|------|-----------|---------|------|---------|
| **麦克风 (Web Speech)** | 动态（1-3秒） | 基于停顿 | < 1秒 | 浏览器内置 |
| **系统音频 (Faster-Whisper)** | 0.8秒 | 每0.8秒 | < 1秒 | 后端模型 |

---

## 🔄 实时性优化

### 当前优化措施

1. **降低处理间隔**
   - 从 3秒 → **0.8秒**
   - 延迟从 2-3秒 → **< 1秒**

2. **减少最小样本数**
   - 从 2秒 (32000 samples) → **0.5秒** (8000 samples)
   - 更快响应

3. **优化重叠策略**
   - 重叠从 0.5秒 → **0.3秒**
   - 减少延迟，同时确保不丢失内容

4. **Faster-Whisper 参数优化**
   - `beam_size=1`（最快）
   - `temperature=0.0`（贪婪解码）
   - `best_of=1`（只尝试一次）

---

## ⚠️ 当前限制

### 1. ScriptProcessor 已废弃
- **问题**：`ScriptProcessorNode` 已被标记为废弃
- **影响**：未来浏览器可能不支持
- **解决方案**：迁移到 `AudioWorklet`（需要重构）

### 2. 固定处理间隔
- **问题**：系统音频模式每0.8秒处理一次，即使没有语音
- **影响**：资源浪费，可能产生空结果
- **解决方案**：集成 VAD（语音活动检测）

### 3. 时间戳精度
- **问题**：Web Speech API 不提供精确时间戳
- **影响**：需要估算，可能有误差
- **解决方案**：使用音频段关联，避免手动计算

---

## 🚀 改进建议

### 短期（1-2周）

1. **错误恢复机制**
   - 设备断开后自动重连
   - WebSocket 断线重连
   - 网络错误恢复

2. **识别结果优化**
   - 去重连续相同结果
   - 合并相邻结果
   - 过滤空结果

### 中期（1-2月）

1. **迁移到 AudioWorklet**
   - 替换废弃的 ScriptProcessor
   - 更好的性能和实时性

2. **集成 VAD**
   - 只在有语音时识别
   - 降低延迟和资源消耗

3. **改进时间戳**
   - 后端返回精确时间范围
   - 前端使用精确时间，不估算

### 长期（3-6月）

1. **流式识别优化**
   - 增量识别
   - 更低的延迟

2. **多模型支持**
   - 根据场景选择模型
   - 平衡速度和准确率

