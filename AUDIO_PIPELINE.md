# 音频处理完整方案

本文档描述从 WebSocket 流式上传音频到最终输出给感知流（Perception Stream）的完整处理链路。

---

## 1. 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           音频入口点 (Audio Entry Points)                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│  /api/audio/transcribe  │  /v4/listen (omi)  │  /api/audio/hardware/{uid}/stream  │
│  (PC 前端录音)           │  (Omi App 硬件)     │  (硬件设备直连)                      │
└───────────────┬─────────┴──────────┬─────────┴────────────────┬──────────────────┘
                │                    │                           │
                ▼                    ▼                           ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           音频接收与预处理 (1)                                      │
└─────────────────────────────────────────────────────────────────────────────────┘
│  • WebSocket 接收 bytes 或 text 消息                                                │
│  • 解码: Opus / PCM8 / PCM16 → PCM-16 LE 16kHz mono                                │
│  • AGC: 峰值自动增益 (apply_agc_to_pcm)                                             │
│  • 原始 PCM 落盘: audio_chunks 用于持久化与二次处理                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           实时 ASR (2)                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
│  • 阿里云 DashScope Fun-ASR 实时 WebSocket API                                       │
│  • 模型: fun-asr-realtime                                                          │
│  • 输出: on_result(text, is_final)                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                │
                ├───────────────────────────────────────────────────────────────────┐
                │                                                                   │
                ▼                                                                   ▼
┌─────────────────────────────────────┐  ┌─────────────────────────────────────────┐
│  说话人识别 (3) 可选 DiartDiarizer    │  │  录音分段 (3b) 24x7 模式                   │
└─────────────────────────────────────┘  └─────────────────────────────────────────┘
│  • 默认: CAM++ (FunASR) 缓冲 + VoiceprintStore 声纹匹配                             │  │  • 静音检测 / 30 分钟分段                                                       │
│  • 可选: Diart (pyannote) 实时说话人分离                                            │  │  • 分段保存: 当前段 WAV + 转录文本 → 新段                                         │
│  • feed_audio() → identify_current_speaker()                                       │  └─────────────────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           实时输出 (4)                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
│  • 返回客户端: TranscriptionResultChanged / transcript / transcript_refined        │
│  • 实时 NLP: 待办提取 (ExtractionChanged)，8 秒节流                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           二次处理 (5) 仅 /v4/listen                                │
└─────────────────────────────────────────────────────────────────────────────────┘
│  • 阿里云 DashScope Paraformer-v2 离线转录 API                                       │
│  • 说话人分离 (diarization) + 本地 CAM++ 声纹映射 (speaker_name)                     │
│  • 去抖: debounce_seconds + interval_seconds 后按句子边界切片                       │
│  • 输出: transcript_refined 推给客户端 + 精修结果推感知流                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           感知流发布 (6)                                            │
└─────────────────────────────────────────────────────────────────────────────────┘
│  • PerceptionEvent: source, modality=AUDIO, content_text, metadata                 │
│  • 来源: mic_pc / mic_hardware                                                      │
│  • 优先级: priority=2 (实时) / 3 (精修)                                             │
└─────────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           感知流 (7) 与下游消费                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
│  • PerceptionStream: L0 原始事件队列 + 滑动窗口                                     │
│  • MemoryDeduper: L1 去重 (deduped_L1/{date}.md)                                   │
│  • WebSocket /api/perception/stream: 订阅 L1 或 L0，推送给前端                        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 音频入口点

| 端点 | 用途 | 客户端 | 音频格式 |
|------|------|--------|----------|
| `POST /api/audio/transcribe` (WebSocket) | PC 前端录音 | 前端 Electron / Web | PCM-16 LE |
| `POST /v4/listen` (WebSocket) | Omi App 兼容 | Omi Flutter App | Opus / PCM8 / PCM16 |
| `POST /api/audio/hardware/{uid}/stream` (WebSocket) | 硬件设备直连 | 硬件传感器 | PCM |

### 2.1 `/api/audio/transcribe`

- **路径**: `/api/audio/transcribe` (WebSocket)
- **协议**: 连接后先发 JSON 初始化消息 `{"is_24x7": bool}`，随后发送 bytes 或 text 消息
- **停止**: 发送 `{"type": "stop", "segment_timestamps": [...]}` 停止
- **分段**: 支持 `{"type": "segment"}` 触发分段

### 2.2 `/v4/listen` (Omi 兼容)

- **路径**: `/v4/listen` (WebSocket)
- **鉴权**: `token` + `uid` 查询参数
- **参数**: `language`, `sample_rate`, `codec`, `channels` 等
- **支持**: 二次处理 (second-pass)、说话人分离、精修结果推感知流

### 2.3 硬件音频流

- **路径**: `/api/audio/hardware/{uid}/stream`
- **用途**: 硬件设备直接推送 PCM 到 ASR，转录结果同样推感知流

---

## 3. 音频解码与预处理

### 3.1 解码

| codec | 处理 |
|-------|------|
| `opus` / `opus_fs320` | opuslib 解码 → PCM-16 LE 16kHz |
| `pcm8` | 8kHz → 16kHz 上采样 (样本加倍) |
| `pcm16` / `pcm` | 透传 |

### 3.2 AGC (自动增益)

- **实现**: `util.audio_utils.apply_agc_to_pcm`
- **策略**: 峰值对齐，目标峰值比 0.85，最大增益 4.0
- **静音检测**: RMS 与 max_abs 低于阈值时跳过增益
- **作用域**: 仅对送入 ASR 的流做 AGC，原始落盘数据不修改（或统一保存前做一次 AGC）

---

## 4. 实时 ASR

- **服务**: 阿里云 DashScope
- **模型**: `fun-asr-realtime`
- **协议**: WebSocket 长连接
- **输入**: PCM-16 LE 16kHz mono
- **输出**: `on_result(text, is_final)` 回调

### 4.1 配置

```yaml
# server/config/default_config.yaml
audio:
  asr:
    api_key: YOUR_LLM_KEY_HERE
    base_url: wss://dashscope.aliyuncs.com/api-ws/v1/inference/
    model: fun-asr-realtime
    sample_rate: 16000
    format: pcm
    semantic_punctuation_enabled: false
    max_sentence_silence: 1300
```

---

## 5. 说话人识别

### 5.1 默认方案: CAM++ (FunASR)

- **模型**: `iic/speech_campplus_sv_zh-cn_16k-common`
- **运行**: 本地，CPU/GPU 可选
- **流程**: 缓冲音频 → 提取 192 维声纹向量 → VoiceprintStore 余弦相似度匹配
- **可选**: FSMN-VAD 语音活动检测，按说话轮次切段

### 5.2 可选方案: Diart (pyannote)

- **默认**: 关闭
- **启用**: `audio.speaker.diart.enabled: true`，需 `pip install diart` 和 HuggingFace 登录
- **特性**: 实时说话人分离，支持重叠说话

### 5.3 配置

```yaml
audio:
  speaker:
    enabled: true
    model: iic/speech_campplus_sv_zh-cn_16k-common
    device: cpu
    min_audio_duration: 2.5
    buffer_duration: 8.0
    vad_enabled: true
    embedding_dim: 192
    similarity_threshold: 0.68
```

---

## 6. 二次处理 (Second-Pass)

**仅对 `/v4/listen` 生效**。

### 6.1 流程

1. 实时 ASR 产生 `is_final` 后，将对应音频片段加入 `audio_chunks`
2. 去抖定时器：`debounce_seconds` 内无新 `is_final` 则触发
3. 按句子边界切片（`latest_final_chunk_idx`），避免截断句子
4. 将 PCM 转为 WAV，上传至 DashScope 临时 OSS
5. 调用 Paraformer-v2 转录 API，支持说话人分离
6. 对每个 segment 用本地 CAM++ 提取声纹，映射到 VoiceprintStore（`speaker_name`）
7. 将精修结果推给客户端 (`transcript_refined`) 和感知流

### 6.2 配置

```yaml
audio:
  second_pass:
    enabled: true
    model: paraformer-v2
    debounce_seconds: 3
    interval_seconds: 30
    diarization_enabled: true
    speaker_count: 0
    language_hints: ["zh", "en"]
```

---

## 7. 感知流发布

### 7.1 发布时机

| 入口 | 时机 | 来源 |
|------|------|------|
| `/api/audio/transcribe` | 每句 `is_final` | `mic_pc` / 查询参数 `source` |
| `/v4/listen` | 实时 v1 或 精修 v2 | `mic_hardware` |
| 硬件流 | 每句 `is_final` | `mic_hardware` |

### 7.2 PerceptionEvent 结构

```python
PerceptionEvent(
    source=SourceType.MIC_PC | MIC_HARDWARE,
    modality=Modality.AUDIO,
    content_text=text,
    metadata={
        "session_id": "…",
        "source_endpoint": "/v4/listen",
        "is_realtime": True | False,
        "speaker": "realtime" | "me" | "说话人 N",
        "speaker_id": int | None,
    },
    priority=2 | 3,  # 2=实时, 3=精修
)
```

---

## 8. 感知流与下游

### 8.1 数据流

```
PerceptionStream (L0)
    │
    ├── MemoryDeduper 订阅 → L1 去重 (deduped_L1/{date}.md)
    │       │
    │       └── 订阅者: 意图识别、TODO 提取等
    │
    └── WebSocket /api/perception/stream
            • 优先订阅 L1 (MemoryDeduper)
            • 无 L1 时回退订阅 L0 (PerceptionStream)
            • 连接时重放最近 N 条事件
```

### 8.2 WebSocket 输出

- **端点**: `/api/perception/stream` 或 `/perception/stream`
- **格式**: JSON，`PerceptionEvent.model_dump(mode="json")`
- **重放**: 连接建立时发送最近 50 条事件

---

## 9. 文件与模块索引

| 模块 | 用途 |
|------|------|
| `routers/audio_ws.py` | 音频 WebSocket 路由、流生成、回调 |
| `routers/audio_ws_handler.py` | 转录流程编排、感知流发布 |
| `routers/audio_ws_segment.py` | 24x7 分段监控与保存 |
| `routers/omi_compat/listen.py` | `/v4/listen` 实现、二次处理 |
| `routers/audio.py` | 音频路由注册、录音列表 |
| `routers/hardware_audio.py` | 硬件音频流 |
| `routers/perception_ws.py` | 感知流 WebSocket |
| `services/asr_client_dashscope.py` | DashScope ASR 客户端 |
| `services/second_pass_asr.py` | 二次处理 (Paraformer-v2 + 声纹映射) |
| `services/diart_diarizer.py` | 说话人分离 (Diart/CAM++) |
| `services/speaker_embedding_client.py` | CAM++ 声纹提取 |
| `services/speaker_service.py` | VoiceprintStore 声纹库 |
| `perception/manager.py` | PerceptionStreamManager |
| `perception/stream.py` | PerceptionStream 发布订阅 |
| `perception/adapters/audio_adapter.py` | 音频事件构建 |
| `memory/deduper.py` | L1 去重 |
| `util/audio_utils.py` | AGC、PCM 转 WAV |

---

## 10. 配置项速查

| 配置路径 | 说明 |
|----------|------|
| `audio.asr.*` | ASR 模型、采样率、WebSocket 等 |
| `audio.speaker.*` | 说话人识别、CAM++、Diart |
| `audio.second_pass.*` | 二次处理开关、去抖、模型 |
| `perception.audio_enabled` | 是否启用音频感知 |
| `perception.audio_source` | 默认音频来源类型 |
