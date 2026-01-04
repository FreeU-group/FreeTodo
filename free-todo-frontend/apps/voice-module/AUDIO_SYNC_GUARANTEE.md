# 回放一致性保证机制

## 🎯 核心原则

**回放的音频 = 识别服务处理的那段音频**

必须保证回放时播放的音频，就是识别服务用来识别的那段音频，完全一致。

---

## 🔍 问题分析

### 当前问题

1. **识别服务**：处理的是 WebSocket 发送的 PCM 数据流（实时）
2. **存储服务**：存储的是 MediaRecorder 录制的 WebM 文件（可能不同步）
3. **回放服务**：播放的是从 WebM 文件中提取的片段（可能不是识别用的那段）

**结果**：回放的内容和识别结果不匹配！

### 根本原因

- 识别和存储使用了不同的数据源
- 时间对齐不准确
- 没有验证机制

---

## ✅ 解决方案

### 方案：统一音频源 + 精确时间戳对齐

#### 核心思路

1. **统一音频源**：识别和存储都使用同一个 MediaStream
2. **精确时间戳**：识别服务记录处理的时间范围（精确到毫秒）
3. **时间对齐**：存储时使用相同的时间范围提取音频
4. **验证机制**：提取后验证时长是否匹配

---

## 📐 架构设计

```
MediaStream (单一音频源)
    ├─→ WebSocket (识别) 
    │   ├─→ PCM数据流
    │   ├─→ 识别结果
    │   └─→ 时间范围 [startTime, endTime] (精确到毫秒)
    │
    └─→ MediaRecorder (存储)
        └─→ WebM文件 (完整录音)
            └─→ 根据时间范围提取片段
                └─→ 存储音频片段
                    └─→ 关联识别结果ID
                        └─→ 回放时使用关联的音频文件
```

---

## 🔧 实现细节

### 1. 识别服务记录精确时间范围

**后端（voice_stream_whisper.py）**：

```python
class PCMAudioProcessor:
    def __init__(self, recognition_start_time: float):
        self.recognition_start_time = recognition_start_time  # 识别开始时间（绝对时间戳）
        # ...
    
    async def try_process(self) -> Optional[dict]:
        # ... 处理音频 ...
        
        if result:
            # 计算实际处理的音频时间段
            current_time = time.time()
            processed_samples = len(self.pcm_buffer) // 2
            audio_duration = processed_samples / self.sample_rate  # 秒
            
            # 计算相对于识别开始的时间
            relative_start_time = (current_time - self.recognition_start_time) - audio_duration
            relative_end_time = current_time - self.recognition_start_time
            
            return {
                "text": result,
                "isFinal": True,
                "startTime": relative_start_time,  # 秒（精确到毫秒）
                "endTime": relative_end_time,      # 秒（精确到毫秒）
            }
```

**前端（WebSocketRecognitionService.ts）**：

```typescript
this.ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.text && this.onResult) {
    // 传递时间范围给前端
    this.onResult(
      data.text,
      data.isFinal || false,
      data.startTime,  // 秒
      data.endTime      // 秒
    );
  }
};
```

### 2. 前端记录并关联时间范围

**VoiceModulePanel.tsx**：

```typescript
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
    id: `transcript_${Date.now()}`,
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

### 3. 提取音频片段（使用相同的时间范围）

**RecordingService.ts**：

```typescript
/**
 * 从完整录音中提取指定时间段的音频片段
 * @param startTime 开始时间（毫秒，相对于录音开始）
 * @param endTime 结束时间（毫秒，相对于录音开始）
 * @returns 音频片段 Blob
 */
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
  
  // 重新编码为 WebM
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

### 4. 存储并关联识别结果

**VoiceModulePanel.tsx**：

```typescript
const extractAndUploadAudioSegment = async (
  audioStart: number,      // 毫秒
  audioEnd: number,        // 毫秒
  absoluteStart: Date,
  absoluteEnd: Date,
  transcriptId: string
) => {
  if (!recordingServiceRef.current || !persistenceServiceRef.current) {
    return;
  }
  
  try {
    // 提取音频片段（使用识别服务记录的时间范围）
    const audioBlob = await recordingServiceRef.current.extractAudioSegment(
      audioStart,
      audioEnd
    );
    
    if (!audioBlob) {
      console.error('[extractAndUploadAudioSegment] 提取音频片段失败');
      return;
    }
    
    // 验证时长
    const expectedDuration = (audioEnd - audioStart) / 1000; // 秒
    const audioElement = new Audio(URL.createObjectURL(audioBlob));
    audioElement.addEventListener('loadedmetadata', () => {
      const actualDuration = audioElement.duration;
      if (Math.abs(expectedDuration - actualDuration) > 0.1) {
        console.warn('[extractAndUploadAudioSegment] 音频时长不匹配:', {
          expected: expectedDuration,
          actual: actualDuration,
          diff: Math.abs(expectedDuration - actualDuration)
        });
      }
    });
    
    // 上传音频片段
    const audioFileId = await persistenceServiceRef.current.uploadAudio(
      audioBlob,
      {
        startTime: absoluteStart,
        endTime: absoluteEnd,
        segmentId: `segment_${transcriptId}`,
      }
    );
    
    if (audioFileId) {
      // 更新转录结果，关联音频文件ID
      updateTranscript({
        id: transcriptId,
        audioFileId: audioFileId,
        uploadStatus: 'uploaded',
      });
      
      console.log(`[extractAndUploadAudioSegment] 音频片段已上传: ${audioFileId}`);
    }
  } catch (error) {
    console.error('[extractAndUploadAudioSegment] 提取并上传音频片段失败:', error);
  }
};
```

### 5. 回放时使用关联的音频文件

**VoiceModulePanel.tsx**：

```typescript
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

---

## ✅ 验证机制

### 1. 时间范围验证

```typescript
// 验证时间范围是否有效
if (startTime < 0 || endTime <= startTime) {
  console.error('时间范围无效');
  return;
}
```

### 2. 音频时长验证

```typescript
// 验证提取的音频时长是否匹配
const expectedDuration = (endTime - startTime) / 1000; // 秒
const actualDuration = audioBuffer.duration; // 秒

if (Math.abs(expectedDuration - actualDuration) > 0.1) {
  console.warn('音频时长不匹配:', {
    expected: expectedDuration,
    actual: actualDuration,
    diff: Math.abs(expectedDuration - actualDuration)
  });
}
```

### 3. 内容验证（可选）

```typescript
// 可以对比识别结果和回放音频的时长
// 如果差异太大，说明可能有问题
const transcriptDuration = (transcript.audioEnd - transcript.audioStart) / 1000;
const audioDuration = await getAudioDuration(audioFileId);

if (Math.abs(transcriptDuration - audioDuration) > 0.2) {
  console.warn('识别结果和音频时长不匹配');
}
```

---

## 🎯 关键要点

1. **统一音频源**：识别和存储都使用同一个 MediaStream
2. **精确时间戳**：识别服务记录处理的时间范围（精确到毫秒）
3. **时间对齐**：存储时使用相同的时间范围提取音频
4. **关联存储**：音频文件关联识别结果ID
5. **验证机制**：提取后验证时长是否匹配
6. **回放优先**：回放时优先使用关联的音频文件

---

## 📊 流程图

```
开始录音
  ↓
MediaStream (单一音频源)
  ├─→ WebSocket (识别)
  │   ├─→ PCM数据流
  │   ├─→ 识别结果 + 时间范围 [startTime, endTime]
  │   └─→ 前端显示识别结果
  │
  └─→ MediaRecorder (存储)
      └─→ WebM文件 (完整录音)
          └─→ 识别结果完成
              └─→ 根据时间范围提取片段
                  ├─→ 验证时间范围
                  ├─→ 提取音频片段
                  ├─→ 验证时长
                  ├─→ 上传音频文件
                  └─→ 关联识别结果ID
                      └─→ 回放时使用关联的音频文件 ✅
```

---

## ⚠️ 注意事项

1. **时间精度**：确保时间戳精确到毫秒级别
2. **时间对齐**：识别开始时间和录音开始时间必须对齐
3. **缓冲区管理**：确保完整录音数据可用
4. **错误处理**：提取失败时要有降级方案
5. **性能优化**：音频提取是异步操作，不阻塞识别显示

