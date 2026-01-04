# 语音模块技术建议

## 一、实时转录当前状态

### ✅ 已实现的功能
1. **临时结果显示**：已支持显示 `interimResults`（临时识别结果）
2. **实时更新**：临时结果会实时更新，显示灰色斜体
3. **最终结果替换**：识别完成后，临时结果替换为最终结果

### ⚠️ 当前限制（Web Speech API 的特性）

**不是真正的"说一句转录一句"**，原因：

1. **基于停顿识别**：
   - Web Speech API 需要检测到语音停顿（通常 0.5-2 秒）才会返回结果
   - 连续说话时，会累积到停顿才返回
   - 临时结果会更新，但最终结果需要等待停顿

2. **识别延迟**：
   - 临时结果：通常有 0.5-1 秒延迟
   - 最终结果：需要停顿后 1-2 秒才确认

3. **浏览器差异**：
   - Chrome/Edge：支持较好，延迟较低
   - Firefox：不支持 Web Speech API
   - Safari：支持但延迟较高

### 📊 实际体验
- **说话时**：会看到临时文字不断更新（灰色闪烁）
- **停顿后**：临时文字变为最终结果（正常显示）
- **连续说话**：会累积到停顿才分段

---

## 二、针对当前语音模块的建议

### 1. 用户体验优化 ⭐⭐⭐

#### 问题
- 用户可能不知道临时结果和最终结果的区别
- 没有明确的视觉反馈说明"正在识别"

#### 建议
```typescript
// 在 TranscriptionLog 中添加状态提示
{segment.isInterim && (
  <span className="text-xs text-muted-foreground">
    🎤 正在识别...
  </span>
)}
```

### 2. 识别质量优化 ⭐⭐

#### 问题
- Web Speech API 的识别准确率有限
- 没有后处理优化

#### 建议
- ✅ 已实现：LLM 优化文本（修正语法、标点）
- 可增加：关键词高亮、错误标记

### 3. 性能优化 ⭐⭐

#### 问题
- 临时结果更新频繁，可能导致 UI 卡顿
- 长文本列表性能问题

#### 建议
```typescript
// 使用防抖减少更新频率
const debouncedUpdate = useMemo(
  () => debounce((text: string) => {
    updateTranscript(segmentId, { interimText: text });
  }, 300), // 300ms 防抖
  []
);
```

### 4. 错误处理增强 ⭐⭐⭐

#### 问题
- 网络断开时无法识别
- 识别失败时没有明确提示

#### 建议
- 添加网络状态检测
- 识别失败时显示重试按钮
- 降级策略：网络恢复后自动重试

### 5. 功能完善 ⭐⭐⭐⭐

#### 优先级排序
1. **日程 → Todo 自动创建**（核心价值）
2. **语音提取 Todo**（扩展功能）
3. **语音控制 Todo**（提升体验）

---

## 三、技术实现推荐

### 方案对比

#### 方案 1：Web Speech API（当前方案）✅

**优点**：
- ✅ 零配置，浏览器原生支持
- ✅ 免费，无需 API Key
- ✅ 支持离线识别（部分浏览器）
- ✅ 延迟相对较低（0.5-2秒）

**缺点**：
- ❌ 不是真正的实时（基于停顿）
- ❌ 识别准确率有限（约 85-90%）
- ❌ 浏览器兼容性问题（Firefox 不支持）
- ❌ 无法自定义模型

**适用场景**：
- ✅ 当前项目：适合，因为已有 LLM 优化
- ✅ 对实时性要求不高的场景
- ✅ 需要离线支持的场景

---

#### 方案 2：WebSocket + 后端 ASR ⭐⭐⭐⭐

**架构**：
```
前端 → WebSocket → 后端 ASR 服务 → 实时返回结果
```

**技术栈**：
- **前端**：WebSocket API
- **后端**：FunASR / Whisper / 阿里云 ASR
- **协议**：WebSocket 流式传输

**优点**：
- ✅ 真正的实时识别（50-200ms 延迟）
- ✅ 识别准确率高（95%+）
- ✅ 可自定义模型和参数
- ✅ 支持多语言、方言

**缺点**：
- ❌ 需要后端服务（已有，可复用）
- ❌ 需要网络连接
- ❌ 可能有 API 费用（取决于服务）

**实现示例**：
```typescript
// 前端 WebSocket 连接
const ws = new WebSocket('ws://localhost:8000/api/voice/stream');
const mediaRecorder = new MediaRecorder(stream);

mediaRecorder.ondataavailable = (event) => {
  ws.send(event.data); // 发送音频数据
};

ws.onmessage = (event) => {
  const { text, isFinal } = JSON.parse(event.data);
  handleRecognitionResult(text, isFinal);
};
```

**后端实现**（Python）：
```python
# 使用 FunASR（已在系统中）
from funasr import AutoModel

@app.websocket("/api/voice/stream")
async def stream_transcription(websocket: WebSocket):
    await websocket.accept()
    model = AutoModel(model="paraformer-zh")
    
    async for audio_data in websocket.iter_bytes():
        result = model.generate(input=audio_data)
        await websocket.send_json({
            "text": result[0]["text"],
            "isFinal": result[0]["is_final"]
        })
```

**推荐度**：⭐⭐⭐⭐⭐
- 你的系统已有 FunASR 配置
- 可以实现真正的实时识别
- 准确率更高

---

#### 方案 3：WebRTC + 实时 ASR ⭐⭐⭐

**架构**：
```
前端 → WebRTC → 后端实时 ASR → 流式返回
```

**技术栈**：
- WebRTC（低延迟音频传输）
- 后端实时 ASR（FunASR / Whisper）

**优点**：
- ✅ 延迟最低（<100ms）
- ✅ 适合实时对话场景

**缺点**：
- ❌ 实现复杂
- ❌ 需要 WebRTC 服务器

**推荐度**：⭐⭐⭐
- 适合对延迟要求极高的场景
- 当前项目可能过度设计

---

#### 方案 4：混合方案 ⭐⭐⭐⭐⭐

**架构**：
```
Web Speech API（主要） + WebSocket ASR（备用/增强）
```

**策略**：
1. **默认使用 Web Speech API**（免费、简单）
2. **用户可选择切换到后端 ASR**（更准确）
3. **网络断开时自动降级到 Web Speech API**

**实现**：
```typescript
class HybridRecognitionService {
  private mode: 'browser' | 'server' = 'browser';
  private browserService: RecognitionService;
  private serverService: WebSocketRecognitionService;
  
  async start() {
    if (this.mode === 'browser') {
      await this.browserService.start();
    } else {
      await this.serverService.start();
    }
  }
  
  switchMode(mode: 'browser' | 'server') {
    this.mode = mode;
    // 切换服务
  }
}
```

**推荐度**：⭐⭐⭐⭐⭐
- 兼顾用户体验和功能
- 灵活切换
- 适合当前项目

---

## 四、具体实现建议

### 短期（1-2周）

1. **优化当前 Web Speech API 实现**
   - ✅ 已实现临时结果显示
   - 添加防抖优化
   - 改进错误提示

2. **实现日程 → Todo 自动创建**
   - 核心功能，价值最高
   - 代码量小，影响大

### 中期（1个月）

3. **集成后端 ASR（FunASR）**
   - 实现 WebSocket 流式识别
   - 提供"高精度模式"选项
   - 保留 Web Speech API 作为备用

4. **语音提取 Todo**
   - 扩展 LLM Prompt
   - 自动创建 Todo

### 长期（2-3个月）

5. **语音控制 Todo**
   - 命令识别
   - 操作执行

6. **智能摘要**
   - 录音后自动生成摘要

---

## 五、技术选型总结

### 当前阶段：继续使用 Web Speech API ✅

**理由**：
1. 已实现基本功能
2. 零成本、零配置
3. 配合 LLM 优化，准确率可接受
4. 可以快速迭代其他功能

### 下一步：添加后端 ASR 选项 ⭐⭐⭐⭐

**理由**：
1. 系统已有 FunASR 配置
2. 可以实现真正的实时识别
3. 准确率更高
4. 作为"高精度模式"供用户选择

### 最佳实践：混合方案 ⭐⭐⭐⭐⭐

**理由**：
1. 兼顾成本和体验
2. 灵活切换
3. 网络断开时自动降级
4. 适合不同用户需求

---

## 六、代码示例：WebSocket ASR 集成

### 前端实现

```typescript
// services/WebSocketRecognitionService.ts
export class WebSocketRecognitionService {
  private ws: WebSocket | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  
  async start(): Promise<void> {
    // 获取音频流
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // 创建 WebSocket 连接
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/api/voice/stream';
    this.ws = new WebSocket(wsUrl);
    
    this.ws.onmessage = (event) => {
      const { text, isFinal } = JSON.parse(event.data);
      if (this.onResult) {
        this.onResult(text, isFinal);
      }
    };
    
    // 创建 MediaRecorder，实时发送音频
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    this.mediaRecorder.ondataavailable = (event) => {
      if (this.ws?.readyState === WebSocket.OPEN && event.data.size > 0) {
        this.ws.send(event.data);
      }
    };
    
    // 每 100ms 发送一次音频数据
    this.mediaRecorder.start(100);
  }
  
  stop(): void {
    this.mediaRecorder?.stop();
    this.ws?.close();
    this.stream?.getTracks().forEach(track => track.stop());
  }
}
```

### 后端实现

```python
# lifetrace/routers/voice_stream.py
from fastapi import WebSocket
from funasr import AutoModel

model = AutoModel(model="paraformer-zh")

@app.websocket("/api/voice/stream")
async def stream_transcription(websocket: WebSocket):
    await websocket.accept()
    
    try:
        audio_buffer = b""
        while True:
            # 接收音频数据
            data = await websocket.receive_bytes()
            audio_buffer += data
            
            # 每 500ms 处理一次（可调整）
            if len(audio_buffer) > 8000:  # 约 500ms 的音频
                # 调用 ASR
                result = model.generate(input=audio_buffer)
                
                # 发送识别结果
                await websocket.send_json({
                    "text": result[0]["text"],
                    "isFinal": False  # 流式结果
                })
                
                audio_buffer = b""
                
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await websocket.close()
```

---

## 七、总结

### 实时转录现状
- ✅ **已实现**：临时结果显示，接近实时
- ⚠️ **限制**：基于停顿识别，不是真正的"说一句转录一句"
- 💡 **改进**：可以集成后端 ASR 实现真正的实时

### 推荐方案
1. **短期**：继续优化 Web Speech API，添加防抖和错误处理
2. **中期**：集成后端 ASR（FunASR），提供高精度模式
3. **长期**：实现混合方案，用户可选择

### 优先级
1. ⭐⭐⭐⭐ **日程 → Todo 自动创建**（核心功能）
2. ⭐⭐⭐⭐ **集成后端 ASR**（提升体验）
3. ⭐⭐⭐ **语音提取 Todo**（扩展功能）

---

**文档版本**：v1.0  
**最后更新**：2025-12-21  
**维护者**：LifeTrace Team From zy

完善定位、功能设计和实现方案：


[4 tools called]


完善定位、功能设计和实现方案：


[1 tool called]


## 音频模块定位（完善版）

### 核心定位：智能语音工作流中心

不只是会议记录，而是将语音作为输入方式，自动连接 todo、日程、笔记、知识库，形成完整工作流。

### 三大核心价值

1. 零负担记录：说话即记录，无需手动输入
2. 智能提取：自动识别待办、日程、关键信息
3. 无缝集成：与现有系统深度打通，形成闭环

---

## 功能设计（结合现有系统）

### 1. 实时转录（基础能力）

- 说话时实时显示文字（延迟 < 300ms）
- 支持麦克风和系统音频
- 临时结果实时更新，最终结果确认
- 点击文字回放对应音频

### 2. 智能提取（核心创新）

#### 2.1 待办提取（增强）
- 实时提取：边说边提取，无需等待
- 智能理解：理解上下文，识别任务依赖关系
- 自动创建：提取后自动创建 Todo，带标签和优先级
- 关联回放：Todo 可回放原始语音

#### 2.2 日程提取（增强）
- 时间理解：理解“明天下午3点”、“下周三”等自然语言
- 自动创建：提取后自动创建日程，同步到日历
- 提醒设置：根据上下文自动设置提醒
- 冲突检测：检测时间冲突并提示

#### 2.3 关键信息提取（新增）
- 联系人：自动提取姓名、电话、邮箱
- 链接：提取提到的网址、文档链接
- 数字：提取金额、数量、百分比等
- 标签：自动打标签（工作、生活、学习等）

### 3. 会议纪要生成（新增）

- 自动总结：会议结束后自动生成纪要
- 结构化输出：按议题、决策、行动项组织
- 智能摘要：提取关键观点和结论
- 一键导出：支持 Markdown、PDF 等格式

### 4. 知识沉淀（创新）

- 语音笔记：将重要内容转为笔记
- 知识关联：关联相关 todo、日程、文档
- 智能检索：通过语音内容检索历史记录
- 上下文记忆：记住对话上下文，支持多轮对话

### 5. 工作流自动化（创新）

#### 5.1 语音命令
- "创建待办：明天完成报告"
- "添加日程：下周三下午3点开会"
- "搜索：上个月的会议记录"
- "总结：今天的会议要点"

#### 5.2 智能关联
- 录音时间段自动关联系统 Event
- 提取的待办自动关联相关日程
- 会议记录自动关联参会人员（未来）

#### 5.3 自动提醒
- 根据提取的日程自动设置提醒
- 根据待办的截止时间智能提醒
- 根据上下文智能建议后续行动

### 6. 多场景支持（便捷）

- 会议记录：实时转录 + 纪要生成
- 电话录音：自动提取关键信息
- 学习笔记：语音转文字 + 知识整理
- 灵感记录：快速记录想法，后续整理
- 待办管理：语音创建和管理待办

---

## 实现方案（完善版）

### 架构设计：事件驱动的智能流水线

```
音频流 
  ↓
VAD检测（事件驱动）
  ↓
流式识别（300ms窗口）
  ↓
流式策略（智能提交）
  ↓
实时提取（并行处理）
  ├─→ 待办提取 → 自动创建Todo
  ├─→ 日程提取 → 自动创建日程
  ├─→ 关键信息提取 → 知识库
  └─→ 会议纪要 → 笔记系统
  ↓
时间轴对齐（精确时间戳）
  ↓
双向关联（转录 ↔ Todo/日程）
```

### 阶段1：优化流式策略（1周）

#### 1.1 事件驱动的 VAD

```python
class EventDrivenVAD:
    def __init__(self):
        self.voice_started = False
        self.voice_ended = False
        self.silence_duration = 0.0
    
    def detect(self, audio_data):
        has_voice = self._detect_voice(audio_data)
        
        if has_voice and not self.voice_started:
            self.voice_started = True
            self.voice_ended = False
            return "VOICE_STARTED"  # 事件：语音开始
        
        if not has_voice and self.voice_started:
            self.silence_duration += 0.1
            if self.silence_duration > 0.5:  # 静音超过0.5秒
                self.voice_ended = True
                self.voice_started = False
                return "VOICE_ENDED"  # 事件：语音结束
        
        return None
```

#### 1.2 智能流式策略

```python
class StreamingPolicy:
    def __init__(self):
        self.min_chunk = 0.3   # 最小块 300ms
        self.max_chunk = 2.0   # 最大块 2秒
        self.silence_threshold = 0.5
    
    def should_commit(self, duration, has_silence, text_length):
        # 策略1：短句+停顿 → 立即提交最终结果
        if duration < 1.0 and has_silence:
            return True, True  # (should_commit, is_final)
        
        # 策略2：长句+停顿 → 提交最终结果
        if has_silence and duration > 0.5:
            return True, True
        
        # 策略3：连续说话 → 返回部分结果
        if duration > 0.3:
            return True, False  # 返回部分结果
        
        return False, False
```

#### 1.3 优化处理窗口

```python
# 从 600ms → 300ms，更实时
processor = PCMAudioProcessor(
    chunk_duration=0.3,  # 300ms（更实时）
    overlap=0.1,         # 100ms 重叠
    min_samples=4800,    # 300ms @ 16kHz
)
```

### 阶段2：实时智能提取（1周）

#### 2.1 并行提取架构

```python
async def process_recognition_result(text, is_final, timestamp):
    if not is_final:
        return  # 部分结果不提取
    
    # 并行提取，不阻塞
    tasks = [
        extract_todos(text, timestamp),
        extract_schedules(text, timestamp),
        extract_key_info(text, timestamp),
    ]
    
    results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # 自动创建关联
    todos, schedules, key_info = results
    await create_links(todos, schedules, key_info, transcript_id)
```

#### 2.2 增强提取 Prompt

```python
EXTRACTION_PROMPT = """
从以下文本中提取：
1. 待办事项：[TODO: 任务名称 | deadline: 时间 | priority: 优先级]
2. 日程安排：[SCHEDULE: 事件描述 | time: 时间]
3. 关键信息：
   - 联系人：[CONTACT: 姓名 | phone: 电话 | email: 邮箱]
   - 链接：[LINK: 网址]
   - 数字：[NUMBER: 金额/数量]
4. 标签：[TAG: 工作/生活/学习]

注意：
- 理解上下文和依赖关系
- 识别自然语言时间表达
- 提取完整的任务描述
"""
```

#### 2.3 自动创建关联

```python
async def create_links(todos, schedules, transcript_id):
    # 创建待办
    for todo in todos:
        todo_id = await create_todo({
            'name': todo['title'],
            'deadline': todo['deadline'],
            'priority': todo['priority'],
            'source_type': 'voice',
            'source_id': transcript_id,
            'tags': ['语音提取'],
        })
        # 关联回放
        await link_audio_replay(todo_id, transcript_id, todo['timestamp'])
    
    # 创建日程
    for schedule in schedules:
        schedule_id = await create_schedule({
            'title': schedule['description'],
            'start_time': schedule['time'],
            'source_type': 'voice',
            'source_id': transcript_id,
        })
        # 关联回放
        await link_audio_replay(schedule_id, transcript_id, schedule['timestamp'])
```

### 阶段3：会议纪要生成（1周）

#### 3.1 智能总结

```python
async def generate_meeting_summary(transcripts, duration):
    # 收集所有转录文本
    full_text = "\n".join([t.text for t in transcripts])
    
    # LLM 总结
    summary = await llm.summarize(
        text=full_text,
        format="structured",  # 结构化输出
        sections=["议题", "决策", "行动项", "关键信息"],
    )
    
    # 自动提取行动项
    action_items = extract_action_items(summary)
    
    # 创建关联
    for item in action_items:
        await create_todo_from_action_item(item, transcripts)
    
    return summary
```

#### 3.2 一键导出

```python
async def export_summary(summary, format="markdown"):
    if format == "markdown":
        return generate_markdown(summary)
    elif format == "pdf":
        return generate_pdf(summary)
    elif format == "json":
        return json.dumps(summary)
```

### 阶段4：工作流自动化（2周）

#### 4.1 语音命令识别

```python
class VoiceCommandProcessor:
    def __init__(self):
        self.commands = {
            "创建待办": self.create_todo,
            "添加日程": self.create_schedule,
            "搜索": self.search,
            "总结": self.summarize,
        }
    
    async def process(self, text):
        for cmd, handler in self.commands.items():
            if cmd in text:
                return await handler(text)
        return None
```

#### 4.2 智能关联 Event

```python
async def link_to_event(transcript, start_time, end_time):
    # 查找对应时间段的 Event
    events = await find_events_in_range(start_time, end_time)
    
    for event in events:
        # 关联转录
        await link_transcript_to_event(transcript.id, event.id)
        # 关联音频
        await link_audio_to_event(audio_segment.id, event.id)
```

---

## 创新点总结

1. 事件驱动：VAD 触发识别，而非固定时间
2. 智能提交：根据语音特征决定何时提交结果
3. 实时提取：边说边提取，无需等待
4. 自动关联：提取后自动创建并关联 todo/日程
5. 双向回放：todo/日程可回放原始语音
6. 工作流自动化：语音命令直接操作系统
7. 知识沉淀：语音内容转为可检索的知识

---

## 实施优先级

- P0（立即）：优化流式策略、实时提取、自动创建关联
- P1（1周内）：会议纪要生成、语音命令
- P2（1月内）：说话人分离、实时翻译、知识图谱

需要我开始实现哪个部分？建议先从 P0 的流式策略优化开始。

