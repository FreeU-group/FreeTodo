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
    this.onSegmentReady = callbacks.onSegmentReady;
    this.onError = callbacks.onError;
    this.onAudioData = callbacks.onAudioData;
  }

  /**
   * 开始录音
   */
  async start(): Promise<void> {
    if (this.isRecording) {
      console.warn('Recording already started');
      return;
    }

    try {
      // 获取麦克风权限
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
      
      this.mediaRecorder = new MediaRecorder(this.stream, options);
      
      // 设置事件监听
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.currentSegmentChunks.push(event.data);
        }
      };

      this.mediaRecorder.onerror = (event) => {
        const error = new Error('MediaRecorder error');
        console.error('MediaRecorder error:', event);
        if (this.onError) {
          this.onError(error);
        }
      };

      this.mediaRecorder.onstop = () => {
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

      console.log('Recording started at', this.recordingStartTime);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to start recording');
      console.error('Failed to start recording:', err);
      if (this.onError) {
        this.onError(err);
      }
      throw err;
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

    // 停止 MediaRecorder
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
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

    // 最终化当前片段
    this.finalizeSegment();

    console.log('Recording stopped');
  }

  /**
   * 获取录音状态
   */
  getStatus(): { isRecording: boolean; startTime: Date | null } {
    return {
      isRecording: this.isRecording,
      startTime: this.recordingStartTime,
    };
  }

  /**
   * 获取 AnalyserNode（用于波形显示）
   */
  getAnalyser(): AnalyserNode | null {
    return this.analyser;
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
      console.error('Failed to start new segment:', e);
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
    if (this.currentSegmentChunks.length === 0 || !this.segmentId || !this.recordingStartTime) {
      return;
    }

    const blob = new Blob(this.currentSegmentChunks, { type: this.getSupportedMimeType() || 'audio/webm' });
    const startTime = new Date(this.currentSegmentStart);
    const endTime = new Date();

    if (this.onSegmentReady) {
      this.onSegmentReady(blob, startTime, endTime, this.segmentId);
    }

    // 重置
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

