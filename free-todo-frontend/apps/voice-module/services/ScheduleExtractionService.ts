import { TranscriptSegment, ScheduleItem } from '../types';

/**
 * 日程提取服务 - 从优化后的文本中提取日程信息
 */
export class ScheduleExtractionService {
  private queue: TranscriptSegment[] = [];
  private isProcessing: boolean = false;
  private processingDelay: number = 300; // 处理延迟（ms）

  // 回调函数
  private onScheduleExtracted?: (schedule: ScheduleItem) => void;
  private onError?: (error: Error) => void;
  private onStatusChange?: (status: 'idle' | 'processing' | 'error') => void;

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
    // 只处理已优化且包含日程标记的片段
    if (!segment.isOptimized || !segment.containsSchedule) {
      return;
    }

    // 避免重复处理
    const exists = this.queue.find(s => s.id === segment.id);
    if (exists) {
      return;
    }

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

      // 延迟后继续处理
      await new Promise(resolve => setTimeout(resolve, this.processingDelay));

      // 继续处理队列
      if (this.queue.length > 0) {
        this.processQueue();
      } else {
        this.isProcessing = false;
        if (this.onStatusChange) {
          this.onStatusChange('idle');
        }
      }
    } catch (error) {
      console.error('Error processing schedule extraction queue:', error);
      this.isProcessing = false;
      if (this.onStatusChange) {
        this.onStatusChange('error');
      }
    }
  }

  /**
   * 从文本中提取日程
   */
  private async extractSchedules(segment: TranscriptSegment): Promise<void> {
    if (!segment.optimizedText) {
      return;
    }

    try {
      const schedules = this.parseSchedules(segment.optimizedText, segment);
      
      for (const schedule of schedules) {
        if (this.onScheduleExtracted) {
          this.onScheduleExtracted(schedule);
        }
      }
    } catch (error) {
      console.error(`Schedule extraction failed for segment ${segment.id}:`, error);
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

    while ((match = scheduleRegex.exec(text)) !== null) {
      const scheduleText = match[1].trim();
      const scheduleTime = this.parseScheduleTime(scheduleText, segment.timestamp);
      
      if (scheduleTime) {
        const schedule: ScheduleItem = {
          id: `schedule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          sourceSegmentId: segment.id,
          extractedAt: new Date(),
          scheduleTime: scheduleTime,
          description: scheduleText,
          status: 'pending',
        };
        
        schedules.push(schedule);
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
          const month = parseInt(match[1]) - 1; // 月份从0开始
          const day = parseInt(match[2]);
          const hour = parseInt(match[3]);
          const minute = parseInt(match[4]);
          
          const year = now.getFullYear();
          const date = new Date(year, month, day, hour, minute);
          
          // 如果日期已过，则认为是明年
          if (date < now) {
            date.setFullYear(year + 1);
          }
          
          return date;
        } else if (match.length >= 3) {
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

