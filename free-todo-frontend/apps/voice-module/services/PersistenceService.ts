import { TranscriptSegment, ScheduleItem, AudioSegment } from '../types';

// 在 Next.js 环境中使用 process.env
const API_BASE_URL = typeof window !== 'undefined' 
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api')
  : 'http://localhost:8000/api';

/**
 * 数据持久化服务 - 负责数据上传和保存
 */
export class PersistenceService {
  private uploadQueue: Array<{ type: 'audio' | 'transcript' | 'schedule'; data: any }> = [];
  private isUploading: boolean = false;
  private batchSize: number = 10;
  private uploadDelay: number = 2000; // 2秒延迟批量上传

  // 回调函数
  private onUploadProgress?: (type: string, progress: number) => void;
  private onError?: (error: Error) => void;
  private onStatusChange?: (status: 'idle' | 'uploading' | 'error') => void;

  constructor() {
    // 定期处理上传队列
    if (typeof window !== 'undefined') {
      setInterval(() => {
        this.processUploadQueue();
      }, this.uploadDelay);
    }
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: {
    onUploadProgress?: (type: string, progress: number) => void;
    onError?: (error: Error) => void;
    onStatusChange?: (status: 'idle' | 'uploading' | 'error') => void;
  }) {
    this.onUploadProgress = callbacks.onUploadProgress;
    this.onError = callbacks.onError;
    this.onStatusChange = callbacks.onStatusChange;
  }

  /**
   * 上传音频片段
   */
  async uploadAudio(blob: Blob, metadata: {
    startTime: Date;
    endTime: Date;
    segmentId: string;
  }): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append('file', blob, `${metadata.segmentId}.webm`);
      formData.append('startTime', metadata.startTime.toISOString());
      formData.append('endTime', metadata.endTime.toISOString());
      formData.append('segmentId', metadata.segmentId);

      const response = await fetch(`${API_BASE_URL}/audio/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result.id || null;
    } catch (error) {
      console.error('Audio upload failed:', error);
      
      // 失败时加入重试队列
      this.uploadQueue.push({
        type: 'audio',
        data: { blob, metadata, retries: 0 },
      });

      if (this.onError) {
        const err = error instanceof Error ? error : new Error('Audio upload failed');
        this.onError(err);
      }

      return null;
    }
  }

  /**
   * 批量保存转录文本
   */
  async saveTranscripts(segments: TranscriptSegment[]): Promise<void> {
    if (segments.length === 0) return;

    try {
      const payload = segments.map(segment => ({
        id: segment.id,
        timestamp: segment.timestamp.toISOString(),
        rawText: segment.rawText,
        optimizedText: segment.optimizedText,
        audioStart: segment.audioStart,
        audioEnd: segment.audioEnd,
        audioFileId: segment.audioFileId,
      }));

      const response = await fetch(`${API_BASE_URL}/transcripts/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcripts: payload }),
      });

      if (!response.ok) {
        throw new Error(`Save transcripts failed: ${response.statusText}`);
      }

      const result = await response.json();
      console.log(`Saved ${result.saved || segments.length} transcripts`);
    } catch (error) {
      console.error('Save transcripts failed:', error);
      
      // 失败时加入重试队列
      segments.forEach(segment => {
        this.uploadQueue.push({
          type: 'transcript',
          data: { segment, retries: 0 },
        });
      });

      if (this.onError) {
        const err = error instanceof Error ? error : new Error('Save transcripts failed');
        this.onError(err);
      }
    }
  }

  /**
   * 保存日程
   */
  async saveSchedules(schedules: ScheduleItem[]): Promise<void> {
    if (schedules.length === 0) return;

    try {
      const payload = schedules.map(schedule => ({
        id: schedule.id,
        sourceSegmentId: schedule.sourceSegmentId,
        scheduleTime: schedule.scheduleTime.toISOString(),
        description: schedule.description,
        status: schedule.status,
        extractedAt: schedule.extractedAt.toISOString(),
      }));

      const response = await fetch(`${API_BASE_URL}/schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ schedules: payload }),
      });

      if (!response.ok) {
        throw new Error(`Save schedules failed: ${response.statusText}`);
      }

      console.log(`Saved ${schedules.length} schedules`);
    } catch (error) {
      console.error('Save schedules failed:', error);
      
      // 失败时加入重试队列
      schedules.forEach(schedule => {
        this.uploadQueue.push({
          type: 'schedule',
          data: { schedule, retries: 0 },
        });
      });

      if (this.onError) {
        const err = error instanceof Error ? error : new Error('Save schedules failed');
        this.onError(err);
      }
    }
  }

  /**
   * 查询历史转录
   */
  async queryTranscripts(startTime: Date, endTime: Date): Promise<TranscriptSegment[]> {
    try {
      const params = new URLSearchParams({
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });

      const response = await fetch(`${API_BASE_URL}/transcripts?${params}`);
      
      if (!response.ok) {
        throw new Error(`Query transcripts failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      return data.transcripts.map((t: any) => ({
        id: t.id,
        timestamp: new Date(t.timestamp),
        rawText: t.rawText,
        optimizedText: t.optimizedText,
        isOptimized: !!t.optimizedText,
        containsSchedule: t.containsSchedule || false,
        audioStart: t.audioStart,
        audioEnd: t.audioEnd,
        audioFileId: t.audioFileId,
        uploadStatus: 'uploaded' as const,
      }));
    } catch (error) {
      console.error('Query transcripts failed:', error);
      if (this.onError) {
        const err = error instanceof Error ? error : new Error('Query transcripts failed');
        this.onError(err);
      }
      return [];
    }
  }

  /**
   * 查询日程
   */
  async querySchedules(startTime: Date, endTime: Date): Promise<ScheduleItem[]> {
    try {
      const params = new URLSearchParams({
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
      });

      const response = await fetch(`${API_BASE_URL}/schedules?${params}`);
      
      if (!response.ok) {
        throw new Error(`Query schedules failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      return data.schedules.map((s: any) => ({
        id: s.id,
        sourceSegmentId: s.sourceSegmentId,
        extractedAt: new Date(s.extractedAt),
        scheduleTime: new Date(s.scheduleTime),
        description: s.description,
        status: s.status as 'pending' | 'confirmed' | 'cancelled',
      }));
    } catch (error) {
      console.error('Query schedules failed:', error);
      if (this.onError) {
        const err = error instanceof Error ? error : new Error('Query schedules failed');
        this.onError(err);
      }
      return [];
    }
  }

  /**
   * 获取音频文件URL
   */
  async getAudioUrl(audioFileId: string): Promise<string | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/audio/${audioFileId}`);
      
      if (!response.ok) {
        throw new Error(`Get audio URL failed: ${response.statusText}`);
      }

      const data = await response.json();
      // 后端返回的 url 是相对路径，需要拼接完整 URL
      if (data.url) {
        // 如果已经是完整 URL，直接返回
        if (data.url.startsWith('http://') || data.url.startsWith('https://')) {
          return data.url;
        }
        // 如果是相对路径，需要正确拼接
        // 后端返回的格式可能是 /api/audio/file/xxx.webm
        // API_BASE_URL 是 http://localhost:8000/api
        // 需要去掉 API_BASE_URL 的 /api 部分，然后拼接
        try {
          // 确保 API_BASE_URL 是有效的
          if (!API_BASE_URL || typeof API_BASE_URL !== 'string') {
            console.error('Invalid API_BASE_URL:', API_BASE_URL);
            return null;
          }
          
          const baseUrl = API_BASE_URL.replace(/\/api$/, ''); // 去掉末尾的 /api
          // 确保 baseUrl 和 data.url 都是有效字符串
          if (!baseUrl || !data.url || typeof data.url !== 'string') {
            console.error('Invalid URL components:', { baseUrl, url: data.url, apiBaseUrl: API_BASE_URL });
            return null;
          }
          
          // 确保 data.url 以 / 开头
          const urlPath = data.url.startsWith('/') ? data.url : `/${data.url}`;
          const fullUrl = `${baseUrl}${urlPath}`;
          
          // 验证 URL 是否有效（使用 try-catch 捕获错误）
          try {
            const urlObj = new URL(fullUrl);
            // 验证通过，返回完整 URL
            return urlObj.toString();
          } catch (urlError) {
            console.error('Invalid URL format:', {
              fullUrl,
              baseUrl,
              urlPath,
              error: urlError,
            });
            return null;
          }
        } catch (error) {
          console.error('Failed to construct audio URL:', error, { 
            baseUrl: API_BASE_URL, 
            url: data.url,
            errorMessage: error instanceof Error ? error.message : String(error)
          });
          return null;
        }
      }
      return null;
    } catch (error) {
      console.error('Get audio URL failed:', error);
      return null;
    }
  }

  /**
   * 处理上传队列
   */
  private async processUploadQueue(): Promise<void> {
    if (this.isUploading || this.uploadQueue.length === 0) {
      return;
    }

    this.isUploading = true;
    
    if (this.onStatusChange) {
      this.onStatusChange('uploading');
    }

    try {
      // 按类型分组
      const audioItems = this.uploadQueue.filter(item => item.type === 'audio');
      const transcriptItems = this.uploadQueue.filter(item => item.type === 'transcript');
      const scheduleItems = this.uploadQueue.filter(item => item.type === 'schedule');

      // 处理音频上传（逐个处理）
      for (const item of audioItems.slice(0, 1)) { // 每次只处理一个音频
        const { blob, metadata, retries } = item.data;
        if (retries < 3) {
          const id = await this.uploadAudio(blob, metadata);
          if (id) {
            this.uploadQueue = this.uploadQueue.filter(i => i !== item);
          } else {
            item.data.retries = (retries || 0) + 1;
          }
        } else {
          // 超过重试次数，移除
          this.uploadQueue = this.uploadQueue.filter(i => i !== item);
        }
      }

      // 批量处理转录文本
      if (transcriptItems.length > 0) {
        const segments = transcriptItems
          .slice(0, this.batchSize)
          .map(item => item.data.segment as TranscriptSegment);
        
        await this.saveTranscripts(segments);
        this.uploadQueue = this.uploadQueue.filter(item => !transcriptItems.includes(item));
      }

      // 批量处理日程
      if (scheduleItems.length > 0) {
        const schedules = scheduleItems
          .slice(0, this.batchSize)
          .map(item => item.data.schedule as ScheduleItem);
        
        await this.saveSchedules(schedules);
        this.uploadQueue = this.uploadQueue.filter(item => !scheduleItems.includes(item));
      }

    } catch (error) {
      console.error('Process upload queue failed:', error);
      if (this.onError) {
        const err = error instanceof Error ? error : new Error('Process upload queue failed');
        this.onError(err);
      }
    } finally {
      this.isUploading = false;
      if (this.uploadQueue.length === 0 && this.onStatusChange) {
        this.onStatusChange('idle');
      }
    }
  }

  /**
   * 获取上传队列状态
   */
  getUploadQueueStatus(): { queueLength: number; isUploading: boolean } {
    return {
      queueLength: this.uploadQueue.length,
      isUploading: this.isUploading,
    };
  }
}
