# 音频模块详细实施计划

## 📋 总体架构

```
音频捕获 → 实时识别 → 文本优化 → 日程提取 → 存储 → 回放
```

---

## 阶段1：音频捕获（完善优化）

### 1.1 麦克风音频捕获（外部音频）

#### 当前实现
- 使用 `navigator.mediaDevices.getUserMedia` API
- 基本功能可用，但需要优化

#### 优化方案

**1.1.1 音频质量优化**
```typescript
// RecordingService.ts
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    // 基础设置
    echoCancellation: true,      // 回声消除
    noiseSuppression: true,       // 噪声抑制
    autoGainControl: true,        // 自动增益控制
    
    // 高级设置（如果浏览器支持）
    sampleRate: 48000,           // 采样率：48kHz（高质量）
    channelCount: 1,              // 单声道（语音识别足够）
    sampleSize: 16,              // 16位采样
    
    // 延迟优化
    latency: 0.01,               // 低延迟模式（10ms）
    echoCancellationType: 'system', // 使用系统级回声消除
  }
});
```

**1.1.2 设备选择优化**
```typescript
// 获取可用音频设备列表
const devices = await navigator.mediaDevices.enumerateDevices();
const audioInputs = devices.filter(device => device.kind === 'audioinput');

// 让用户选择设备（或自动选择最佳设备）
const selectedDeviceId = await selectBestAudioDevice(audioInputs);

// 使用选定的设备
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    deviceId: { exact: selectedDeviceId },
    // ... 其他设置
  }
});
```

**1.1.3 错误处理和重试机制**
```typescript
async function getUserMediaWithRetry(maxRetries = 3): Promise<MediaStream> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { /* ... */ }
      });
      
      // 验证流是否有效
      if (stream.getAudioTracks().length > 0) {
        return stream;
      }
      
      // 如果无效，清理并重试
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      
      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  
  throw new Error('无法获取音频流');
}
```

**1.1.4 音频质量监控**
```typescript
// 监控音频质量
function monitorAudioQuality(stream: MediaStream) {
  const audioTrack = stream.getAudioTracks()[0];
  const settings = audioTrack.getSettings();
  
  console.log('音频设置:', {
    sampleRate: settings.sampleRate,
    channelCount: settings.channelCount,
    echoCancellation: settings.echoCancellation,
    noiseSuppression: settings.noiseSuppression,
    autoGainControl: settings.autoGainControl,
  });
  
  // 监听音频轨道状态
  audioTrack.addEventListener('ended', () => {
    console.warn('音频轨道已结束');
  });
  
  audioTrack.addEventListener('mute', () => {
    console.warn('音频轨道已静音');
  });
  
  // 监控音频电平（用于检测是否有声音）
  const audioContext = new AudioContext();
  const analyser = audioContext.createAnalyser();
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);
  
  const dataArray = new Uint8Array(analyser.frequencyBinCount);
  
  function checkAudioLevel() {
    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    
    if (average < 10) {
      console.warn('音频电平过低，可能没有声音输入');
    }
  }
  
  setInterval(checkAudioLevel, 1000);
}
```

#### 工具和API
- **Web API**: `navigator.mediaDevices.getUserMedia`
- **Web API**: `navigator.mediaDevices.enumerateDevices`
- **Web API**: `MediaStreamTrack.getSettings()`
- **Web API**: `AudioContext`, `AnalyserNode`

#### 测试要点
1. ✅ 不同浏览器的兼容性（Chrome, Edge, Firefox, Safari）
2. ✅ 不同操作系统的兼容性（Windows, macOS, Linux）
3. ✅ 不同音频设备的兼容性（内置麦克风、外接麦克风、USB麦克风）
4. ✅ 音频质量验证（采样率、声道数、延迟）
5. ✅ 错误处理验证（权限拒绝、设备不可用、设备断开）

---

### 1.2 系统音频捕获

#### 当前实现
- 使用 `navigator.mediaDevices.getDisplayMedia` API
- 需要用户手动选择标签页

#### 优化方案

**1.2.1 Electron 环境优化**
```typescript
// 使用 Electron desktopCapturer API
// preload.ts (已在之前创建)
contextBridge.exposeInMainWorld('electronAPI', {
  getSystemAudioSources: async () => {
    return await ipcRenderer.invoke('get-system-audio-sources');
  },
  
  getSystemAudioStream: async (sourceId?: string) => {
    return await ipcRenderer.invoke('get-system-audio-stream', sourceId);
  },
});

// main.ts (已在之前创建)
ipcMain.handle('get-system-audio-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
  });
  
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    display_id: source.display_id,
  }));
});
```

**1.2.2 浏览器环境优化**
```typescript
// RecordingService.ts
async function getSystemAudioStream(): Promise<MediaStream> {
  // 检查是否在 Electron 环境
  const electronAPI = (window as any).electronAPI;
  
  if (electronAPI) {
    // Electron 环境：尝试自动选择源
    try {
      const sources = await electronAPI.getSystemAudioSources();
      if (sources.length > 0) {
        // 自动选择第一个源（或让用户选择）
        const selectedSource = sources[0];
        console.log('自动选择音频源:', selectedSource.name);
      }
    } catch (error) {
      console.warn('Electron API 不可用，回退到标准 API');
    }
  }
  
  // 使用标准 getDisplayMedia API
  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      // 尝试请求系统音频（如果浏览器支持）
      suppressLocalAudioPlayback: false, // 不抑制本地音频播放
    } as MediaTrackConstraints,
    video: {
      displaySurface: 'browser', // 只捕获浏览器标签页
    },
  });
  
  // 验证是否有音频轨道
  if (stream.getAudioTracks().length === 0) {
    throw new Error('无法获取系统音频，请确保选择了包含音频的标签页');
  }
  
  // 移除视频轨道（我们只需要音频）
  stream.getVideoTracks().forEach(track => track.stop());
  
  return stream;
}
```

**1.2.3 用户体验优化**
```typescript
// 显示友好的提示
function showSystemAudioPrompt() {
  // 可以通过 UI 组件显示提示
  return new Promise<boolean>((resolve) => {
    // 显示提示对话框
    const confirmed = confirm(
      '需要捕获系统音频。\n\n' +
      '1. 点击"确定"后，浏览器会弹出选择窗口\n' +
      '2. 请选择要共享的标签页（包含音频）\n' +
      '3. 确保勾选"共享音频"选项\n\n' +
      '是否继续？'
    );
    
    resolve(confirmed);
  });
}

// 在 RecordingService 中使用
async start(): Promise<void> {
  if (this.audioSource === 'system') {
    const confirmed = await showSystemAudioPrompt();
    if (!confirmed) {
      throw new Error('用户取消了系统音频捕获');
    }
    
    // 继续获取音频流...
  }
}
```

**1.2.4 音频源选择UI（可选）**
```typescript
// 如果是在 Electron 环境，可以提供音频源选择UI
async function selectAudioSource(): Promise<string | null> {
  const electronAPI = (window as any).electronAPI;
  
  if (!electronAPI) {
    return null; // 浏览器环境，使用默认流程
  }
  
  const sources = await electronAPI.getSystemAudioSources();
  
  if (sources.length === 0) {
    return null;
  }
  
  if (sources.length === 1) {
    // 只有一个源，自动选择
    return sources[0].id;
  }
  
  // 多个源，让用户选择（可以通过 UI 组件实现）
  // 这里简化处理，返回第一个
  return sources[0].id;
}
```

#### 工具和API
- **Electron API**: `desktopCapturer.getSources()`
- **Web API**: `navigator.mediaDevices.getDisplayMedia`
- **Web API**: `MediaStreamTrack.getSettings()`

#### 测试要点
1. ✅ Electron 环境的兼容性
2. ✅ 浏览器环境的兼容性（Chrome, Edge）
3. ✅ 不同操作系统的兼容性（Windows, macOS, Linux）
4. ✅ 音频源选择功能
5. ✅ 错误处理验证（权限拒绝、源不可用）

---

### 1.3 音频流管理

#### 统一音频流处理
```typescript
// RecordingService.ts
class RecordingService {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  
  /**
   * 获取音频流（统一入口）
   */
  private async getAudioStream(): Promise<MediaStream> {
    if (this.audioSource === 'microphone') {
      return await this.getMicrophoneStream();
    } else {
      return await this.getSystemAudioStream();
    }
  }
  
  /**
   * 验证音频流
   */
  private validateStream(stream: MediaStream): void {
    if (stream.getAudioTracks().length === 0) {
      throw new Error('音频流中没有音频轨道');
    }
    
    const audioTrack = stream.getAudioTracks()[0];
    const settings = audioTrack.getSettings();
    
    console.log('音频流设置:', {
      sampleRate: settings.sampleRate,
      channelCount: settings.channelCount,
      deviceId: settings.deviceId,
    });
    
    // 监听轨道状态
    audioTrack.addEventListener('ended', () => {
      console.warn('音频轨道已结束');
      if (this.isRecording) {
        this.stop();
      }
    });
    
    audioTrack.addEventListener('mute', () => {
      console.warn('音频轨道已静音');
    });
  }
  
  /**
   * 清理音频流
   */
  private cleanupStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
        track.stop();
        this.stream!.removeTrack(track);
      });
      this.stream = null;
    }
    
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.analyser = null;
  }
}
```

---

## 阶段2：音频转录识别

### 2.1 实时识别流程

#### 当前实现
- 麦克风：Web Speech API
- 系统音频：Faster-Whisper (WebSocket)

#### 优化方案

**2.1.1 麦克风识别（Web Speech API）**
```typescript
// RecognitionService.ts
class RecognitionService {
  private recognition: SpeechRecognition | null = null;
  
  /**
   * 初始化识别服务
   */
  private initializeRecognition(): void {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || 
                             (window as any).SpeechRecognition;
    
    if (!SpeechRecognition) {
      throw new Error('浏览器不支持语音识别');
    }
    
    this.recognition = new SpeechRecognition();
    
    // 基础设置
    this.recognition.lang = 'zh-CN';              // 中文
    this.recognition.continuous = true;           // 连续识别
    this.recognition.interimResults = true;       // 临时结果
    
    // 优化设置
    this.recognition.maxAlternatives = 1;         // 只返回最佳结果
    this.recognition.serviceURI = '';             // 使用默认服务
    
    // 事件监听
    this.recognition.onstart = () => {
      console.log('语音识别已开始');
      this.onStatusChange?.('running');
    };
    
    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      this.handleRecognitionResult(event);
    };
    
    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      this.handleRecognitionError(event);
    };
    
    this.recognition.onend = () => {
      console.log('语音识别已结束');
      this.onStatusChange?.('idle');
      
      // 如果还在录音，自动重启识别
      if (this.isRunning) {
        setTimeout(() => {
          this.recognition?.start();
        }, 100);
      }
    };
  }
  
  /**
   * 处理识别结果
   */
  private handleRecognitionResult(event: SpeechRecognitionEvent): void {
    let finalText = '';
    let interimText = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript;
      
      if (result.isFinal) {
        finalText += text;
      } else {
        interimText += text;
      }
    }
    
    // 计算时间范围（Web Speech API 不直接提供，需要估算）
    const now = Date.now();
    const startTime = (now - this.recognitionStartTime) / 1000;
    const endTime = startTime + (finalText.length / 4); // 假设4字/秒
    
    if (finalText) {
      this.onResult?.(finalText, true, startTime, endTime);
    }
    
    if (interimText) {
      this.onResult?.(interimText, false, startTime, endTime);
    }
  }
  
  /**
   * 处理识别错误
   */
  private handleRecognitionError(event: SpeechRecognitionErrorEvent): void {
    const errorMap: Record<string, string> = {
      'no-speech': '未检测到语音，请说话',
      'audio-capture': '无法捕获音频，请检查麦克风',
      'network': '网络错误，请检查网络连接',
      'aborted': '识别已中止',
      'not-allowed': '麦克风权限被拒绝，请允许麦克风权限',
    };
    
    const errorMessage = errorMap[event.error] || `识别错误: ${event.error}`;
    this.onError?.(new Error(errorMessage));
  }
}
```

**2.1.2 系统音频识别（Faster-Whisper WebSocket）**
```typescript
// WebSocketRecognitionService.ts
class WebSocketRecognitionService {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  
  /**
   * 初始化音频处理
   */
  private initializeAudioProcessing(stream: MediaStream): void {
    // 创建 AudioContext，采样率设为 16kHz（与后端一致）
    this.audioContext = new AudioContext({
      sampleRate: 16000,
      latencyHint: 'interactive', // 低延迟模式
    });
    
    // 创建音频源
    const source = this.audioContext.createMediaStreamSource(stream);
    
    // 使用 ScriptProcessor 获取原始音频数据
    // bufferSize: 4096 samples = 256ms @ 16kHz
    this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
    
    this.scriptProcessor.onaudioprocess = (e) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        return;
      }
      
      const inputData = e.inputBuffer.getChannelData(0);
      
      // 转换为 Int16 PCM（与后端一致）
      const int16Array = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        // 将 float32 (-1.0 到 1.0) 转换为 int16 (-32768 到 32767)
        const s = Math.max(-1, Math.min(1, inputData[i]));
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      
      // 记录时间戳（用于计算识别结果的时间范围）
      this.audioDataTimestamps.push({
        timestamp: Date.now(),
        samples: inputData.length,
      });
      
      // 发送 PCM 数据
      this.ws.send(int16Array.buffer);
    };
    
    source.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.audioContext.destination);
  }
  
  /**
   * 处理 WebSocket 消息
   */
  private handleWebSocketMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data);
      
      if (data.error) {
        this.onError?.(new Error(data.error));
        return;
      }
      
      if (data.text && this.onResult) {
        // 计算时间范围
        const now = Date.now();
        const timeSinceStart = (now - this.recognitionStartTime) / 1000; // 秒
        
        // 根据后端处理的时间范围计算
        const processedDuration = this.chunkDuration; // 0.8秒
        const endTime = timeSinceStart;
        const startTime = Math.max(0, endTime - processedDuration);
        
        this.onResult(
          data.text,
          data.isFinal || false,
          startTime,
          endTime
        );
      }
    } catch (error) {
      console.error('处理 WebSocket 消息失败:', error);
      this.onError?.(error instanceof Error ? error : new Error('未知错误'));
    }
  }
}
```

#### 后端优化（Faster-Whisper）
```python
# voice_stream_whisper.py
class PCMAudioProcessor:
    def __init__(
        self,
        sample_rate: int = 16000,
        chunk_duration: float = 0.8,  # 0.8秒处理一次
        overlap: float = 0.3,         # 0.3秒重叠
        min_samples: int = 8000,      # 最小0.5秒
    ):
        self.sample_rate = sample_rate
        self.chunk_duration = chunk_duration
        self.overlap = overlap
        self.min_samples = min_samples
        
        # 缓冲区
        max_buffer_samples = int(sample_rate * 10.0)  # 最多10秒
        max_buffer_size = max_buffer_samples * 2
        self.pcm_buffer = deque(maxlen=max_buffer_size)
        
        # 处理状态
        self.is_processing = False
        self.last_process_time = time.time()
        self.recognition_start_time = time.time()  # 记录识别开始时间
    
    async def try_process(self) -> Optional[dict]:
        current_samples = len(self.pcm_buffer) // 2
        current_time = time.time()
        
        time_since_last = current_time - self.last_process_time
        
        # 检查是否满足处理条件
        should_process = (
            current_samples >= self.min_samples
            and time_since_last >= self.chunk_duration
        )
        
        if not should_process:
            return None
        
        # 如果正在处理，检查是否超时
        if self.is_processing:
            if time_since_last > self.chunk_duration * 2:
                logger.warning('上次处理可能卡住，允许新处理')
            else:
                return None
        
        self.is_processing = True
        process_start_time = time.time()
        
        try:
            # 提取处理数据
            pcm_bytes = bytes(self.pcm_buffer)
            processed_samples = len(pcm_bytes) // 2
            
            # 转换为 numpy 数组
            audio_array = self._convert_pcm_to_numpy(pcm_bytes)
            if audio_array is None:
                return None
            
            # 识别
            result = await self._transcribe(audio_array)
            
            process_duration = time.time() - process_start_time
            
            if result:
                # 计算时间范围（相对于识别开始时间）
                relative_start_time = (current_time - self.recognition_start_time) - (processed_samples / self.sample_rate)
                relative_end_time = current_time - self.recognition_start_time
                
                # 清理缓冲区（保留重叠部分）
                keep_samples = int(self.sample_rate * self.overlap)
                keep_bytes = keep_samples * 2
                remove_samples = max(0, processed_samples - keep_samples)
                remove_bytes = remove_samples * 2
                
                for _ in range(min(remove_bytes, len(self.pcm_buffer))):
                    if len(self.pcm_buffer) > 0:
                        self.pcm_buffer.popleft()
                
                self.last_process_time = current_time
                self.is_processing = False
                
                return {
                    'text': result,
                    'isFinal': True,
                    'startTime': relative_start_time,
                    'endTime': relative_end_time,
                }
            
            self.is_processing = False
            return None
            
        except Exception as e:
            logger.error(f'处理音频失败: {e}', exc_info=True)
            self.is_processing = False
            return None
```

#### 工具和API
- **Web Speech API**: `webkitSpeechRecognition` / `SpeechRecognition`
- **WebSocket API**: `WebSocket`
- **Web Audio API**: `AudioContext`, `ScriptProcessorNode`
- **后端**: Faster-Whisper (Python)

#### 测试要点
1. ✅ 识别延迟测试（目标：< 1秒）
2. ✅ 识别准确率测试
3. ✅ 不同语言的兼容性
4. ✅ 网络错误处理
5. ✅ 音频流断开处理

---

## 阶段3：回放一致性保证

### 3.1 时间戳对齐

#### 实施步骤

**3.1.1 识别服务记录时间范围**
```typescript
// WebSocketRecognitionService.ts
private handleWebSocketMessage(event: MessageEvent): void {
  const data = JSON.parse(event.data);
  
  if (data.text && this.onResult) {
    // 使用后端返回的精确时间范围
    const startTime = data.startTime || 0;  // 秒
    const endTime = data.endTime || 0;      // 秒
    
    this.onResult(
      data.text,
      data.isFinal || false,
      startTime,
      endTime
    );
  }
}
```

**3.1.2 前端记录时间范围**
```typescript
// VoiceModulePanel.tsx
const handleRecognitionResult = (
  text: string,
  isFinal: boolean,
  startTime?: number,  // 秒
  endTime?: number     // 秒
) => {
  if (!text.trim() || !isFinal) return;
  
  const recordingStartTime = useAppStore.getState().recordingStartTime;
  if (!recordingStartTime || startTime === undefined || endTime === undefined) {
    return;
  }
  
  // 转换为毫秒
  const audioStart = startTime * 1000;  // 毫秒
  const audioEnd = endTime * 1000;      // 毫秒
  
  // 创建转录结果
  const transcript: TranscriptSegment = {
    id: `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    rawText: text,
    audioStart: audioStart,  // 毫秒
    audioEnd: audioEnd,      // 毫秒
    timestamp: new Date(recordingStartTime.getTime() + audioStart),
    // ... 其他字段
  };
  
  // 保存转录结果
  addTranscript(transcript);
  
  // 异步提取并存储音频片段（使用相同的时间范围）
  extractAndUploadAudioSegment(
    audioStart,      // 使用识别服务记录的时间（毫秒）
    audioEnd,        // 使用识别服务记录的时间（毫秒）
    recordingStartTime,
    new Date(recordingStartTime.getTime() + audioEnd),
    transcript.id    // 关联识别结果ID
  ).catch(error => {
    console.error('提取音频片段失败:', error);
  });
};
```

**3.1.3 提取音频片段（使用相同的时间范围）**
```typescript
// RecordingService.ts
async extractAudioSegment(
  startTime: number,  // 毫秒
  endTime: number     // 毫秒
): Promise<Blob | null> {
  if (!this.fullRecordingChunks || this.fullRecordingChunks.length === 0) {
    console.warn('[extractAudioSegment] 没有完整的录音数据');
    return null;
  }
  
  // 合并所有录音块
  const fullBlob = new Blob(this.fullRecordingChunks, {
    type: this.getSupportedMimeType() || 'audio/webm'
  });
  
  // 使用 Web Audio API 解码
  const audioContext = new AudioContext();
  const arrayBuffer = await fullBlob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  
  // 计算样本范围
  const sampleRate = audioBuffer.sampleRate;
  const startSample = Math.floor((startTime / 1000) * sampleRate);
  const endSample = Math.floor((endTime / 1000) * sampleRate);
  
  // 验证范围
  if (startSample < 0 || endSample > audioBuffer.length || startSample >= endSample) {
    console.error('[extractAudioSegment] 时间范围无效:', {
      startTime,
      endTime,
      startSample,
      endSample,
      audioLength: audioBuffer.length
    });
    return null;
  }
  
  // 提取音频数据
  const extractedLength = endSample - startSample;
  const extractedBuffer = audioContext.createBuffer(
    audioBuffer.numberOfChannels,
    extractedLength,
    sampleRate
  );
  
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
    const channelData = audioBuffer.getChannelData(channel);
    const extractedData = extractedBuffer.getChannelData(channel);
    extractedData.set(channelData.subarray(startSample, endSample));
  }
  
  // 重新编码为 WAV
  const wavBlob = await this.encodeAudioBufferToWav(extractedBuffer);
  
  // 验证时长
  const expectedDuration = (endTime - startTime) / 1000; // 秒
  const actualDuration = extractedBuffer.duration; // 秒
  
  if (Math.abs(expectedDuration - actualDuration) > 0.1) {
    console.warn('[extractAudioSegment] 音频时长不匹配:', {
      expected: expectedDuration,
      actual: actualDuration,
      diff: Math.abs(expectedDuration - actualDuration)
    });
  }
  
  return wavBlob;
}
```

**3.1.4 回放时使用关联的音频文件**
```typescript
// VoiceModulePanel.tsx
const handleSegmentClick = async (
  startMs: number,
  endMs: number,
  transcriptId?: string
) => {
  if (isRecording || !recordingStartTime) return;
  
  // 优先使用识别结果对应的音频文件
  if (transcriptId) {
    const transcript = transcripts.find(t => t.id === transcriptId);
    if (transcript && transcript.audioFileId && transcript.uploadStatus === 'uploaded') {
      try {
        const audioUrl = await persistenceServiceRef.current.getAudioUrl(
          transcript.audioFileId
        );
        if (audioUrl) {
          console.log(`[handleSegmentClick] 播放识别结果对应的音频: ${transcriptId}`);
          await playAudioFromUrl(audioUrl, 0); // 从头开始播放
          return;
        }
      } catch (error) {
        console.error(`[handleSegmentClick] 获取音频文件失败:`, error);
      }
    }
  }
  
  // 如果没有关联的音频文件，回退到从完整录音中提取
  // ...
};
```

#### 工具和API
- **Web Audio API**: `AudioContext`, `AudioBuffer`
- **Blob API**: `Blob`, `URL.createObjectURL`

#### 测试要点
1. ✅ 时间戳对齐验证（识别时间 vs 提取时间）
2. ✅ 音频时长验证（预期时长 vs 实际时长）
3. ✅ 回放内容验证（回放的内容是否匹配识别结果）
4. ✅ 边界情况测试（开始、结束、重叠）

---

## 阶段4：后续功能

### 4.1 文本优化（LLM）

#### 当前实现
- 使用 DeepSeek API 优化文本

#### 优化方案
- 批量处理优化
- 错误重试机制
- 超时处理

### 4.2 日程提取

#### 当前实现
- 从优化后的文本中提取日程

#### 优化方案
- 改进时间解析
- 支持更多时间格式
- 智能推断

### 4.3 存储和持久化

#### 当前实现
- 音频文件存储
- 转录文本存储
- 日程存储

#### 优化方案
- 数据库集成
- 索引优化
- 查询优化

---

## 测试和验证计划

### 单元测试
- 音频捕获测试
- 识别服务测试
- 音频提取测试
- 回放测试

### 集成测试
- 端到端流程测试
- 不同环境测试
- 性能测试

### 兼容性测试
- 浏览器兼容性
- 操作系统兼容性
- 设备兼容性

---

## 实施时间表

### Week 1
- Day 1-2: 音频捕获优化
- Day 3-4: 识别服务优化
- Day 5-7: 回放一致性保证

### Week 2
- Day 1-3: 测试和修复
- Day 4-5: 性能优化
- Day 6-7: 文档和部署

