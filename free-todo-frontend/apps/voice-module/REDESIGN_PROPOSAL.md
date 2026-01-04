# 音频模块重新设计提案

## 📋 核心需求

1. **实时音频捕获**：支持麦克风和系统音频捕获
2. **实时转录**：说话的同时实时转录，延迟 < 1秒
3. **LLM优化**：识别后立即优化文本
4. **日程提取**：自动提取日程信息
5. **回放一致性**：**回放的音频必须就是拿去识别的那段音频，保持完全一致和同步** ⚠️ 关键需求
6. **未来：音色识别**：区分不同说话人（类似飞书）

---

## 🔍 当前架构问题分析

### 问题1：实时性不足
- **当前**：后端每2-3秒处理一次，延迟较大
- **问题**：用户说话后需要等待2-3秒才能看到结果
- **影响**：体验不够实时

### 问题2：音频捕获方式
- **当前**：MediaRecorder + WebSocket 双通道
- **问题**：MediaRecorder 用于存储，WebSocket 用于识别，数据流复杂
- **影响**：可能不同步，维护困难

### 问题3：数据流混乱
- **当前**：录音 → 分段存储 → 识别 → 提取片段 → 存储
- **问题**：流程复杂，容易出错
- **影响**：422错误、回放问题

---

## 💡 重新设计方案

### 方案A：流式识别 + 流式存储（推荐）

#### 核心思路
1. **单一数据流**：音频 → 实时识别 → 实时显示 → 后台存储
2. **流式处理**：识别结果立即显示，不等待存储
3. **异步存储**：识别完成后异步提取并存储音频片段

#### 架构设计

```
音频流 (MediaStream)
    ↓
┌─────────────────────────────────────┐
│  实时识别服务 (WebSocket)            │
│  - 每0.5-1秒处理一次                 │
│  - 立即返回临时结果                  │
│  - 最终结果确认后返回                │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  前端显示层                          │
│  - 临时结果：实时显示（灰色闪烁）    │
│  - 最终结果：立即显示（正常）        │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  后台处理（异步，不阻塞显示）        │
│  - LLM优化文本                       │
│  - 提取日程                          │
│  - 提取音频片段并存储                │
└─────────────────────────────────────┘
```

#### 技术实现

**1. 实时识别优化**
```python
# 后端：更频繁的处理，更小的chunk
processor = PCMAudioProcessor(
    sample_rate=16000,
    chunk_duration=0.8,  # 0.8秒处理一次（更实时）
    overlap=0.3,  # 0.3秒重叠（减少延迟）
    min_samples=8000,  # 最小0.5秒（降低延迟）
)
```

**2. 流式结果返回**
```python
# 支持临时结果和最终结果
await websocket.send_json({
    "text": result,
    "isFinal": False,  # 临时结果
    "startTime": start_time,  # 音频开始时间（秒）
    "endTime": end_time,  # 音频结束时间（秒）
})

# 最终确认
await websocket.send_json({
    "text": final_result,
    "isFinal": True,  # 最终结果
    "startTime": start_time,
    "endTime": end_time,
})
```

**3. 前端实时显示**
```typescript
// 临时结果：立即显示，灰色闪烁
if (!isFinal) {
  updateTranscript({
    interimText: text,
    // 不等待，立即显示
  });
}

// 最终结果：替换临时结果
if (isFinal) {
  updateTranscript({
    rawText: text,
    isInterim: false,
    // 立即显示，然后后台优化
  });
  
  // 后台异步处理（不阻塞）
  optimizeText(text);
  extractSchedule(text);
  extractAudioSegment(startTime, endTime);
}
```

---

### 方案B：VAD + 流式识别（更实时）

#### 核心思路
使用 **VAD (Voice Activity Detection)** 检测语音活动，只在有语音时识别

#### 优势
- ✅ 更实时：检测到语音立即识别
- ✅ 更准确：避免识别静音
- ✅ 延迟更低：不需要等待固定时间

#### 技术选型

**1. WebRTC VAD**
```typescript
// 前端：使用 WebRTC VAD 检测语音活动
import { VAD } from '@ricky0123/vad-web';

const vad = new VAD({
  workletURL: '/vad.worklet.bundle.min.js',
  modelURL: '/silero_vad.onnx',
  sampleRate: 16000,
});

vad.onSpeechStart = () => {
  // 检测到语音开始，立即发送到后端识别
  startRecognition();
};

vad.onSpeechEnd = () => {
  // 语音结束，获取最终结果
  finalizeRecognition();
};
```

**2. 后端 VAD (Silero VAD)**
```python
# 使用 Silero VAD 检测语音活动
from silero_vad import load_silero_vad

vad_model = load_silero_vad()

# 检测语音活动
speech_prob = vad_model(audio_chunk, sample_rate=16000)
if speech_prob > 0.5:  # 有语音
    # 立即识别
    result = transcribe(audio_chunk)
```

---

## 🎯 实时转录优化方案

### 当前问题
- 后端每2秒处理一次 → 延迟2秒
- 需要等待足够数据 → 延迟累积

### 优化方案

#### 1. 降低处理间隔
```python
# 从2秒降低到0.8秒
chunk_duration = 0.8  # 0.8秒处理一次
min_samples = 8000    # 最小0.5秒（降低延迟）
```

#### 2. 使用流式识别模型
- **Faster-Whisper**：支持流式，但需要足够数据
- **FunASR**：专为流式设计，延迟更低
- **Whisper Streaming**：Whisper的流式版本

#### 3. 前端优化
```typescript
// 使用 AudioWorklet 替代 ScriptProcessor（更高效）
const audioWorklet = new AudioWorkletNode(audioContext, 'audio-processor', {
  processorOptions: { sampleRate: 16000 }
});

// 每256ms发送一次数据（降低延迟）
audioWorklet.port.onmessage = (e) => {
  ws.send(e.data); // 立即发送，不等待
};
```

---

## 🎤 音色识别（说话人识别）方案

### 技术选型

#### 方案1：pyannote.audio（推荐）
```python
# 使用 pyannote.audio 进行说话人分离
from pyannote.audio import Pipeline

pipeline = Pipeline.from_pretrained("pyannote/speaker-diarization")

# 处理音频
diarization = pipeline(audio_file)

# 获取说话人信息
for turn, _, speaker in diarization.itertracks(yield_label=True):
    print(f"说话人 {speaker}: {turn.start:.2f}s - {turn.end:.2f}s")
```

**特点**：
- ✅ 开源免费
- ✅ 准确率较高
- ✅ 支持实时处理（需要优化）
- ⚠️ 需要足够的音频数据（至少1-2秒）

#### 方案2：Resemblyzer（轻量级）
```python
# 使用 Resemblyzer 提取说话人特征
from resemblyzer import VoiceEncoder

encoder = VoiceEncoder()
# 提取说话人嵌入向量
speaker_embedding = encoder.embed_utterance(audio_chunk)

# 对比不同说话人
similarity = np.dot(speaker_embedding1, speaker_embedding2)
```

**特点**：
- ✅ 轻量级，速度快
- ✅ 可以实时提取特征
- ⚠️ 需要预先注册说话人

#### 方案3：SpeechBrain（研究级）
```python
# 使用 SpeechBrain 进行说话人识别
from speechbrain.inference.speaker import EncoderClassifier

classifier = EncoderClassifier.from_hparams(
    source="speechbrain/spkrec-ecapa-voxceleb"
)

# 识别说话人
prediction = classifier.classify_file(audio_file)
```

**特点**：
- ✅ 准确率高
- ✅ 支持多种语言
- ⚠️ 资源消耗较大

### 实时音色识别方案

#### 架构设计
```
音频流
  ↓
┌─────────────────────────────────────┐
│  VAD 检测语音活动                    │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│  说话人特征提取（实时）              │
│  - 每0.5秒提取一次特征              │
│  - 对比已知说话人                   │
└─────────────────────────────────────┘
  ↓
┌─────────────────────────────────────┐
│  语音识别（带说话人标签）            │
│  - 识别文本 + 说话人ID              │
└─────────────────────────────────────┘
```

#### 实现步骤

**阶段1：基础功能**
1. 实现实时音频捕获
2. 实现实时转录（延迟 < 1秒）
3. 实现LLM优化和日程提取

**阶段2：音色识别**
1. 集成 pyannote.audio 或 Resemblyzer
2. 实现说话人特征提取
3. 实现说话人对比和识别
4. UI显示说话人标签

**阶段3：优化**
1. 优化实时性能
2. 提高识别准确率
3. 支持多说话人场景

---

## 📊 技术选型对比

### 实时识别方案

| 方案 | 延迟 | 准确率 | 资源消耗 | 推荐度 |
|------|------|--------|----------|--------|
| Faster-Whisper (当前) | 2-3秒 | ⭐⭐⭐⭐ | 中等 | ⭐⭐⭐ |
| FunASR | 0.5-1秒 | ⭐⭐⭐ | 低 | ⭐⭐⭐⭐ |
| Whisper Streaming | 1-2秒 | ⭐⭐⭐⭐⭐ | 高 | ⭐⭐⭐⭐ |
| Web Speech API | 0.5-1秒 | ⭐⭐ | 无 | ⭐⭐⭐ |

### 音色识别方案

| 方案 | 准确率 | 实时性 | 资源消耗 | 推荐度 |
|------|--------|--------|----------|--------|
| pyannote.audio | ⭐⭐⭐⭐ | ⭐⭐⭐ | 中等 | ⭐⭐⭐⭐⭐ |
| Resemblyzer | ⭐⭐⭐ | ⭐⭐⭐⭐ | 低 | ⭐⭐⭐⭐ |
| SpeechBrain | ⭐⭐⭐⭐⭐ | ⭐⭐ | 高 | ⭐⭐⭐ |

---

## 🚀 实施建议

### 第一阶段：优化实时性 + 回放一致性（1-2周）
1. ✅ 降低处理间隔（2秒 → 0.8秒）
2. ✅ 优化前端数据流
3. ✅ 实现流式结果显示
4. ✅ **修复回放一致性**：确保回放的音频就是识别用的音频
5. ✅ 修复数据存储问题

#### 回放一致性实施步骤

**步骤1：识别服务记录精确时间范围**
```python
# 后端：返回识别结果时，包含精确的时间范围
result = await processor.try_process()
if result:
    # 计算实际处理的音频时间段
    current_time = time.time()
    audio_duration = len(processed_audio) / sample_rate
    start_time = (current_time - recognition_start_time) - audio_duration
    end_time = current_time - recognition_start_time
    
    await websocket.send_json({
        "text": result,
        "isFinal": True,
        "startTime": start_time,  # 秒（精确）
        "endTime": end_time,      # 秒（精确）
    })
```

**步骤2：前端记录并关联时间范围**
```typescript
// 前端：保存识别结果时，记录时间范围
const transcript: TranscriptSegment = {
  id: `transcript_${Date.now()}`,
  rawText: text,
  audioStart: startTime * 1000,  // 转换为毫秒
  audioEnd: endTime * 1000,      // 转换为毫秒
  // ... 其他字段
};

// 异步提取并存储音频片段（使用相同的时间范围）
await extractAndUploadAudioSegment(
  transcript.audioStart,  // 使用识别服务记录的时间
  transcript.audioEnd,   // 使用识别服务记录的时间
  transcript.id          // 关联识别结果ID
);
```

**步骤3：回放时使用关联的音频**
```typescript
// 点击识别结果时，使用关联的音频文件
const handleTranscriptClick = async (transcriptId: string) => {
  const transcript = transcripts.find(t => t.id === transcriptId);
  
  if (transcript.audioFileId) {
    // 播放的就是识别时用的那段音频
    const audioUrl = await getAudioUrl(transcript.audioFileId);
    await playAudio(audioUrl, 0); // 从头开始播放
  }
};
```

### 第二阶段：集成VAD（2-3周）
1. ✅ 集成 WebRTC VAD 或 Silero VAD
2. ✅ 实现语音活动检测
3. ✅ 优化识别触发逻辑

### 第三阶段：音色识别（4-6周）
1. ✅ 调研和选型
2. ✅ 集成 pyannote.audio
3. ✅ 实现说话人识别
4. ✅ UI显示说话人标签

---

## 💭 我的建议

### 立即实施（解决当前问题）
1. **简化数据流**：单一音频流 → 实时识别 → 立即显示
2. **降低延迟**：处理间隔 2秒 → 0.8秒
3. **修复存储逻辑**：识别结果 → 立即提取音频片段 → 存储

### 中期优化（提升体验）
1. **集成VAD**：只在有语音时识别，降低延迟
2. **优化识别模型**：考虑 FunASR 或 Whisper Streaming
3. **前端优化**：使用 AudioWorklet 替代 ScriptProcessor

### 长期规划（音色识别）
1. **先做基础功能**：确保实时转录稳定
2. **再考虑音色识别**：需要更多调研和测试
3. **分阶段实施**：先支持2-3个说话人，再扩展

---

## ❓ 需要确认的问题

1. **实时性要求**：延迟 < 1秒是否足够？还是需要 < 0.5秒？
2. **音色识别优先级**：是否可以先不做，先保证基础功能？
3. **资源限制**：服务器资源是否充足？GPU是否可用？
4. **浏览器兼容性**：是否需要支持所有浏览器？还是只支持Chrome/Edge？

