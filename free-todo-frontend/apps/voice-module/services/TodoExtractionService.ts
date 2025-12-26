import { TranscriptSegment } from '../types';

export interface ExtractedTodo {
  id: string;
  title: string;
  description?: string;
  deadline?: Date;
  priority: 'high' | 'medium' | 'low';
  sourceSegmentId: string;
  extractedAt: Date;
  sourceText?: string;          // 来源文本片段（用于高亮）
  textStartIndex?: number;      // 文本开始位置（在原文本中的索引）
  textEndIndex?: number;        // 文本结束位置（在原文本中的索引）
}

/**
 * 待办提取服务 - 从优化后的文本中提取待办事项
 */
export class TodoExtractionService {
  private queue: TranscriptSegment[] = [];
  private isProcessing: boolean = false;
  private processingDelay: number = 300; // 处理延迟（ms）

  // 回调函数
  private onTodoExtracted?: (todo: ExtractedTodo) => void;
  private onError?: (error: Error) => void;
  private onStatusChange?: (status: 'idle' | 'processing' | 'error') => void;
  
  // 待确认的待办列表（当回调未设置时存储）
  public extractedTodosWithoutCallback: ExtractedTodo[] = [];

  constructor() {}

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: {
    onTodoExtracted?: (todo: ExtractedTodo) => void;
    onError?: (error: Error) => void;
    onStatusChange?: (status: 'idle' | 'processing' | 'error') => void;
  }) {
    this.onTodoExtracted = callbacks.onTodoExtracted;
    this.onError = callbacks.onError;
    this.onStatusChange = callbacks.onStatusChange;
  }

  /**
   * 添加已优化的片段到提取队列
   */
  enqueue(segment: TranscriptSegment): void {
    if (!segment.isOptimized || !segment.optimizedText) {
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
      await new Promise(resolve => setTimeout(resolve, this.processingDelay));
      
      const segment = this.queue.shift();
      if (!segment) {
        this.isProcessing = false;
        if (this.onStatusChange) {
          this.onStatusChange('idle');
        }
        return;
      }

      await this.extractTodos(segment);
      
      // 继续处理队列
      this.processQueue();
    } catch (error) {
      console.error('[TodoExtraction] 处理失败:', error);
      this.isProcessing = false;
      if (this.onError && error instanceof Error) {
        this.onError(error);
      }
      if (this.onStatusChange) {
        this.onStatusChange('error');
      }
    }
  }

  /**
   * 从文本中提取待办事项（调用后端API）
   */
  private async extractTodos(segment: TranscriptSegment): Promise<void> {
    if (!segment.optimizedText) {
      return;
    }

    try {
      // 调用后端API提取待办并自动创建Todo
      const response = await fetch('/api/audio/extract-todos', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: segment.optimizedText,
          reference_time: segment.timestamp.toISOString(),
          source_segment_id: segment.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`提取待办失败: ${response.statusText}`);
      }

      const data = await response.json();
      
      // 后端返回提取结果，不自动创建，先存储到待确认列表
      if (data.todos && data.todos.length > 0) {
        for (const todo of data.todos) {
          const extractedTodo: ExtractedTodo = {
            id: `todo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
            title: todo.title,
            description: todo.description,
            deadline: todo.deadline ? new Date(todo.deadline) : undefined,
            priority: todo.priority as 'high' | 'medium' | 'low',
            sourceSegmentId: segment.id,
            extractedAt: new Date(),
            sourceText: todo.source_text || todo.title || todo.description,
            textStartIndex: todo.text_start_index,
            textEndIndex: todo.text_end_index,
          };
          
          // 先存储到待确认列表，不自动调用回调
          if (!this.extractedTodosWithoutCallback) {
            this.extractedTodosWithoutCallback = [];
          }
          this.extractedTodosWithoutCallback.push(extractedTodo);
        }
      }
    } catch (error) {
      console.error('[TodoExtraction] 调用后端API失败，使用本地解析:', error);
      
      // 降级到本地解析
      const todos = this.parseTodos(segment.optimizedText, segment);
      
      for (const todo of todos) {
        if (this.onTodoExtracted) {
          this.onTodoExtracted(todo);
        }
      }
    }
  }

  /**
   * 解析文本中的待办事项
   */
  private parseTodos(text: string, segment: TranscriptSegment): ExtractedTodo[] {
    const todos: ExtractedTodo[] = [];
    
    // 方法1: 匹配 [TODO: ...] 格式（LLM 标记的）
    const todoRegex = /\[TODO:\s*([^|]+)(?:\s*\|\s*deadline:\s*([^|]+))?(?:\s*\|\s*priority:\s*(\w+))?\]/g;
    let match;

    while ((match = todoRegex.exec(text)) !== null) {
      const title = match[1].trim();
      const deadlineText = match[2]?.trim();
      const priorityText = match[3]?.trim().toLowerCase() || 'medium';
      
      const deadline = deadlineText ? this.parseDeadline(deadlineText, segment.timestamp) : undefined;
      const priority = (priorityText === 'high' || priorityText === 'low') ? priorityText : 'medium';
      
      const todo: ExtractedTodo = {
        id: `todo_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        title,
        description: text.substring(Math.max(0, match.index - 50), Math.min(text.length, match.index + match[0].length + 50)),
        deadline,
        priority,
        sourceSegmentId: segment.id,
        extractedAt: new Date(),
      };
      
      todos.push(todo);
    }

    return todos;
  }

  /**
   * 解析截止时间
   */
  private parseDeadline(deadlineText: string, referenceTime: Date): Date | undefined {
    try {
      // 简单的时间解析（可以后续增强）
      const now = referenceTime || new Date();
      const lowerText = deadlineText.toLowerCase();
      
      // 相对时间
      if (lowerText.includes('今天')) {
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      }
      if (lowerText.includes('明天')) {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        return new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 23, 59, 59);
      }
      if (lowerText.includes('后天')) {
        const dayAfter = new Date(now);
        dayAfter.setDate(dayAfter.getDate() + 2);
        return new Date(dayAfter.getFullYear(), dayAfter.getMonth(), dayAfter.getDate(), 23, 59, 59);
      }
      
      // 尝试解析 ISO 格式
      const parsed = new Date(deadlineText);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
      
      return undefined;
    } catch (error) {
      console.warn('[TodoExtraction] 解析截止时间失败:', deadlineText, error);
      return undefined;
    }
  }
}

