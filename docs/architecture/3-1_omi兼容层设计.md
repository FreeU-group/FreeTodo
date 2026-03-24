# Omi 兼容层设计文档

> 本文档描述如何将 omi 的 Flutter App 和硬件接入 LifeTrace Center，作为统一的感知+交互入口。

## 一、架构目标

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              LifeTrace 生态                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────┐      ┌─────────────┐      ┌─────────────────────────┐   │
│  │  omi 硬件   │      │  omi 硬件   │      │      PC Sensor          │   │
│  │  (nRF/ESP32)│      │  (OpenGlass)│      │   (屏幕录制+主动OCR)     │   │
│  └──────┬──────┘      └──────┬──────┘      └───────────┬─────────────┘   │
│         │ BLE                │ BLE                       │ HTTP/WS       │
│         └────────────────────┴───────────────────────────┘               │
│                                    │                                       │
│                           ┌────────┴────────┐                             │
│                           │  omi Flutter App │                             │
│                           │   (改造后)      │                             │
│                           │                 │                             │
│                           │ • 移除 Firebase │                             │
│                           │ • 移除 Google   │                             │
│                           │ • 接入阿里云    │                             │
│                           │ • 连接 Center   │                             │
│                           └────────┬────────┘                             │
│                                    │                                       │
│                           ┌────────┴────────┐                             │
│                           │  LifeTrace Center│                             │
│                           │  (FastAPI)        │                             │
│                           │                  │                             │
│                           │ ┌──────────────┐│                             │
│                           │ │ Omi 兼容层   ││                             │
│                           │ │ • /v4/listen ││                             │
│                           │ │ • /v3/memories││                             │
│                           │ │ • /v2/messages││                             │
│                           │ └──────────────┘│                             │
│                           │                  │                             │
│                           │ ┌──────────────┐│                             │
│                           │ │ 现有模块      ││                             │
│                           │ │ • perception ││                             │
│                           │ │ • memory     ││                             │
│                           │ │ • chat       ││                             │
│                           │ │ • todo       ││                             │
│                           │ └──────────────┘│                             │
│                           └─────────────────┘                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 二、Google 服务替换映射

| omi 原服务 | 用途 | LifeTrace 替换方案 |
|------------|------|-------------------|
| Firebase Auth | 用户认证 (uid) | 简单 Token 认证（单用户场景） |
| Firestore | 会话/记忆存储 | SQLite + SQLModel |
| Pinecone | 向量检索 | ChromaDB（已集成） |
| Redis | 缓存/PubSub | 可选本地 Redis 或内存缓存 |
| Deepgram/Soniox | 实时 STT | DashScope 实时 ASR |
| Google Cloud Storage | 音频文件存储 | 本地文件系统 |
| Firebase FCM | 推送通知 | WebSocket 实时推送 |
| Pusher | 实时事件 | WebSocket（PerceptionStream） |
| Google Analytics | 埋点分析 | 移除或自研 |

## 三、核心 API 兼容层

### 3.1 实时音频转录（最核心）

#### omi 原接口
```python
@router.websocket("/v4/listen")
async def listen_handler(
    websocket: WebSocket,
    uid: str = Depends(auth.get_current_user_uid),  # Firebase Auth
    language: str = 'en',
    sample_rate: int = 8000,
    codec: str = 'pcm8',          # pcm8/pcm16/opus/opus_fs320/lc3/lc3_fs1030
    channels: int = 1,
    include_speech_profile: bool = True,
    conversation_timeout: int = 120,
    source: Optional[str] = None,
    custom_stt: str = 'disabled',
    onboarding: str = 'disabled',
    speaker_auto_assign: str = 'disabled',
)
```

#### LifeTrace 兼容层设计
```python
@router.websocket("/v4/listen")
async def omi_listen_handler(
    websocket: WebSocket,
    token: str,                    # 简单 Token 替代 Firebase Auth
    language: str = 'zh',          # 默认中文
    sample_rate: int = 16000,      # DashScope 最佳采样率
    codec: str = 'opus',           # 优先 Opus（移动端）
    channels: int = 1,
    conversation_timeout: int = 120,
    source: Optional[str] = None,   # 设备标识
)
```

**关键适配点：**
1. **认证替换**：移除 Firebase Auth，改用固定 Token 或简单 JWT
2. **编码支持**：移动端优先 Opus（压缩率高），硬件端可能是 PCM/LC3
3. **ASR 引擎**：Deepgram → DashScope 实时流式 ASR
4. **输出格式**：保持 omi 的 MessageEvent 格式，让 App 无需修改

**WebSocket 消息协议（omi 原协议）：**
```json
// Client -> Server: 音频二进制帧
[opus encoded audio frames...]

// Server -> Client: 转录结果
{
  "type": "transcript",
  "session_id": "uuid",
  "segments": [
    {
      "id": 0,
      "text": "这是识别到的文本",
      "speaker_id": "SPEAKER_00",
      "is_user": true,
      "person_id": "user",
      "start": 0.0,
      "end": 3.5,
      "confidence": 0.95
    }
  ],
  "status": "in_progress"
}

// 会话结束
{
  "type": "conversation_end",
  "conversation_id": "uuid",
  "processing": true
}
```

### 3.2 会话管理 API

| 端点 | 方法 | omi 功能 | LifeTrace 映射 |
|------|------|---------|----------------|
| `/v1/conversations` | GET | 获取会话列表 | 映射到 Event 查询 |
| `/v1/conversations` | POST | 结束当前会话并处理 | 创建新 Event |
| `/v1/conversations/{id}` | GET | 获取单个会话 | 获取单个 Event |
| `/v1/conversations/{id}` | PATCH | 更新会话（标题等） | 更新 Event |
| `/v1/conversations/{id}/reprocess` | POST | 重新处理会话 | 重新 LLM 处理 |
| `/v1/conversations/{id}/visibility` | PATCH | 设置可见性 | 可选实现 |
| `/v1/conversations/{id}/starred` | PATCH | 收藏会话 | 标记重要 |

**数据模型映射：**
```python
# omi Conversation → LifeTrace Event
omi.Conversation {
    id: str
    created_at: datetime
    started_at: datetime
    finished_at: datetime
    transcript_segments: List[TranscriptSegment]
    structured: Structured {  # 提取的结构化信息
        title: str
        overview: str
        action_items: List[ActionItem]
        events: List[Event]
    }
    photos: List[ConversationPhoto]
    geolocation: Geolocation
    visibility: str
    status: str  # in_progress / processing / completed / discarded
}

# 映射到 →
lifetrace.Event {
    event_id: str
    timestamp: datetime
    content: str          # transcript text
    source: str           # "omi_hardware" | "omi_app" | "sensor_pc"
    metadata: dict {       # 兼容 omi 字段
        conversation_id: str
        segments: List[dict]
        structured: dict
        geolocation: dict
    }
}
```

### 3.3 记忆管理 API

| 端点 | 方法 | omi 功能 | LifeTrace 映射 |
|------|------|---------|----------------|
| `/v3/memories` | GET | 获取记忆列表 | 映射到 Memory 查询 |
| `/v3/memories` | POST | 创建记忆 | 创建 Memory |
| `/v3/memories/{id}` | DELETE | 删除记忆 | 删除 Memory |
| `/v3/memories/{id}` | PATCH | 编辑记忆 | 更新 Memory |
| `/v3/memories/{id}/review` | POST | 确认/否认记忆 | 审核标记 |
| `/v3/memories/{id}/visibility` | PATCH | 设置可见性 | 可选 |

### 3.4 聊天 API

| 端点 | 方法 | omi 功能 | LifeTrace 映射 |
|------|------|---------|----------------|
| `/v2/messages` | GET | 获取聊天历史 | 映射到 Chat 查询 |
| `/v2/messages` | POST | 发送消息 | 发送消息 |
| `/v2/initial-message` | POST | 获取初始问候 | 获取问候语 |
| `/v2/messages/{id}/report` | POST | 举报消息 | 可选 |
| `/v2/voice-messages` | POST | 语音消息 | 语音转文字后发送 |

### 3.5 声纹管理 API

| 端点 | 方法 | omi 功能 | LifeTrace 实现优先级 |
|------|------|---------|---------------------|
| `/v3/speech-profile` | GET | 是否有声纹 | P1（区分说话人） |
| `/v3/upload-audio` | POST | 上传声纹样本 | P1 |
| `/v3/speech-profile/expand` | GET | 获取额外样本 | P2 |
| `/v3/speech-profile/expand` | DELETE | 删除样本 | P2 |

### 3.6 用户与认证 API

| 端点 | 方法 | omi 功能 | LifeTrace 替换 |
|------|------|---------|---------------|
| `/v1/users/me` | GET | 获取用户信息 | 固定返回单用户 |
| `/v1/auth` | POST | Firebase Auth | 简单 Token |

**简化认证方案（单用户场景）：**
```python
# 配置文件中预设 token
OMI_COMPAT_TOKEN = "lifetrace-omi-compat-token-2026"

# 验证时直接比对
def verify_omi_token(token: str) -> bool:
    return token == settings.omi_compat_token
```

### 3.7 固件更新 API

| 端点 | 方法 | omi 功能 | LifeTrace 实现 |
|------|------|---------|---------------|
| `/v2/firmware/latest` | GET | 获取最新固件 | 直接代理到 omi GitHub |

**实现方案：**
```python
@router.get("/v2/firmware/latest")
async def get_latest_firmware(device_model: str, firmware_revision: str, ...):
    # 直接转发请求到 omi 官方后端
    # 或者缓存 omi 的 releases 信息
    # 不需要自己维护固件
```

## 四、数据模型兼容

### 4.1 核心模型映射表

```python
# ============================================================
# 1. TranscriptSegment（转录片段）
# ============================================================
# omi 原模型
class TranscriptSegment(BaseModel):
    id: int
    text: str
    speaker_id: str           # "SPEAKER_00", "SPEAKER_01"...
    is_user: bool              # 是否用户本人
    person_id: Optional[str]   # 关联的人物ID
    start: float               # 开始时间（秒）
    end: float                 # 结束时间（秒）
    confidence: float
    language: Optional[str]    # 检测到的语言
    translation: Optional[Translation]

# LifeTrace 兼容表示
# 存储在 Event.metadata["segments"] 中

# ============================================================
# 2. Structured（结构化数据）
# ============================================================
class Structured(BaseModel):
    title: str
    overview: str
    emoji: Optional[str]
    action_items: List[ActionItem]
    events: List[CalendarEvent]

class ActionItem(BaseModel):
    description: str
    completed: bool
    created_at: datetime

class CalendarEvent(BaseModel):
    title: str
    starts_at: datetime
    duration: int
    description: Optional[str]

# ============================================================
# 3. ConversationPhoto（会话照片）
# ============================================================
class ConversationPhoto(BaseModel):
    id: str
    url: str
    description: Optional[str]
    created_at: datetime
    deleted: bool
    deleted_reason: Optional[str]

# LifeTrace 映射：关联到 Event.attachments

# ============================================================
# 4. Geolocation（地理位置）
# ============================================================
class Geolocation(BaseModel):
    latitude: float
    longitude: float
    address: Optional[str]
    place_name: Optional[str]
    place_type: Optional[str]
```

### 4.2 MessageEvent 格式（WebSocket 下行）

```python
# omi 的 WebSocket 下行消息格式（需完全兼容）
class MessageEventType(str, Enum):
    TRANSCRIPT = "transcript"
    CONVERSATION_END = "conversation_end"
    MESSAGE_SERVICE_STATUS = "message_service_status"
    PHOTO_DESCRIBED = "photo_described"
    TRANSLATION = "translation"
    SPEAKER_LABEL_SUGGESTION = "speaker_label_suggestion"
    FREEMIUM_THRESHOLD = "freemium_threshold"

# LifeTrace 需要发出的消息格式
{
    "type": "transcript",
    "session_id": "uuid",
    "segments": [...],
    "status": "in_progress"
}

{
    "type": "conversation_end",
    "conversation_id": "uuid",
    "processing": True,  # 是否正在后端处理
    "has_processed": False
}

{
    "type": "photo_described",
    "description": "照片描述文本"
}
```

## 五、音频编码支持

### 5.1 编码格式优先级

| 编码 | 来源 | 优先级 | LifeTrace 支持方案 |
|------|------|--------|-------------------|
| Opus | omi App (BLE) | P0 | `opuslib` 解码 |
| Opus | omi Web | P0 | `opuslib` 解码 |
| PCM16 | omi 硬件 | P1 | 原生支持 |
| PCM8 | omi 旧硬件 | P2 | 上采样到 PCM16 |
| LC3 | omi CV1 | P2 | `lc3` 库解码 |
| AAC | omi 硬件录音 | P2 | `av` 解码 |

### 5.2 音频处理流水线

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│  硬件/App   │───→│   解码器    │───→│   VAD 门控  │───→│  DashScope  │
│ 音频二进制流 │    │ (opus/pcm)  │    │ (可选)      │    │ 实时 ASR    │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                  │
                                                                  ↓
                                                           ┌─────────────┐
                                                           │  Perception  │
                                                           │   Stream     │
                                                           └─────────────┘
```

## 六、实施路线图

### 阶段 0：基础兼容层（MVP）

**目标**：让 omi App 能连上 LifeTrace Center 完成一次完整的录音-转录-存储

**任务清单：**
- [ ] 1. 创建 `lifetrace/routers/omi_compat.py` 路由文件
- [ ] 2. 实现 `/v4/listen` WebSocket 端点（支持 Opus 编码）
- [ ] 3. 接入 DashScope 实时 ASR
- [ ] 4. 转录结果 → PerceptionStream → Event 存储
- [ ] 5. 实现简单 Token 认证
- [ ] 6. 测试：omi App → Center → 看到转录文本

**工作量预估**：2-3 天

### 阶段 1：会话与记忆兼容

**目标**：会话列表、记忆管理、基础聊天可用

**任务清单：**
- [ ] 1. 实现 `/v1/conversations` GET/POST
- [ ] 2. Event 数据模型兼容 omi Conversation 格式
- [ ] 3. 实现 `/v3/memories` CRUD
- [ ] 4. Memory 向量存储接入 ChromaDB
- [ ] 5. 实现 `/v2/messages` 聊天接口
- [ ] 6. 复用现有 Chat 模块，适配 omi 消息格式

**工作量预估**：3-5 天

### 阶段 2：进阶功能

**目标**：声纹识别、目标追踪、知识图谱

**任务清单：**
- [ ] 1. 实现 `/v3/speech-profile` 声纹管理
- [ ] 2. 集成 Speaker Embedding 模型
- [ ] 3. 说话人识别（区分用户/其他人）
- [ ] 4. 实现 `/v1/goals` 目标追踪
- [ ] 5. 实现 `/v1/knowledge-graph` 知识图谱
- [ ] 6. 目标自动提取（从对话中识别目标进度）

**工作量预估**：5-7 天

### 阶段 3： polish & 优化

**任务清单：**
- [ ] 1. 性能优化（连接稳定性、ASR 延迟）
- [ ] 2. 错误处理完善
- [ ] 3. 完整的 API 测试覆盖
- [ ] 4. 文档完善
- [ ] 5. 移动端适配（移除 Firebase 依赖）

## 七、关键代码结构

### 7.1 新增文件规划

```
lifetrace/
├── routers/
│   ├── omi_compat/                    # 新增目录
│   │   ├── __init__.py
│   │   ├── listen.py                  # /v4/listen WebSocket
│   │   ├── conversations.py           # 会话管理
│   │   ├── memories.py                  # 记忆管理
│   │   ├── chat.py                    # 聊天接口
│   │   ├── speech_profile.py          # 声纹管理
│   │   ├── auth.py                    # 认证
│   │   └── firmware.py                # 固件更新
│   └── ...
├── services/
│   └── omi_compat/                    # 新增目录
│       ├── __init__.py
│       ├── audio_decoder.py           # Opus/LC3/PCM 解码
│       ├── conversation_service.py    # 会话处理逻辑
│       └── asr_adapter.py             # DashScope ASR 适配
├── models/
│   └── omi_compat/                    # 新增目录
│       ├── __init__.py
│       ├── conversation.py            # Pydantic 模型
│       ├── transcript.py
│       ├── message.py
│       └── memory.py
└── ...
```

### 7.2 模块注册

```python
# lifetrace/core/module_registry.py

ModuleDefinition(
    name="omi_compat",
    core=False,
    dependencies=["perception", "memory", "chat"],
    description="Omi App 和硬件兼容层",
)
```

## 八、风险与注意事项

### 8.1 技术风险

| 风险 | 可能性 | 影响 | 缓解措施 |
|------|--------|------|---------|
| Opus 解码性能问题 | 中 | 高 | 预研 `opuslib` 性能，备选 `pyogg` |
| DashScope ASR 延迟过高 | 中 | 高 | 对比测试，备选本地 ASR |
| 并发连接稳定性 | 中 | 中 | WebSocket 连接池管理 |
| 声纹识别准确度 | 高 | 中 | 降低优先级，后期再实现 |

### 8.2 兼容性注意事项

1. **omi App 版本**：建议基于最新版 omi App（v1.x）改造，旧版 API 差异较大
2. **硬件固件**：omi 硬件固件与 App 有协议耦合，需确保固件版本匹配
3. **WebSocket 协议**：必须完全兼容 omi 的 MessageEvent 格式，否则 App 会崩溃
4. **音频编码**：移动端 BLE 传输优先 Opus，但硬件可能是 LC3/PCM

## 九、参考资源

- omi 后端代码：`ref_project/omi_backend/`
- omi Flutter App：`phone/`
- omi 硬件固件：`hardware/omi/`
- omi Glass：`hardware/omiGlass/`
- omi 官方文档：https://docs.omi.me/
- DashScope 实时 ASR：https://help.aliyun.com/document_detail/2712539.html

---

**文档版本**: v1.0  
**创建日期**: 2026-02-27  
**作者**: AI Assistant  
**状态**: 设计阶段
