/**
 * 录音服务 - 负责持续录音和音频分段
 */
export class RecordingService {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private pendingRestart: boolean = false;
  
  private segmentDuration = 10 * 60 * 1000; // 10分钟
  private currentSegmentStart: number = 0;
  private currentSegmentChunks: Blob[] = [];
  private segmentId: string | null = null;
  
  private isRecording: boolean = false;
  private isPaused: boolean = false;
  private recordingStartTime: Date | null = null;
  
  // 回调函数
  private onSegmentReady?: (blob: Blob, startTime: Date, endTime: Date, segmentId: string) => void;
  private onError?: (error: Error) => void;
  private onAudioData?: (analyser: AnalyserNode) => void;
  
  constructor() {}

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: {
    onSegmentReady?: (blob: Blob, startTime: Date, endTime: Date, segmentId: string) => void;
    onError?: (error: Error) => void;
    onAudioData?: (analyser: AnalyserNode) => void;
  }) {
    console.log('[RecordingService] 🔧 setCallbacks被调用:', {
      hasOnSegmentReady: typeof callbacks.onSegmentReady === 'function',
      hasOnError: typeof callbacks.onError === 'function',
      hasOnAudioData: typeof callbacks.onAudioData === 'function',
    });
    this.onSegmentReady = callbacks.onSegmentReady;
    this.onError = callbacks.onError;
    this.onAudioData = callbacks.onAudioData;
    console.log('[RecordingService] ✅ 回调已设置，this.onSegmentReady:', typeof this.onSegmentReady === 'function');
  }

  /**
   * 开始录音
   * 使用系统默认麦克风（与 Web Speech API 保持一致）
   */
  async start(): Promise<void> {
    if (this.isRecording) {
      console.warn('[RecordingService] Recording already started');
      return;
    }

    try {
      // 获取麦克风权限（使用系统默认设备）
      this.stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });

      // 创建 AudioContext 用于波形分析
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      
      const source = this.audioContext.createMediaStreamSource(this.stream);
      source.connect(this.analyser);
      
      if (this.onAudioData) {
        this.onAudioData(this.analyser);
      }

      // 创建 MediaRecorder
      const options: MediaRecorderOptions = {
        mimeType: this.getSupportedMimeType(),
      };
      
      console.log('[RecordingService] 📹 创建MediaRecorder，MIME类型:', options.mimeType);
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      
      // 设置事件监听
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.currentSegmentChunks.push(event.data);
          // 每10个块输出一次日志
          if (this.currentSegmentChunks.length % 10 === 0) {
            console.log(`[RecordingService] 📦 收到音频数据块，累计: ${this.currentSegmentChunks.length} 个`);
          }
        }
      };

      this.mediaRecorder.onerror = (event) => {
        const error = new Error('MediaRecorder error');
        console.error('[RecordingService] ❌ MediaRecorder error:', event);
        if (this.onError) {
          this.onError(error);
        }
      };

      this.mediaRecorder.onstop = () => {
        console.log('[RecordingService] 🛑 MediaRecorder onstop事件触发');
        // 先完成当前片段
        this.finalizeSegment();

        // 如需继续录音，启动新片段
        if (this.isRecording && this.pendingRestart) {
          this.pendingRestart = false;
          this.startNewSegment();
        }
      };

      // 开始录音
      this.recordingStartTime = new Date();
      this.currentSegmentStart = Date.now();
      this.segmentId = this.generateSegmentId();
      this.currentSegmentChunks = [];
      
      // 每1秒收集一次数据
      this.mediaRecorder.start(1000);
      this.isRecording = true;

      // 设置定时器，每10分钟自动分段
      this.scheduleNextSegment();

      console.log('[RecordingService] ✅ 录音已开始', {
        startTime: this.recordingStartTime,
        segmentId: this.segmentId,
        hasOnSegmentReady: !!this.onSegmentReady,
      });
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to start recording');
      console.error('[RecordingService] ❌ 启动录音失败:', err);
      if (this.onError) {
        this.onError(err);
      }
      throw err;
    }
  }

  /**
   * 暂停录音（保留音频流，暂停MediaRecorder）
   */
  pause(): void {
    if (!this.isRecording || this.isPaused) {
      console.warn('[RecordingService] ⚠️ 无法暂停：录音未开始或已暂停', {
        isRecording: this.isRecording,
        isPaused: this.isPaused,
        state: this.mediaRecorder?.state
      });
      return;
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      console.log('[RecordingService] ⏸️ 暂停录音，MediaRecorder状态:', this.mediaRecorder.state);
      this.mediaRecorder.pause();
      this.isPaused = true;
      
      // 验证暂停是否成功
      setTimeout(() => {
        if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
          console.log('[RecordingService] ✅ 暂停成功，MediaRecorder状态:', this.mediaRecorder.state);
        } else {
          console.error('[RecordingService] ❌ 暂停失败，MediaRecorder状态:', this.mediaRecorder?.state);
          this.isPaused = false; // 恢复状态
        }
      }, 100);
    } else {
      console.warn('[RecordingService] ⚠️ MediaRecorder状态不正确，无法暂停:', this.mediaRecorder?.state);
    }
  }

  /**
   * 恢复录音
   */
  resume(): void {
    if (!this.isRecording || !this.isPaused) {
      console.warn('[RecordingService] ⚠️ 无法恢复：录音未开始或未暂停', {
        isRecording: this.isRecording,
        isPaused: this.isPaused,
        state: this.mediaRecorder?.state
      });
      return;
    }

    if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
      console.log('[RecordingService] ▶️ 恢复录音，MediaRecorder状态:', this.mediaRecorder.state);
      this.mediaRecorder.resume();
      this.isPaused = false;
      
      // 验证恢复是否成功
      setTimeout(() => {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
          console.log('[RecordingService] ✅ 恢复成功，MediaRecorder状态:', this.mediaRecorder.state);
        } else {
          console.error('[RecordingService] ❌ 恢复失败，MediaRecorder状态:', this.mediaRecorder?.state);
          this.isPaused = true; // 恢复状态
        }
      }, 100);
    } else {
      console.warn('[RecordingService] ⚠️ MediaRecorder状态不正确，无法恢复:', this.mediaRecorder?.state);
    }
  }

  /**
   * 停止录音
   */
  async stop(): Promise<void> {
    if (!this.isRecording) {
      return;
    }
    this.isRecording = false;
    this.isPaused = false;
    this.pendingRestart = false; // 停止时不再重启

    // 停止 MediaRecorder（这会触发 onstop 事件，在 onstop 中处理 finalizeSegment）
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      // 注意：不要在这里调用 finalizeSegment()，因为 onstop 事件会处理
    }

    // 停止音频流
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    // 关闭 AudioContext
    if (this.audioContext) {
      await this.audioContext.close();
      this.audioContext = null;
      this.analyser = null;
    }

    // 注意：finalizeSegment 会在 onstop 事件中调用，不需要在这里重复调用
  }

  /**
   * 获取录音状态
   */
  getStatus(): { isRecording: boolean; isPaused: boolean; startTime: Date | null; hasOnSegmentReady: boolean } {
    return {
      isRecording: this.isRecording,
      isPaused: this.isPaused,
      startTime: this.recordingStartTime,
      hasOnSegmentReady: !!this.onSegmentReady,
    };
  }

  /**
   * 获取 AnalyserNode（用于波形显示）
   */
  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  /**
   * 获取当前音频流（用于识别服务）
   */
  getStream(): MediaStream | null {
    return this.stream;
  }

  /**
   * 安排下一个分段
   */
  private scheduleNextSegment(): void {
    if (!this.isRecording) return;

    const remainingTime = this.segmentDuration - (Date.now() - this.currentSegmentStart);
    
    setTimeout(() => {
      if (this.isRecording && this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        // 标记需要在 onstop 后重启新的片段
        this.pendingRestart = true;
        this.mediaRecorder.stop();
      }
    }, remainingTime);
  }

  /**
   * 启动一个新片段录音（在 onstop 之后调用）
   */
  private startNewSegment() {
    if (!this.mediaRecorder || !this.stream) return;

    this.currentSegmentStart = Date.now();
    this.segmentId = this.generateSegmentId();
    this.currentSegmentChunks = [];

    try {
      this.mediaRecorder.start(1000);
      // 继续安排下一次分段
      this.scheduleNextSegment();
    } catch (e) {
      console.error('[RecordingService] ❌ Failed to start new segment:', e);
      if (this.onError) {
        const err = e instanceof Error ? e : new Error('Failed to start new segment');
        this.onError(err);
      }
    }
  }

  /**
   * 最终化当前片段
   */
  private finalizeSegment(): void {
    // 防止重复调用：如果 chunks 已经被清空，说明已经处理过了
    if (this.currentSegmentChunks.length === 0) {
      console.log('[RecordingService] ⚠️ 片段已处理过，跳过重复调用');
      return;
    }

    if (!this.segmentId || !this.recordingStartTime) {
      console.warn('[RecordingService] ⚠️ 无法最终化片段：数据不足', {
        chunksLength: this.currentSegmentChunks.length,
        segmentId: this.segmentId,
        recordingStartTime: this.recordingStartTime,
      });
      return;
    }

    const blob = new Blob(this.currentSegmentChunks, { type: this.getSupportedMimeType() || 'audio/webm' });
    const startTime = new Date(this.currentSegmentStart);
    const endTime = new Date();
    const totalSize = this.currentSegmentChunks.reduce((sum, chunk) => sum + chunk.size, 0);

    console.log('[RecordingService] ✅ 最终化片段', {
      segmentId: this.segmentId,
      blobSize: blob.size,
      totalChunkSize: totalSize,
      chunksCount: this.currentSegmentChunks.length,
      duration: endTime.getTime() - startTime.getTime(),
    });

    if (blob.size === 0) {
      console.error('[RecordingService] ❌ 警告：最终化的片段大小为 0，跳过保存');
      this.currentSegmentChunks = [];
      return;
    }

    if (this.onSegmentReady) {
      try {
        console.log('[RecordingService] 📤 调用onSegmentReady回调，准备保存音频:', {
          segmentId: this.segmentId,
          blobSize: blob.size,
          blobType: blob.type,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        });
        this.onSegmentReady(blob, startTime, endTime, this.segmentId);
        console.log('[RecordingService] ✅ onSegmentReady回调已调用，音频将保存到后端本地文件夹');
      } catch (error) {
        console.error('[RecordingService] ❌ onSegmentReady回调执行失败:', error);
      }
    } else {
      console.error('[RecordingService] ❌ onSegmentReady回调未设置！音频无法保存到本地文件夹！');
    }

    // 最后清空 chunks，防止重复调用（在回调之后清空，确保数据已使用）
    this.currentSegmentChunks = [];
  }

  /**
   * 生成片段ID
   */
  private generateSegmentId(): string {
    return `segment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 获取支持的 MIME 类型
   */
  private getSupportedMimeType(): string {
    const types = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/ogg',
      'audio/mp4',
    ];

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type;
      }
    }

    return ''; // 使用浏览器默认
  }
}
