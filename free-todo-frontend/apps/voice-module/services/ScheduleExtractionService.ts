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
    // 只处理已优化的片段（无论是否包含日程标记，都尝试提取）
    // 因为即使 LLM 没有标记，文本中也可能包含时间信息
    if (!segment.isOptimized) {
      console.log(`[ScheduleExtraction] 片段 ${segment.id} 未优化，跳过`);
      return;
    }

    if (!segment.optimizedText) {
      console.log(`[ScheduleExtraction] 片段 ${segment.id} 没有优化文本，跳过`);
      return;
    }

    // 避免重复处理
    const exists = this.queue.find(s => s.id === segment.id);
    if (exists) {
      console.log(`[ScheduleExtraction] 片段 ${segment.id} 已在队列中，跳过`);
      return;
    }

    console.log(`[ScheduleExtraction] 将片段 ${segment.id} 加入队列，队列长度: ${this.queue.length}, 文本预览: ${segment.optimizedText.substring(0, 50)}...`);
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
      console.log(`[ScheduleExtraction] 片段 ${segment.id} 没有优化文本，跳过提取`);
      return;
    }

    try {
      console.log(`[ScheduleExtraction] 开始提取日程，片段ID: ${segment.id}, 文本: ${segment.optimizedText.substring(0, 100)}...`);
      const schedules = this.parseSchedules(segment.optimizedText, segment);
      console.log(`[ScheduleExtraction] 提取到 ${schedules.length} 个日程`);
      
      for (const schedule of schedules) {
        console.log(`[ScheduleExtraction] 提取到日程: ${schedule.description} (时间: ${schedule.scheduleTime.toLocaleString()})`);
        if (this.onScheduleExtracted) {
          this.onScheduleExtracted(schedule);
        } else {
          console.warn(`[ScheduleExtraction] onScheduleExtracted 回调未设置`);
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
    
    // 方法1: 匹配 [SCHEDULE: ...] 格式（LLM 标记的）
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

    // 方法2: 如果没有找到 [SCHEDULE: ...] 标记，尝试从文本中直接提取时间信息
    // 这适用于 LLM 没有正确标记但文本中确实包含时间信息的情况
    if (schedules.length === 0) {
      // 匹配时间模式（如 "早上7点"、"7:40"、"11:30" 等）
      const timePatterns = [
        /(早上|上午|中午|下午|晚上)\s*(\d{1,2}):?(\d{2})?点?/g,
        /(\d{1,2}):(\d{2})/g,  // 如 "7:40"
        /(\d{1,2})点/g,  // 如 "7点"
      ];

      for (const pattern of timePatterns) {
        let timeMatch;
        while ((timeMatch = pattern.exec(text)) !== null) {
          // 提取包含时间的上下文（前后各20个字符）
          const matchIndex = timeMatch.index;
          const matchText = timeMatch[0];
          const contextStart = Math.max(0, matchIndex - 20);
          const contextEnd = Math.min(text.length, matchIndex + matchText.length + 20);
          const context = text.substring(contextStart, contextEnd).trim();
          
          // 尝试解析时间
          const scheduleTime = this.parseScheduleTime(context, segment.timestamp);
          
          if (scheduleTime) {
            // 检查是否已存在相同时间的日程（避免重复）
            const exists = schedules.some(s => 
              Math.abs(s.scheduleTime.getTime() - scheduleTime.getTime()) < 60000 // 1分钟内
            );
            
            if (!exists) {
              const schedule: ScheduleItem = {
                id: `schedule_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
                sourceSegmentId: segment.id,
                extractedAt: new Date(),
                scheduleTime: scheduleTime,
                description: context, // 使用上下文作为描述
                status: 'pending',
              };
              
              schedules.push(schedule);
            }
          }
        }
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
      // 早上/上午/中午/下午/晚上 + 时间
      { pattern: /早上\s*(\d{1,2}):?(\d{2})?点?/, offset: 0, hourOffset: 0 },
      { pattern: /上午\s*(\d{1,2}):?(\d{2})?点?/, offset: 0, hourOffset: 0 },
      { pattern: /中午\s*(\d{1,2}):?(\d{2})?点?/, offset: 0, hourOffset: 12 },
      { pattern: /下午\s*(\d{1,2}):?(\d{2})?点?/, offset: 0, hourOffset: 12 },
      { pattern: /晚上\s*(\d{1,2}):?(\d{2})?点?/, offset: 0, hourOffset: 12 },
      // 纯时间格式（假设是今天，如果已过则认为是明天）
      { pattern: /^(\d{1,2}):(\d{2})$/, offset: 0, isTimeOnly: true },
      { pattern: /^(\d{1,2})点$/, offset: 0, isTimeOnly: true },
      // 具体日期
      { pattern: /(\d{1,2})月\s*(\d{1,2})日\s*(\d{1,2}):(\d{2})/, isAbsolute: true },
    ];

    for (const patternConfig of timePatterns) {
      const { pattern, isAbsolute, isTimeOnly } = patternConfig;
      const offset = patternConfig.offset ?? 0;
      const hourOffset = patternConfig.hourOffset ?? 0;
      
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
        } else if (isTimeOnly && match.length >= 3) {
          // 纯时间格式（如 "7:40" 或 "7点"）
          let hour = parseInt(match[1]);
          const minute = match[2] ? parseInt(match[2]) : 0;
          
          // 如果是下午时间（12点以后），需要加12小时
          // 但这里假设是24小时制，如果 hour < 12 且当前时间已过，则认为是今天；否则可能是明天
          const targetDate = new Date(today);
          targetDate.setHours(hour, minute, 0, 0);
          
          // 如果时间已过，则认为是明天
          if (targetDate < now) {
            targetDate.setDate(targetDate.getDate() + 1);
          }
          
          return targetDate;
        } else if (match.length >= 3) {
          // 相对日期（包含"今天"、"明天"等，或"早上"、"下午"等）
          let hour = parseInt(match[1]);
          const minute = match[2] ? parseInt(match[2]) : 0;
          
          // 处理"下午"、"晚上"等时间
          if (hourOffset > 0 && hour < 12) {
            hour += hourOffset;
          }
          
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

