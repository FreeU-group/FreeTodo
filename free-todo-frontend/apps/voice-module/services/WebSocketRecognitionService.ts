/**
 * WebSocket 语音识别服务 - 完全使用 WhisperLiveKit 进行超低延迟实时识别
 * 支持麦克风和系统音频
 * 发送原始 PCM 数据（Int16），优化为 WhisperLiveKit 格式要求
 */

export type RecognitionEngine = 'whisperlivekit' | 'faster-whisper'; // WhisperLiveKit 优先

export class WebSocketRecognitionService {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private isRunning: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000; // 1 second
  
  // 记录音频数据的时间戳（用于确定识别结果对应的音频时间段）
  private audioDataTimestamps: Array<{ timestamp: number; samples: number }> = [];
  private recognitionStartTime: number = 0; // 识别服务开始时间
  private lastProcessTime: number = 0; // 上次处理时间
  
  // ⚡ WhisperLiveKit 优化：更小的缓冲区，更快的响应
  // 512 samples = 32ms @ 16kHz（超低延迟，适合 WhisperLiveKit）
  private chunkSize: number = 512; // WhisperLiveKit 推荐的小缓冲区

  // ⚡ 预留：识别引擎选择（目前只使用 WhisperLiveKit 原生实现）
  // private engine: RecognitionEngine = 'whisperlivekit';
  private onResult?: (text: string, isFinal: boolean, startTime?: number, endTime?: number) => void;
  private onError?: (error: Error) => void;
  private onStatusChange?: (status: 'idle' | 'running' | 'error') => void;

  /**
   * 设置识别引擎（预留接口，目前只支持 WhisperLiveKit）
   * @param engine - 'faster-whisper' 或 'whisperlivekit'
   */
  setEngine(_engine: RecognitionEngine): void {
    // 目前只使用 WhisperLiveKit 原生实现，此方法保留用于未来扩展
    // this.engine = engine;
  }

  setCallbacks(callbacks: {
    onResult?: (text: string, isFinal: boolean, startTime?: number, endTime?: number) => void;
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
  async start(stream: MediaStream): Promise<void> {
    if (this.isRunning) {
      console.warn('WebSocket recognition already running');
      return;
    }

    this.stream = stream;
    this.isRunning = true;
    this.reconnectAttempts = 0;

    await this.connect();
  }

  /**
   * 连接 WebSocket
   */
  private async connect(): Promise<void> {
    try {
      // 构建 WebSocket URL
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = process.env.NEXT_PUBLIC_WS_URL ||
                     (typeof window !== 'undefined'
                       ? `${wsProtocol}//${window.location.hostname}:8000`
                       : 'ws://localhost:8000');
      // ⚡ 完全使用 WhisperLiveKit：主端点自动使用 WhisperLiveKit
      // 如果 WhisperLiveKit 不可用，后端会自动降级
      const wsUrl = `${wsHost}/api/voice/stream`;

      console.log('Connecting to WebSocket:', wsUrl);

      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('WebSocket connected');
        // 重置重连计数（成功连接）
        this.reconnectAttempts = 0;
        this.recognitionStartTime = Date.now();
        this.lastProcessTime = Date.now();
        this.audioDataTimestamps = []; // 重置时间戳记录
        if (this.onStatusChange) {
          this.onStatusChange('running');
        }
        this.startRecording();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // ⚡ 参考 WhisperLiveKit：处理 keepalive ping/pong
          if (data.type === 'ping') {
            // 收到 ping，回复 pong
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.ws.send('pong');
            }
            return;
          }

          if (data.error) {
            const error = new Error(data.error);
            console.error('WebSocket error:', error);
            if (this.onError) {
              this.onError(error);
            }
            return;
          }

          if (data.text && this.onResult) {
            // ⚡ 参考 WhisperLiveKit：优先使用后端返回的精确时间范围
            // 后端使用增量上下文和智能流式策略，时间戳更准确
            let startTime: number | undefined;
            let endTime: number | undefined;
            
            if (typeof data.startTime === 'number' && typeof data.endTime === 'number') {
              // ⚡ 使用后端返回的精确时间范围（秒）
              // 后端计算基于实际处理的音频时长和上下文
              const backendStartTime = Number(data.startTime);
              const backendEndTime = Number(data.endTime);
              
              if (!isNaN(backendStartTime) && !isNaN(backendEndTime) && backendEndTime >= backendStartTime) {
                startTime = backendStartTime;
                endTime = backendEndTime;
              } else {
                console.warn(`[WebSocketRecognitionService] 后端时间戳格式错误: startTime=${data.startTime}, endTime=${data.endTime}，使用前端估算`);
              }
            }
            
            // ⚡ 如果没有后端时间或格式错误，使用前端估算
            // 参考 WhisperLiveKit：前端估算作为降级方案
            if (startTime === undefined || endTime === undefined) {
              const now = Date.now();
              const timeSinceLastProcess = (now - this.lastProcessTime) / 1000; // 秒
              
              // ⚡ 估算处理的音频时长
              // 后端 chunk_duration = 0.3秒，但实际处理可能包含上下文（1秒）
              const estimatedChunkDuration = 0.3; // 后端默认 chunk_duration
              const processedDuration = Math.min(timeSinceLastProcess, estimatedChunkDuration);
              
              // 计算开始时间（当前时间往前推处理的时长）
              endTime = (now - this.recognitionStartTime) / 1000; // 秒
              startTime = Math.max(0, endTime - processedDuration);
              
              // 更新上次处理时间
              this.lastProcessTime = now;
            }
            
            // ⚡ 确保时间戳格式正确：必须是数字，且 endTime >= startTime
            const finalStartTime = Math.max(0, Number(startTime));
            const finalEndTime = Math.max(finalStartTime, Number(endTime));
            
            // ⚡ 参考 WhisperLiveKit：支持部分结果（isFinal=false）和最终结果（isFinal=true）
            // 部分结果：实时更新，提升用户体验
            // 最终结果：语句结束，确保准确性
            this.onResult(data.text, data.isFinal || false, finalStartTime, finalEndTime);
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        if (this.onError) {
          this.onError(new Error('WebSocket 连接错误'));
        }
      };

      this.ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);

        // 判断是否应该重连
        // 1000: 正常关闭（不应该重连）
        // 1001: 端点离开（不应该重连）
        // 1006: 异常关闭（应该重连）
        // 其他: 根据情况决定
        const shouldReconnect = event.code !== 1000 && event.code !== 1001;

        if (this.isRunning && shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          // 尝试重连（指数退避）
          this.reconnectAttempts++;
          const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 10000); // 最多10秒
          console.log(`[WebSocketRecognitionService] 尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})，${delay}ms 后重试...`);
          
          setTimeout(() => {
            if (this.isRunning) {
              this.connect();
            }
          }, delay);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          console.error('[WebSocketRecognitionService] 重连次数过多，停止重连');
          this.isRunning = false;
          if (this.onError) {
            this.onError(new Error('WebSocket 连接失败，已停止重连'));
          }
          if (this.onStatusChange) {
            this.onStatusChange('error');
          }
        } else {
          this.isRunning = false;
          if (this.onStatusChange) {
            this.onStatusChange('idle');
          }
        }
      };

    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      const err = error instanceof Error ? error : new Error('无法连接 WebSocket');
      if (this.onError) {
        this.onError(err);
      }
      if (this.onStatusChange) {
        this.onStatusChange('error');
      }
      this.isRunning = false;
    }
  }

  /**
   * 开始录音并发送原始 PCM 数据到 WebSocket
   */
  private startRecording(): void {
    if (!this.stream || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    try {
      // ⚡ WhisperLiveKit 优化：创建 AudioContext，采样率设为 16kHz
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass({
        sampleRate: 16000, // 16kHz，WhisperLiveKit 标准采样率
        latencyHint: 'interactive', // 最低延迟模式
      });

      // 创建音频源
      this.source = this.audioContext.createMediaStreamSource(this.stream);

      // ⚡ WhisperLiveKit 优化：使用更小的缓冲区，实现超低延迟
      // 512 samples = 32ms @ 16kHz（超低延迟，适合 WhisperLiveKit 的实时处理）
      // 注意：buffer size 必须是 2 的幂次方（256-16384）
      // WhisperLiveKit 使用先进算法，可以处理更小的音频块而不丢失语境
      this.scriptProcessor = this.audioContext.createScriptProcessor(this.chunkSize, 1, 1);

      this.scriptProcessor.onaudioprocess = (e) => {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          return;
        }

        try {
          // ⚡ 参考 WhisperLiveKit：获取输入数据（Float32Array，范围 [-1, 1]）
          const inputData = e.inputBuffer.getChannelData(0);
          
          // ⚡ 参考 WhisperLiveKit：立即转换为 PCM Int16，不等待
          // 转换过程应该尽可能快，避免阻塞音频处理线程
          // 使用优化的转换算法，减少计算开销
          const int16 = new Int16Array(inputData.length);
          const maxInt16 = 0x7FFF;
          
          // ⚡ 优化：使用循环展开或批量处理（如果数据量大）
          // 对于小数据块（512 samples），直接循环即可
          for (let i = 0; i < inputData.length; i++) {
            // 限制范围到 [-1, 1] 并转换为 Int16
            // 使用 Math.max/Math.min 确保范围正确
            const sample = Math.max(-1, Math.min(1, inputData[i]));
            int16[i] = Math.round(sample * maxInt16);
          }

          // ⚡ 参考 WhisperLiveKit：立即发送小音频块
          // WhisperLiveKit 使用先进算法（SimulStreaming、WhisperStreaming），
          // 可以处理更小的音频块而不丢失语境，实现超低延迟（< 300ms）
          // 512 samples = 32ms @ 16kHz，超低延迟
          this.sendAudioChunk(int16);
        } catch (e) {
          console.error('Failed to process audio data:', e);
        }
      };

      // 连接音频处理链
      this.source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);

      console.log('Audio processing started, sending PCM data to WebSocket');

    } catch (error) {
      console.error('Failed to start recording:', error);
      const err = error instanceof Error ? error : new Error('无法启动录音');
      if (this.onError) {
        this.onError(err);
      }
    }
  }

  /**
   * 停止识别
   */
  stop(): void {
    // 如果已经停止，避免重复调用
    if (!this.isRunning && !this.ws && !this.stream) {
      return;
    }

    this.isRunning = false;

    // 断开音频处理链
    if (this.scriptProcessor) {
      try {
        this.scriptProcessor.disconnect();
      } catch (e) {
        console.log('ScriptProcessor already disconnected');
      }
      this.scriptProcessor = null;
    }

    if (this.source) {
      try {
        this.source.disconnect();
      } catch (e) {
        console.log('Source already disconnected');
      }
      this.source = null;
    }

    if (this.audioContext) {
      try {
        this.audioContext.close();
      } catch (e) {
        console.log('AudioContext already closed');
      }
      this.audioContext = null;
    }

    if (this.ws) {
      try {
        // 发送结束信号
        if (this.ws.readyState === WebSocket.OPEN) {
          this.ws.send('EOS');
        }
        this.ws.close();
      } catch (e) {
        // 已经关闭，静默处理
      }
      this.ws = null;
    }

    if (this.stream) {
      // 注意：不要停止 stream，因为 RecordingService 可能还在使用
      this.stream = null;
    }

    // 先移除回调，避免触发状态更新导致循环
    const statusCallback = this.onStatusChange;
    this.onStatusChange = undefined;
    
    if (statusCallback) {
      statusCallback('idle');
    }
  }

  /**
   * 获取状态
   */
  getStatus(): 'idle' | 'running' | 'error' {
    if (!this.ws) return 'idle';
    if (this.isRunning && this.ws.readyState === WebSocket.OPEN) return 'running';
    return 'error';
  }


  /**
   * 发送音频块到WebSocket
   * 
   * ⚡ 参考 WhisperLiveKit：
   * - 直接发送 PCM Int16 二进制数据
   * - 格式：16kHz, 单声道, Int16
   * - 立即发送，不缓冲，实现超低延迟
   */
  private sendAudioChunk(int16: Int16Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || int16.length === 0) {
      return;
    }

    // ⚡ 参考 WhisperLiveKit：记录发送的音频数据时间戳
    // 用于确定识别结果对应的音频时间段（可选，主要用于调试）
    const now = Date.now();
    this.audioDataTimestamps.push({
      timestamp: now,
      samples: int16.length,
    });
    
    // 保持时间戳记录在合理范围内（最多保留最近10秒的数据）
    const maxAge = 10000; // 10秒
    this.audioDataTimestamps = this.audioDataTimestamps.filter(
      item => now - item.timestamp < maxAge
    );
    
    // ⚡ 参考 WhisperLiveKit：直接发送二进制数据（PCM Int16）
    // 后端会立即处理，不等待缓冲，实现超低延迟（< 300ms）
    try {
      this.ws.send(int16.buffer);
    } catch (e) {
      console.error('Failed to send audio chunk:', e);
    }
  }
}
