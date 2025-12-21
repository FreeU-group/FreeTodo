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

