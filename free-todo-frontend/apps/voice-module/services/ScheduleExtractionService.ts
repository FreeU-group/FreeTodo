import { TranscriptSegment, ScheduleItem } from '../types';

/**
 * 日程提取服务 - 从优化后的文本中提取日程信息
 */
export class ScheduleExtractionService {
  private queue: TranscriptSegment[] = [];
  private isProcessing: boolean = false;
  private processingDelay: number = 300;

  // 回调函数
  private onScheduleExtracted?: (schedule: ScheduleItem) => void;
  private onError?: (error: Error) => void;
  private onStatusChange?: (status: 'idle' | 'processing' | 'error') => void;
  
  // 当回调未设置时，存储提取结果
  public extractedSchedulesWithoutCallback: ScheduleItem[] = [];

  constructor() {}

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: {
    onScheduleExtracted?: (schedule: ScheduleItem) => void;
    onError?: (error: Error) => void;
    onStatusChange?: (status: 'idle' | 'processing' | 'error') => void;
  }) {
    this.onScheduleExtracted = callbacks.onScheduleExtracted;
    this.onError = callbacks.onError;
    this.onStatusChange = callbacks.onStatusChange;
  }

  /**
   * 添加已优化的片段到提取队列
   */
  enqueue(segment: TranscriptSegment): void {
    // 检查是否有文本（优化文本或原始文本）
    const textToUse = segment.optimizedText || segment.rawText;
    if (!textToUse || !textToUse.trim()) {
      console.log('[ScheduleExtraction] ⚠️ 跳过空文本片段:', segment.id);
      return;
    }

    // 不再检查是否包含日程标记，直接调用LLM提取（LLM会智能识别日程）
    // 因为现在使用LLM API，不需要预先标记

    const exists = this.queue.find(s => s.id === segment.id);
    if (exists) {
      console.log('[ScheduleExtraction] ⚠️ 片段已在队列中:', segment.id);
      return;
    }

    console.log('[ScheduleExtraction] ✅ 添加片段到提取队列:', {
      id: segment.id,
      textLength: textToUse.length,
      hasOptimizedText: !!segment.optimizedText
    });
    this.queue.push(segment);
    this.processQueue();
  }

  /**
   * 处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    
    if (this.onStatusChange) {
      this.onStatusChange('processing');
    }

    try {
      const segment = this.queue.shift();
      if (!segment) {
        this.isProcessing = false;
        if (this.onStatusChange) {
          this.onStatusChange('idle');
        }
        return;
      }

      await this.extractSchedules(segment);

      await new Promise(resolve => setTimeout(resolve, this.processingDelay));

      if (this.queue.length > 0) {
        this.processQueue();
      } else {
        this.isProcessing = false;
        if (this.onStatusChange) {
          this.onStatusChange('idle');
        }
      }
    } catch (error) {
      console.error('[ScheduleExtraction] Error processing queue:', error);
      this.isProcessing = false;
      if (this.onStatusChange) {
        this.onStatusChange('error');
      }
    }
  }

  /**
   * 从文本中提取日程（调用后端LLM API）
   */
  private async extractSchedules(segment: TranscriptSegment): Promise<void> {
    const textToUse = segment.optimizedText || segment.rawText;
    if (!textToUse || !textToUse.trim()) {
      console.log('[ScheduleExtraction] ⚠️ 片段文本为空，跳过提取:', segment.id);
      return;
    }

    try {
      console.log('[ScheduleExtraction] 🤖 开始调用LLM API提取日程，片段ID:', segment.id, '文本长度:', textToUse.length);
      
      // 调用后端LLM API提取日程
      const API_BASE_URL = typeof window !== 'undefined' 
        ? (process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api')
        : 'http://localhost:8000/api';
      
      const requestBody = {
        text: textToUse,
        reference_time: segment.timestamp.toISOString(),
        source_segment_id: segment.id,
      };
      
      console.log('[ScheduleExtraction] 📤 发送提取请求:', {
        url: `${API_BASE_URL}/audio/extract-schedules`,
        textLength: textToUse.length,
        referenceTime: requestBody.reference_time
      });
      
      const response = await fetch(`${API_BASE_URL}/audio/extract-schedules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[ScheduleExtraction] ❌ API请求失败:', response.status, errorText);
        throw new Error(`提取日程失败: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[ScheduleExtraction] 📥 LLM API返回结果:', {
        schedulesCount: data.schedules?.length || 0,
        schedules: data.schedules
      });
      
      // 后端返回提取结果
      if (data.schedules && data.schedules.length > 0) {
        for (const scheduleData of data.schedules) {
          const schedule: ScheduleItem = {
            id: `schedule_${segment.id}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            sourceSegmentId: segment.segmentId || segment.audioFileId || segment.id, // 使用音频ID作为sourceSegmentId
            extractedAt: new Date(),
            scheduleTime: new Date(scheduleData.schedule_time),
            description: scheduleData.description,
            status: 'pending',
          };
          
          console.log('[ScheduleExtraction] ✅ 提取到日程:', {
            id: schedule.id,
            sourceSegmentId: schedule.sourceSegmentId,
            scheduleTime: schedule.scheduleTime,
            description: schedule.description?.substring(0, 50)
          });
          
        if (this.onScheduleExtracted) {
          this.onScheduleExtracted(schedule);
        }
        }
        console.log(`[ScheduleExtraction] ✅ LLM提取到 ${data.schedules.length} 个日程`);
      } else {
        console.log(`[ScheduleExtraction] ℹ️ LLM未提取到日程（文本可能不包含日程信息）`);
      }
    } catch (error) {
      console.error(`[ScheduleExtraction] ❌ 提取失败，片段ID: ${segment.id}`, error);
      if (this.onError) {
        const err = error instanceof Error ? error : new Error('Schedule extraction failed');
        this.onError(err);
      }
    }
  }

  /**
   * 解析文本中的日程信息
   */
  private parseSchedules(text: string, segment: TranscriptSegment): ScheduleItem[] {
    const schedules: ScheduleItem[] = [];
    
    // 匹配 [SCHEDULE: ...] 格式
    const scheduleRegex = /\[SCHEDULE:\s*([^\]]+)\]/g;
    let match;

    let matchIndex = 0;
    while ((match = scheduleRegex.exec(text)) !== null) {
      const scheduleText = match[1].trim();
      const scheduleTime = this.parseScheduleTime(scheduleText, segment.timestamp);
      
      if (scheduleTime) {
        // 使用segment.id和matchIndex确保唯一性，避免同一segment中多个schedule的key重复
        const schedule: ScheduleItem = {
          id: `schedule_${segment.id}_${matchIndex}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          sourceSegmentId: segment.id,
          extractedAt: new Date(),
          scheduleTime: scheduleTime,
          description: scheduleText,
          status: 'pending',
        };
        
        schedules.push(schedule);
        matchIndex++;
      }
    }

    return schedules;
  }

  /**
   * 解析日程时间
   */
  private parseScheduleTime(text: string, baseTime: Date): Date | null {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // 解析相对时间
    const timePatterns = [
      // 今天
      { pattern: /今天\s*(\d{1,2}):(\d{2})/, offset: 0 },
      { pattern: /今天\s*(\d{1,2})点/, offset: 0 },
      // 明天
      { pattern: /明天\s*(\d{1,2}):(\d{2})/, offset: 1 },
      { pattern: /明天\s*(\d{1,2})点/, offset: 1 },
      // 后天
      { pattern: /后天\s*(\d{1,2}):(\d{2})/, offset: 2 },
      { pattern: /后天\s*(\d{1,2})点/, offset: 2 },
      // 下周
      { pattern: /下周\s*(\d{1,2}):(\d{2})/, offset: 7 },
      // 具体日期
      { pattern: /(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{2})/, isAbsolute: true },
    ];

    for (const { pattern, offset, isAbsolute } of timePatterns) {
      const match = text.match(pattern);
      if (match) {
        if (isAbsolute && match.length >= 5) {
          // 绝对日期
          const month = parseInt(match[1]) - 1;
          const day = parseInt(match[2]);
          const hour = parseInt(match[3]);
          const minute = parseInt(match[4]);
          
          const year = now.getFullYear();
          const date = new Date(year, month, day, hour, minute);
          
          if (date < now) {
            date.setFullYear(year + 1);
          }
          
          return date;
        } else if (match.length >= 3 && offset !== undefined) {
          // 相对日期
          const hour = parseInt(match[1]);
          const minute = match[2] ? parseInt(match[2]) : 0;
          
          const targetDate = new Date(today);
          targetDate.setDate(targetDate.getDate() + offset);
          targetDate.setHours(hour, minute, 0, 0);
          
          return targetDate;
        }
      }
    }

    // 如果无法解析，返回基于基础时间的默认时间（明天同一时间）
    const defaultTime = new Date(baseTime);
    defaultTime.setDate(defaultTime.getDate() + 1);
    return defaultTime;
  }

  /**
   * 获取队列状态
   */
  getQueueStatus(): { queueLength: number; isProcessing: boolean } {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
    };
  }

  /**
   * 清空队列
   */
  clearQueue(): void {
    this.queue = [];
    this.isProcessing = false;
    if (this.onStatusChange) {
      this.onStatusChange('idle');
    }
  }
}
