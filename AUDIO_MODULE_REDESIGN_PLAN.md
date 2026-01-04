# 音频模块全面改造方案 - 与 LifeTrace 系统深度整合

## 📋 功能定位

将音频模块改造为 **LifeTrace 智能生活记录系统**的核心组成部分，与现有功能（待办、日记、日程、事件、活动）深度整合，实现：
- 实时录音转录，自动关联到事件和活动
- 智能提取待办事项，自动创建 Todo
- 智能提取日程信息，自动保存到 Schedule
- 支持创建日记记录，关联音频内容
- 说话人识别，区分不同参与者
- 文件上传处理，支持音频、视频、文档、图片

**核心特色**：音频模块不是孤立功能，而是 LifeTrace 系统智能记录和上下文关联的重要数据源。

---

## 🎯 核心功能规划

### 1. 实时录制模块（与事件系统整合）

#### 1.1 麦克风录制（主要功能）
- ✅ **设备检测**：自动检测所有音频输入设备（麦克风、耳机、USB麦克风等）
- ✅ **设备选择**：支持用户选择不同的输入设备
- ✅ **实时转录**：使用 WebSocket + Faster-Whisper 实现实时转录（延迟 < 300ms）
- ✅ **说话人识别**：区分不同说话人的音色（Speaker Diarization）
- ✅ **实时显示**：边说边显示转录结果，支持部分结果和最终结果
- ✅ **音频存储**：同时保存高质量音频文件（用于回放和后续处理）

#### 1.2 与事件系统整合
- **自动创建事件**：录音开始时自动创建 Event，录音结束时自动结束事件
- **事件关联**：录音内容自动关联到对应的事件
- **活动聚合**：录音事件可以自动聚合到 Activity（15分钟窗口）
- **上下文关联**：录音期间的系统截图可以关联到录音事件

#### 1.3 录制功能
- **开始/暂停/继续/停止**：完整的录制控制
- **实时波形显示**：可视化音频输入
- **音量检测**：实时显示音频输入音量
- **录制时长显示**：显示当前录制时长
- **自动分段**：按时间或静音自动分段

---

### 2. 文件上传模块（与附件系统整合）

#### 2.1 支持的文件类型
- **音频文件**：MP3, WAV, M4A, FLAC, OGG, WebM 等
- **视频文件**：MP4, AVI, MOV, MKV, WebM 等（提取音频轨道）
- **文档文件**：PDF, DOCX, TXT 等（OCR 提取文字）
- **图片文件**：PNG, JPG, JPEG 等（OCR 提取文字）

#### 2.2 与附件系统整合
- **自动创建 Attachment**：上传的文件自动创建 Attachment 记录
- **文件去重**：使用 file_hash 避免重复存储
- **关联待办**：可以关联到 Todo（通过 TodoAttachmentRelation）
- **关联日记**：可以关联到 Journal

#### 2.3 上传处理流程
```
文件上传
  ↓
文件类型检测
  ↓
创建 Attachment 记录
  ↓
┌─────────────────┬─────────────────┬─────────────────┐
│  音频/视频文件   │   文档文件       │   图片文件       │
│                 │                 │                 │
│  提取音频轨道   │  OCR文字提取     │  OCR文字提取     │
│  ↓              │  ↓              │  ↓              │
│  音频转录      │  文字内容        │  文字内容        │
│  ↓              │  ↓              │  ↓              │
│  说话人识别     │  直接处理        │  直接处理        │
│  ↓              │                 │                 │
│  创建 Event     │  创建 Event     │  创建 Event     │
│  ↓              │  ↓              │  ↓              │
│  AI总结         │  AI总结         │  AI总结         │
│  ↓              │  ↓              │  ↓              │
│  提取待办/日程  │  提取待办/日程  │  提取待办/日程  │
└─────────────────┴─────────────────┴─────────────────┘
```

---

### 3. AI 智能处理模块（与系统功能整合）

#### 3.1 转录结果优化
- **文本修正**：使用 LLM 修正转录错误
- **标点符号**：自动添加标点符号
- **分段优化**：智能分段，按语义和停顿
- **格式整理**：统一格式，去除重复词

#### 3.2 会议纪要生成
- **通用模板**：标准会议纪要格式
- **自定义模板**：支持用户自定义模板
- **章节划分**：自动划分会议章节
- **关键信息提取**：
  - 会议主题
  - 参会人员
  - 讨论要点
  - 决策事项
  - 待办事项（自动创建 Todo）
  - 行动计划

#### 3.3 待办事项提取（与 Todo 系统整合）✨
- **自动识别**：从转录文本中提取待办事项
- **自动创建 Todo**：提取的待办自动创建 Todo 记录
- **责任人分配**：结合说话人识别，分配责任人（存储在 Todo.description）
- **截止时间**：识别时间信息，设置 Todo.deadline
- **优先级**：根据上下文判断优先级，设置 Todo.priority
- **关联事件**：Todo.related_activities 关联到录音事件
- **关联附件**：通过 TodoAttachmentRelation 关联音频文件

#### 3.4 日程信息提取（与 Schedule 系统整合）✨
- **时间识别**：识别录音中的时间信息
- **自动创建 Schedule**：提取的日程自动保存到 Schedule
- **关联事件**：Schedule.sourceSegmentId 关联到录音片段
- **状态管理**：Schedule.status（pending/confirmed/cancelled）

#### 3.5 日记创建（与 Journal 系统整合）✨
- **一键创建日记**：从录音内容创建日记记录
- **自动填充**：Journal.user_notes 自动填充转录文本或摘要
- **关联附件**：可以关联音频文件到日记
- **标签支持**：支持添加标签（通过 JournalTagRelation）

---

### 4. 说话人识别模块（Speaker Diarization）

#### 4.1 功能特性
- **音色识别**：区分不同说话人的音色特征
- **说话人标注**：自动为每段文字标注说话人
- **说话人管理**：
  - 上传说话人音频样本（用于训练/识别）
  - 手动标注说话人姓名
  - 说话人信息管理（姓名、角色等）

#### 4.2 数据存储
- **Speaker 表**：存储说话人信息（新增数据模型）
- **TranscriptSegment 表**：存储转录片段，关联说话人（新增数据模型）

---

### 5. 数据管理模块（与系统整合）

#### 5.1 录音记录管理
- **列表展示**：所有录音记录的列表（基于 Event 表）
- **搜索过滤**：按时间、关键词、说话人等搜索
- **详情查看**：
  - 转录文本（关联到 Event）
  - 音频回放（关联到 Attachment）
  - 会议纪要（存储在 Event.ai_summary）
  - 待办事项（关联的 Todo）
  - 日程信息（关联的 Schedule）
  - 说话人信息（关联的 Speaker）

#### 5.2 文件管理
- **上传历史**：查看所有上传的文件（基于 Attachment 表）
- **处理状态**：显示文件处理状态（上传中、处理中、完成、失败）
- **批量操作**：批量删除、批量导出等

---

## 🔗 与 LifeTrace 系统整合点

### 1. 与 Event 系统整合
- **自动创建事件**：录音开始时创建 Event，app_name 为 "Audio Recording"
- **事件关联**：录音内容存储在 Event.ai_summary
- **事件标题**：Event.ai_title 自动生成（如："会议录音 - 2025-12-24"）

### 2. 与 Activity 系统整合
- **活动聚合**：录音事件自动聚合到 Activity（15分钟窗口）
- **活动标题**：Activity.ai_title 可以包含录音信息

### 3. 与 Todo 系统整合
- **自动创建待办**：从录音中提取的待办自动创建 Todo
- **关联事件**：Todo.related_activities 关联到录音事件
- **关联附件**：通过 TodoAttachmentRelation 关联音频文件

### 4. 与 Schedule 系统整合
- **自动创建日程**：从录音中提取的日程自动保存到 Schedule
- **关联事件**：Schedule.sourceSegmentId 关联到录音片段

### 5. 与 Journal 系统整合
- **一键创建日记**：从录音内容创建 Journal
- **关联附件**：可以关联音频文件到日记

### 6. 与 Attachment 系统整合
- **文件存储**：所有上传的音频/视频文件创建 Attachment 记录
- **文件去重**：使用 Attachment.file_hash 避免重复存储
- **关联关系**：通过 TodoAttachmentRelation、JournalTagRelation 等关联

---

## 🎨 UI/UX 设计（与系统风格一致）

### 设计原则
1. **统一风格**：使用 Tailwind CSS + shadcn/ui，与系统其他页面保持一致
2. **面板布局**：采用 Panel 布局，可以嵌入到系统的面板系统中
3. **深色模式**：支持深色模式切换
4. **响应式设计**：适配不同屏幕尺寸

### 1. 主界面布局（Panel 风格）

```
┌─────────────────────────────────────────────────────────┐
│  PanelHeader: [图标] 音频记录                            │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  标签页: [实时录音] [文件上传] [历史记录]       │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  主要内容区域（根据标签页显示）                  │   │
│  │                                                   │   │
│  │  [实时录音界面 / 文件上传界面 / 历史记录界面]   │   │
│  │                                                   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

### 2. 实时录音界面

```
┌─────────────────────────────────────────────────────────┐
│  录音控制栏                                              │
│  [设备选择 ▼] [开始录音] [暂停] [停止] [时长: 00:00]    │
│  ┌─────────────────────────────────────────────────┐   │
│  │  实时波形显示                                    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  实时转录区域                                    │   │
│  │  [说话人A] 这是第一段话...                       │   │
│  │  [说话人B] 这是第二段话...                       │   │
│  │  [说话人A] 正在说话中... (临时结果，灰色斜体)   │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  智能提取区域（实时显示）                        │   │
│  │  📋 待办事项:                                    │   │
│  │    • [自动创建] 完成项目报告 (说话人A)          │   │
│  │  📅 日程安排:                                    │   │
│  │    • [自动创建] 明天下午2点开会                  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  操作按钮                                        │   │
│  │  [创建日记] [查看事件] [导出]                   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 3. 历史记录界面（与系统风格一致）

```
┌─────────────────────────────────────────────────────────┐
│  搜索和过滤                                              │
│  [搜索框] [时间范围] [说话人] [标签]                    │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  记录列表（Card 风格，类似 TodoCard）            │   │
│  │  ┌───────────────────────────────────────────┐ │   │
│  │  │ 📹 会议录音 - 2025-12-24 09:59           │ │   │
│  │  │ 时长: 0:47 | 字数: 1200 | 说话人: 2人     │ │   │
│  │  │ 关联: [事件 #42] [待办 x3] [日程 x2]      │ │   │
│  │  │ [查看详情] [创建日记] [删除]              │ │   │
│  │  └───────────────────────────────────────────┘ │   │
│  │  ┌───────────────────────────────────────────┐ │   │
│  │  │ 📁 上传文件 - meeting.mp3                │ │   │
│  │  │ 文件名: meeting.mp3 | 状态: 已完成       │ │   │
│  │  │ 关联: [事件 #43] [待办 x1]                │ │   │
│  │  │ [查看详情] [下载] [删除]                  │ │   │
│  │  └───────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 4. 详情界面（与 TodoDetail 风格一致）

```
┌─────────────────────────────────────────────────────────┐
│  DetailHeader: [← 返回] 会议录音 - 2025-12-24 09:59     │
│  12月24日 周三 09:59 | 时长: 0:47 | 字数: 1200          │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────┬──────────────────────────────────────────┐ │
│  │          │  标签页: [转写结果] [会议纪要] [关联]    │ │
│  │  时间轴  │                                          │ │
│  │          │  ┌────────────────────────────────────┐│ │
│  │  00:00   │  │ 转写结果                          ││ │
│  │  00:10   │  │ [说话人A] 第一段话...             ││ │
│  │  00:20   │  │ [说话人B] 第二段话...             ││ │
│  │  00:30   │  │                                    ││ │
│  │  00:40   │  │                                    ││ │
│  │          │  └────────────────────────────────────┘│ │
│  │          │                                          │ │
│  │          │  [添加到笔记] [复制] [导出]            │ │
│  └──────────┴──────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  关联信息                                        │   │
│  │  📋 待办事项 (3):                                │   │
│  │    • [Todo #1] 完成项目报告                      │   │
│  │  📅 日程安排 (2):                                │   │
│  │    • [Schedule #1] 明天下午2点开会              │   │
│  │  📝 关联事件: [Event #42]                        │   │
│  │  📎 附件: [meeting_audio.webm]                   │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 🔧 技术实现方案

### 1. 后端改造

#### 1.1 新增路由模块
- `routers/audio_recording.py` - 音频录音管理（整合 Event）
- `routers/audio_upload.py` - 文件上传处理（整合 Attachment）
- `routers/speaker_diarization.py` - 说话人识别
- `routers/audio_summary.py` - 会议纪要生成
- `routers/audio_todo_extraction.py` - 从音频提取待办（整合 Todo）
- `routers/audio_schedule_extraction.py` - 从音频提取日程（整合 Schedule）

#### 1.2 修改现有模块
- `routers/voice_stream_whisperlivekit_native.py` - 改为麦克风模式，录音开始时创建 Event
- `routers/audio.py` - 增强文件上传和处理功能，整合 Attachment
- `routers/audio_device.py` - 改为检测输入设备（麦克风、耳机等）
- `routers/todo_extraction.py` - 扩展支持从音频提取待办
- `routers/schedules.py` - 扩展支持从音频提取日程

#### 1.3 新增服务模块
- `services/speaker_diarization_service.py` - 说话人识别服务
- `services/audio_processor.py` - 音频处理服务（格式转换、提取等）
- `services/video_processor.py` - 视频处理服务（提取音频轨道）
- `services/file_processor.py` - 文件处理服务（统一入口）
- `services/audio_todo_extraction_service.py` - 从音频提取待办服务
- `services/audio_schedule_extraction_service.py` - 从音频提取日程服务

#### 1.4 数据模型扩展
- `storage/models.py` - 新增表：
  - `AudioRecording` - 音频录音记录（关联 Event）
  - `Speaker` - 说话人信息
  - `TranscriptSegment` - 转录片段（关联说话人）
  - `AudioSummary` - 音频摘要（关联 Event）

---

### 2. 前端改造

#### 2.1 新增组件（遵循系统风格）
- `components/audio/AudioRecordingPanel.tsx` - 音频录音面板（Panel 风格）
- `components/audio/AudioUploadPanel.tsx` - 文件上传面板
- `components/audio/AudioHistoryPanel.tsx` - 历史记录面板
- `components/audio/SpeakerSelector.tsx` - 说话人选择/管理组件
- `components/audio/AudioSummary.tsx` - 会议纪要展示组件
- `components/audio/TranscriptViewer.tsx` - 转录结果查看组件
- `components/audio/AudioDetail.tsx` - 音频详情组件（类似 TodoDetail）

#### 2.2 修改现有组件
- `apps/voice-module/VoiceModulePanel.tsx` - 完全重构，改为 Panel 风格，整合系统功能
- `apps/voice-module/services/RecordingService.ts` - 改为只支持麦克风输入，录音时创建 Event
- `apps/voice-module/services/WebSocketRecognitionService.ts` - 保持不变（用于实时转录）

#### 2.3 新增服务
- `services/SpeakerDiarizationService.ts` - 说话人识别服务
- `services/FileUploadService.ts` - 文件上传服务
- `services/AudioTodoExtractionService.ts` - 从音频提取待办服务
- `services/AudioScheduleExtractionService.ts` - 从音频提取日程服务

#### 2.4 整合到系统面板
- 在 `components/layout/PanelContent.tsx` 中添加音频面板支持
- 在 `lib/store/ui-store.ts` 中添加音频面板配置

---

### 3. 说话人识别实现

#### 3.1 技术选型
- **方案A**：pyannote.audio（推荐）
  - 功能强大，准确率高
  - 支持预训练模型
  - 需要 GPU 加速（可选）
  
- **方案B**：resemblyzer
  - 轻量级，速度快
  - 适合实时场景
  - 准确率略低

#### 3.2 实现流程
```
音频输入
  ↓
VAD（语音活动检测）
  ↓
说话人嵌入提取（Speaker Embedding）
  ↓
聚类（Clustering）
  ↓
说话人标签分配
  ↓
与转录结果关联
  ↓
保存到 TranscriptSegment 表
```

#### 3.3 API 设计
```python
# 说话人识别
POST /api/speaker/diarize
{
  "audio_file": "path/to/audio.wav",
  "num_speakers": null,  # 自动检测或指定数量
  "min_speaker_duration": 1.0  # 最小说话时长（秒）
}

# 上传说话人样本
POST /api/speaker/upload-sample
{
  "name": "张三",
  "audio_file": "path/to/sample.wav"
}

# 说话人管理
GET /api/speaker/list
POST /api/speaker/create
PUT /api/speaker/{id}
DELETE /api/speaker/{id}
```

---

### 4. 文件处理流程

#### 4.1 音频文件处理
```
上传音频文件
  ↓
创建 Attachment 记录
  ↓
格式检测和转换（统一转为 WAV 16kHz）
  ↓
音频转录（Faster-Whisper）
  ↓
说话人识别（pyannote.audio）
  ↓
创建 Event（app_name = "Audio Upload"）
  ↓
文本优化（LLM）
  ↓
生成会议纪要（LLM）
  ↓
提取待办事项（LLM）→ 自动创建 Todo
  ↓
提取日程信息（LLM）→ 自动创建 Schedule
  ↓
保存到数据库
```

#### 4.2 视频文件处理
```
上传视频文件
  ↓
创建 Attachment 记录
  ↓
提取音频轨道（ffmpeg）
  ↓
[后续流程同音频文件]
```

#### 4.3 文档/图片文件处理
```
上传文档/图片
  ↓
创建 Attachment 记录
  ↓
OCR 文字提取（RapidOCR）
  ↓
创建 Event（app_name = "Document Upload"）
  ↓
文本优化（LLM）
  ↓
生成摘要（LLM）
  ↓
提取待办事项（LLM）→ 自动创建 Todo
  ↓
提取日程信息（LLM）→ 自动创建 Schedule
  ↓
保存到数据库
```

---

## 📊 数据库设计

### AudioRecording（音频录音记录）
```sql
CREATE TABLE audio_recordings (
    id INTEGER PRIMARY KEY,
    event_id INTEGER,  -- 关联 Event
    attachment_id INTEGER,  -- 关联 Attachment（音频文件）
    start_time DATETIME,
    end_time DATETIME,
    duration_seconds INTEGER,
    transcript_text TEXT,
    summary_text TEXT,
    num_speakers INTEGER,
    created_at DATETIME,
    updated_at DATETIME
);
```

### Speaker（说话人）
```sql
CREATE TABLE speakers (
    id INTEGER PRIMARY KEY,
    name TEXT,
    role TEXT,  -- 角色（如：主持人、参会者等）
    embedding_path TEXT,  -- 说话人嵌入向量文件路径
    sample_audio_path TEXT,  -- 样本音频路径
    created_at DATETIME,
    updated_at DATETIME
);
```

### TranscriptSegment（转录片段）
```sql
CREATE TABLE transcript_segments (
    id INTEGER PRIMARY KEY,
    audio_recording_id INTEGER,  -- 关联 AudioRecording
    speaker_id INTEGER,  -- 关联 Speaker
    start_time FLOAT,
    end_time FLOAT,
    text TEXT,
    is_final BOOLEAN,
    created_at DATETIME
);
```

### AudioSummary（音频摘要）
```sql
CREATE TABLE audio_summaries (
    id INTEGER PRIMARY KEY,
    audio_recording_id INTEGER,  -- 关联 AudioRecording
    template_type TEXT,  -- 'general', 'custom'
    summary_text TEXT,
    chapters JSON,  -- 章节信息
    qa_highlights JSON,  -- 问答要点
    created_at DATETIME,
    updated_at DATETIME
);
```

**注意**：这些表与现有的 Event、Todo、Schedule、Journal、Attachment 表通过外键关联。

---

## 🚀 实施计划

### 阶段1：基础改造（1-2周）
1. ✅ 修改音频设备检测，改为检测输入设备（麦克风、耳机等）
2. ✅ 修改录音服务，移除系统音频相关代码，只支持麦克风
3. ✅ 录音开始时自动创建 Event
4. ✅ 重构 UI，改为 Panel 风格，与系统其他页面一致
5. ✅ 实现文件上传功能（音频、视频、文档、图片），整合 Attachment

### 阶段2：核心功能（2-3周）
1. ✅ 实现说话人识别功能
2. ✅ 实现会议纪要生成
3. ✅ 实现从音频提取待办，自动创建 Todo
4. ✅ 实现从音频提取日程，自动创建 Schedule
5. ✅ 实现一键创建日记功能

### 阶段3：整合和完善（1-2周）
1. ✅ 与 Event 系统深度整合
2. ✅ 与 Activity 系统整合
3. ✅ 与 Todo、Schedule、Journal 系统整合
4. ✅ UI/UX 优化，确保与系统风格一致
5. ✅ 错误处理和异常情况
6. ✅ 测试和修复

---

## 📝 注意事项

### 1. 麦克风权限
- 需要确保浏览器/Electron 有麦克风权限
- 提供清晰的权限请求提示

### 2. 说话人识别性能
- 实时识别可能较慢，建议异步处理
- 对于长音频，可以分段处理

### 3. 文件处理
- 大文件上传需要支持分片上传
- 处理过程需要显示进度
- 支持取消处理

### 4. 数据存储
- 音频文件可能较大，需要考虑存储空间
- 提供文件清理和归档功能

### 5. 系统整合
- 确保与现有系统的数据模型兼容
- 保持 API 风格一致
- 确保 UI 风格统一

---

## 🎯 成功标准

1. ✅ 可以实时录制麦克风音频并转录
2. ✅ 可以区分不同说话人
3. ✅ 可以上传音频/视频/文档/图片文件并处理
4. ✅ 录音自动创建 Event，可以查看关联的事件
5. ✅ 提取的待办自动创建 Todo，可以在待办列表中查看
6. ✅ 提取的日程自动保存到 Schedule，可以在日程中查看
7. ✅ 可以一键创建日记，关联音频内容
8. ✅ UI 美观易用，与系统其他页面风格一致
9. ✅ 所有功能与 LifeTrace 系统深度整合

---

## 📚 参考资料

- [LifeTrace 系统架构](../lifetrace/README.md)
- [数据模型定义](../lifetrace/storage/models.py)
- [前端开发指南](../.github/FRONTEND_GUIDELINES_CN.md)
- [pyannote.audio](https://github.com/pyannote/pyannote-audio)
- [resemblyzer](https://github.com/resemble-ai/resemblyzer)
- [Faster-Whisper](https://github.com/guillaumekln/faster-whisper)
