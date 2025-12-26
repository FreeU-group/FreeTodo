/**
 * 原文视图组件
 * 显示转录的原始文本，高亮已提取的字段
 */

import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "../types";

interface OriginalTextViewProps {
  segments: TranscriptSegment[];
  onSegmentClick?: (segment: TranscriptSegment) => void;
  highlightedSegmentId?: string;
  schedules?: Array<{
    sourceSegmentId: string;
    sourceText?: string;
    textStartIndex?: number;
    textEndIndex?: number;
    description?: string;
  }>; // 日程信息，用于高亮
  todos?: Array<{
    sourceSegmentId: string;
    sourceText?: string;
    textStartIndex?: number;
    textEndIndex?: number;
  }>; // 待办信息，用于高亮
}

export function OriginalTextView({
  segments,
  onSegmentClick,
  highlightedSegmentId,
  schedules = [],
  todos = [],
}: OriginalTextViewProps) {
  // 原文视图也需要高亮，通过sourceText在原文中匹配
  const renderHighlightedText = (text: string, segmentId: string) => {
    // 获取该segment的所有日程和待办
    const segmentSchedules = schedules.filter(s => s.sourceSegmentId === segmentId);
    const segmentTodos = todos.filter(t => t.sourceSegmentId === segmentId);
    
    // 合并所有需要高亮的位置
    const highlights: Array<{ start: number; end: number; type: 'schedule' | 'todo' }> = [];
    
    segmentSchedules.forEach(schedule => {
      // 优先使用LLM返回的textStartIndex和textEndIndex（如果可用）
      if (schedule.textStartIndex !== undefined && schedule.textEndIndex !== undefined) {
        // 确保索引在文本范围内
        const start = Math.max(0, Math.min(schedule.textStartIndex, text.length));
        const end = Math.max(start, Math.min(schedule.textEndIndex, text.length));
        if (start < end) {
          highlights.push({
            start,
            end,
            type: 'schedule',
          });
        }
      } else if (schedule.sourceText && schedule.sourceText.trim()) {
        // 如果没有索引，使用sourceText在原文中匹配
        const sourceText = schedule.sourceText.trim();
        let index = text.indexOf(sourceText);
        if (index === -1 && sourceText.length > 10) {
          // 如果文本较长，尝试匹配前10个字符
          const shortText = sourceText.substring(0, 10);
          index = text.indexOf(shortText);
          if (index !== -1) {
            const endPos = Math.min(index + sourceText.length, text.length);
            highlights.push({
              start: index,
              end: endPos,
              type: 'schedule',
            });
          }
        } else if (index !== -1) {
          highlights.push({
            start: index,
            end: Math.min(index + sourceText.length, text.length),
            type: 'schedule',
          });
        }
      }
      
      // 如果以上都失败，尝试使用description
      const hasScheduleHighlight = highlights.some(h => h.type === 'schedule' && h.start >= 0);
      if (!hasScheduleHighlight && schedule.description) {
        const desc = schedule.description.trim();
        const index = text.indexOf(desc);
        if (index !== -1) {
          highlights.push({
            start: index,
            end: Math.min(index + desc.length, text.length),
            type: 'schedule',
          });
        }
      }
    });
    
    segmentTodos.forEach(todo => {
      // 优先使用LLM返回的textStartIndex和textEndIndex（如果可用）
      if (todo.textStartIndex !== undefined && todo.textEndIndex !== undefined) {
        // 确保索引在文本范围内
        const start = Math.max(0, Math.min(todo.textStartIndex, text.length));
        const end = Math.max(start, Math.min(todo.textEndIndex, text.length));
        if (start < end) {
          highlights.push({
            start,
            end,
            type: 'todo',
          });
        }
      } else if (todo.sourceText) {
        // 如果没有索引，使用sourceText匹配
        const index = text.indexOf(todo.sourceText);
        if (index !== -1) {
          highlights.push({
            start: index,
            end: Math.min(index + todo.sourceText.length, text.length),
            type: 'todo',
          });
        }
      }
    });
    
    // 按位置排序
    highlights.sort((a, b) => a.start - b.start);
    
    // 如果没有高亮，直接返回文本
    if (highlights.length === 0) {
      return <span>{text}</span>;
    }
    
    // 构建高亮文本
    const parts: Array<{ text: string; highlight?: 'schedule' | 'todo' }> = [];
    let lastIndex = 0;
    
    highlights.forEach(highlight => {
      // 添加高亮前的文本
      if (highlight.start > lastIndex) {
        parts.push({ text: text.substring(lastIndex, highlight.start) });
      }
      // 添加高亮的文本
      parts.push({
        text: text.substring(highlight.start, highlight.end),
        highlight: highlight.type,
      });
      lastIndex = highlight.end;
    });
    
    // 添加剩余的文本
    if (lastIndex < text.length) {
      parts.push({ text: text.substring(lastIndex) });
    }
    
    return (
      <>
        {parts.map((part, index) => {
          if (part.highlight === 'schedule') {
            return (
              <mark
                key={index}
                className={cn(
                  "relative inline-block",
                  "bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-800/30",
                  "text-amber-900 dark:text-amber-100",
                  "px-1.5 py-0.5 rounded-md",
                  "font-medium",
                  "border border-amber-300/50 dark:border-amber-700/50",
                  "shadow-sm",
                  "transition-all duration-200",
                  "hover:shadow-md hover:scale-[1.02]",
                  "cursor-pointer"
                )}
                title="日程安排"
              >
                {part.text}
              </mark>
            );
          } else if (part.highlight === 'todo') {
            return (
              <mark
                key={index}
                className={cn(
                  "relative inline-block",
                  "bg-gradient-to-r from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/30",
                  "text-blue-900 dark:text-blue-100",
                  "px-1.5 py-0.5 rounded-md",
                  "font-medium",
                  "border border-blue-300/50 dark:border-blue-700/50",
                  "shadow-sm",
                  "transition-all duration-200",
                  "hover:shadow-md hover:scale-[1.02]",
                  "cursor-pointer"
                )}
                title="待办事项"
              >
                {part.text}
              </mark>
            );
          } else {
            return <span key={index}>{part.text}</span>;
          }
        })}
      </>
    );
  };

  // 不再需要分段函数，因为后端已经按段落分割成多个独立的segment了

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
      {segments.length === 0 ? (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          <div className="text-center">
            <div className="text-4xl mb-2">📝</div>
            <p className="text-sm font-medium">暂无转录内容</p>
            <p className="text-xs mt-1 opacity-70">开始录音后，转录内容将显示在这里</p>
          </div>
        </div>
      ) : (
        segments
          .filter(s => !s.isInterim) // 过滤临时结果
          .map((segment) => {
          const text = segment.rawText; // 原文视图只显示原始文本
          const isHighlighted = segment.id === highlightedSegmentId;

          return (
            <div
              key={segment.id}
              className={cn(
                "group relative py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer",
                isHighlighted && "bg-primary/5"
              )}
              onClick={() => onSegmentClick?.(segment)}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <div className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center",
                    isHighlighted
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/50 group-hover:border-primary/50"
                  )}>
                    <span className="text-[10px]">📝</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">
                      {segment.timestamp.toLocaleTimeString("zh-CN", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">
                    {renderHighlightedText(text, segment.id)}
                  </p>
                </div>
              </div>

              {/* 临时结果提示 */}
              {segment.isInterim && (
                <div className="mt-3 text-xs text-muted-foreground italic flex items-center gap-2">
                  <span className="animate-pulse">🎤</span>
                  <span>正在识别...</span>
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

