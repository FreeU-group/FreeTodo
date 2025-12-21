/**
 * 语音识别服务 - 负责实时语音识别
 */
export class RecognitionService {
  private recognition: SpeechRecognition | null = null;
  private isRunning: boolean = false;
  private restartTimeout: number | null = null;
  private maxRetries: number = 5;
  private retryCount: number = 0;

  // 回调函数
  private onResult?: (text: string, isFinal: boolean) => void;
  private onError?: (error: Error) => void;
  private onStatusChange?: (status: 'idle' | 'running' | 'error') => void;

  constructor() {}

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: {
    onResult?: (text: string, isFinal: boolean) => void;
    onError?: (error: Error) => void;
    onStatusChange?: (status: 'idle' | 'running' | 'error') => void;
  }) {
    this.onResult = callbacks.onResult;
    this.onError = callbacks.onError;
    this.onStatusChange = callbacks.onStatusChange;
  }

  /**
   * 开始识别
   */
  start(): void {
    if (this.isRunning) {
      console.warn('Recognition already running');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      const error = new Error('您的浏览器不支持 Web Speech API');
      console.error(error);
      if (this.onError) {
        this.onError(error);
      }
      if (this.onStatusChange) {
        this.onStatusChange('error');
      }
      return;
    }

    this.recognition = new SpeechRecognition();
    if (!this.recognition) return;
    
    this.recognition.continuous = true;
    this.recognition.interimResults = true;
    this.recognition.lang = 'zh-CN';

    // 事件监听
    this.recognition.onstart = () => {
      console.log('Speech recognition started');
      this.isRunning = true;
      this.retryCount = 0;
      if (this.onStatusChange) {
        this.onStatusChange('running');
      }
    };

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      if (!this.recognition) return;
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const result = event.results[i];
        const text = result[0].transcript;
        const isFinal = result.isFinal;

        if (this.onResult) {
          this.onResult(text, isFinal);
        }
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (!this.recognition) return;
      console.error('Speech recognition error:', event.error);

      // 处理不同错误类型
      if (event.error === 'no-speech') {
        // 无语音输入，继续运行
        return;
      } else if (event.error === 'audio-capture') {
        const error = new Error('无法访问麦克风');
        if (this.onError) {
          this.onError(error);
        }
        if (this.onStatusChange) {
          this.onStatusChange('error');
        }
      } else if (event.error === 'not-allowed') {
        const error = new Error('麦克风权限被拒绝');
        if (this.onError) {
          this.onError(error);
        }
        if (this.onStatusChange) {
          this.onStatusChange('error');
        }
      } else if (event.error === 'network') {
        // 网络错误，尝试重启
        console.log('Network error, will retry...');
        this.scheduleRestart();
      } else {
        // 其他错误，尝试重启
        console.log(`Error: ${event.error}, will attempt to continue...`);
        this.scheduleRestart();
      }
    };

    this.recognition.onend = () => {
      if (!this.recognition) return;
      console.log('Speech recognition ended');
      this.isRunning = false;

      // 如果应该继续运行，自动重启
      if (this.recognition) {
        this.scheduleRestart();
      } else {
        if (this.onStatusChange) {
          this.onStatusChange('idle');
        }
      }
    };

    // 开始识别
    try {
      if (this.recognition) {
        this.recognition.start();
      }
    } catch (error) {
      console.error('Failed to start recognition:', error);
      const err = error instanceof Error ? error : new Error('无法启动语音识别');
      if (this.onError) {
        this.onError(err);
      }
      if (this.onStatusChange) {
        this.onStatusChange('error');
      }
    }
  }

  /**
   * 停止识别
   */
  stop(): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        console.log('Recognition already stopped');
      }
      this.recognition = null;
    }

    this.isRunning = false;
    this.retryCount = 0;

    if (this.onStatusChange) {
      this.onStatusChange('idle');
    }

    console.log('Recognition stopped');
  }

  /**
   * 获取状态
   */
  getStatus(): 'idle' | 'running' | 'error' {
    if (!this.recognition) return 'idle';
    if (this.isRunning) return 'running';
    return 'error';
  }

  /**
   * 安排重启
   */
  private scheduleRestart(): void {
    if (this.restartTimeout) {
      return; // 已经安排了重启
    }

    if (this.retryCount >= this.maxRetries) {
      console.error('Max retries reached, stopping recognition');
      if (this.onError) {
        this.onError(new Error('语音识别重试次数过多，已停止'));
      }
      if (this.onStatusChange) {
        this.onStatusChange('error');
      }
      return;
    }

    this.retryCount++;
    const delay = Math.min(1000 * this.retryCount, 5000); // 最多5秒延迟

    this.restartTimeout = window.setTimeout(() => {
      this.restartTimeout = null;
      
      if (this.recognition) {
        try {
          console.log(`Restarting recognition (attempt ${this.retryCount})...`);
          this.recognition.start();
        } catch (error) {
          console.error('Failed to restart recognition:', error);
          // 继续尝试
          this.scheduleRestart();
        }
      }
    }, delay);
  }
}

