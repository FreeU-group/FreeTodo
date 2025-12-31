/**
 * 会议纪要组件（参考通义听悟）
 * 包含：会议摘要、智能纪要、待办事项
 */

import { CheckCircle2, ChevronDown, ChevronUp, Clock, ThumbsUp } from "lucide-react";
import { useState } from "react";
import type { TranscriptSegment, ScheduleItem } from "../types";
import type { ExtractedTodo } from "../services/TodoExtractionService";

interface MeetingSummaryProps {
  segments: TranscriptSegment[];
  schedules: ScheduleItem[];
  todos: ExtractedTodo[];
  onSegmentClick?: (segment: TranscriptSegment) => void;
  summaryText?: string; // LLM生成的智能纪要
}

export function MeetingSummary({
  segments,
  schedules,
  todos,
  onSegmentClick,
  summaryText,
}: MeetingSummaryProps) {
  const [expandedSections, setExpandedSections] = useState({
    summary: true,
    chapters: true,
    todos: true,
  });

  // 渲染高亮文本（高亮日程和待办）
  const renderHighlightedText = (text: string, segmentId: string) => {
    // 获取该segment的所有日程和待办
    const segmentSchedules = schedules.filter(s => s.sourceSegmentId === segmentId);
    const segmentTodos = todos.filter(t => t.sourceSegmentId === segmentId);
    
    // 合并所有需要高亮的位置
    const highlights: Array<{ start: number; end: number; type: 'schedule' | 'todo' }> = [];
    
    // 处理日程高亮 - 优先使用textStartIndex和textEndIndex
    segmentSchedules.forEach(schedule => {
      // 优先使用精确的索引位置
      if (schedule.textStartIndex !== undefined && schedule.textEndIndex !== undefined) {
        const start = Math.max(0, schedule.textStartIndex);
        const end = Math.min(text.length, schedule.textEndIndex);
        if (start < end) {
          highlights.push({
            start,
            end,
            type: 'schedule',
          });
          return;
        }
      }
      
      // 其次使用sourceText精确匹配
      if (schedule.sourceText) {
        const sourceText = schedule.sourceText.trim();
        if (sourceText.length >= 2) {
          const lowerText = text.toLowerCase();
          const lowerSource = sourceText.toLowerCase();
          const index = lowerText.indexOf(lowerSource);
          
          if (index !== -1) {
            highlights.push({
              start: index,
              end: Math.min(index + sourceText.length, text.length),
              type: 'schedule',
            });
            return;
          }
        }
      }
      
      // 最后使用description模糊匹配
      if (schedule.description) {
        const description = schedule.description.trim();
        if (description.length >= 2) {
          const lowerText = text.toLowerCase();
          const lowerDesc = description.toLowerCase();
          const index = lowerText.indexOf(lowerDesc);
          
          if (index !== -1) {
            highlights.push({
              start: index,
              end: Math.min(index + description.length, text.length),
              type: 'schedule',
            });
          }
        }
      }
    });
    
    // 处理待办高亮 - 优先使用textStartIndex和textEndIndex
    segmentTodos.forEach(todo => {
      // 优先使用精确的索引位置
      if (todo.textStartIndex !== undefined && todo.textEndIndex !== undefined) {
        const start = Math.max(0, todo.textStartIndex);
        const end = Math.min(text.length, todo.textEndIndex);
        if (start < end) {
          highlights.push({
            start,
            end,
            type: 'todo',
          });
          return;
        }
      }
      
      // 其次使用sourceText精确匹配
      if (todo.sourceText) {
        const sourceText = todo.sourceText.trim();
        if (sourceText.length >= 2) {
          const lowerText = text.toLowerCase();
          const lowerSource = sourceText.toLowerCase();
          const index = lowerText.indexOf(lowerSource);
          
          if (index !== -1) {
            highlights.push({
              start: index,
              end: Math.min(index + sourceText.length, text.length),
              type: 'todo',
            });
            return;
          }
        }
      }
      
      // 最后使用title模糊匹配
      if (todo.title) {
        const title = todo.title.trim();
        if (title.length >= 2) {
          const lowerText = text.toLowerCase();
          const lowerTitle = title.toLowerCase();
          const index = lowerText.indexOf(lowerTitle);
          
          if (index !== -1) {
            highlights.push({
              start: index,
              end: Math.min(index + title.length, text.length),
              type: 'todo',
            });
          }
        }
      }
    });
    
    // 按位置排序并去重重叠
    highlights.sort((a, b) => a.start - b.start);
    const mergedHighlights: Array<{ start: number; end: number; type: 'schedule' | 'todo' }> = [];
    highlights.forEach(highlight => {
      const last = mergedHighlights[mergedHighlights.length - 1];
      if (last && highlight.start < last.end) {
        // 重叠，合并（优先保留日程）
        last.end = Math.max(last.end, highlight.end);
        if (highlight.type === 'schedule') {
          last.type = 'schedule';
        }
      } else {
        mergedHighlights.push(highlight);
      }
    });
    
    if (mergedHighlights.length === 0) {
      return <span className="text-foreground">{text}</span>;
    }
    
    // 构建高亮文本
    const parts: Array<{ text: string; highlight?: 'schedule' | 'todo' }> = [];
    let lastIndex = 0;
    
    mergedHighlights.forEach(highlight => {
      if (highlight.start > lastIndex) {
        parts.push({ text: text.substring(lastIndex, highlight.start) });
      }
      parts.push({
        text: text.substring(highlight.start, highlight.end),
        highlight: highlight.type,
      });
      lastIndex = highlight.end;
    });
    
    if (lastIndex < text.length) {
      parts.push({ text: text.substring(lastIndex) });
    }
    
    return (
      <span>
        {parts.map((part, idx) => {
          if (part.highlight === 'schedule') {
            return (
              <span
                key={idx}
                className="bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1 rounded border-b border-amber-500/50 font-medium"
              >
                {part.text}
              </span>
            );
          } else if (part.highlight === 'todo') {
            return (
              <span
                key={idx}
                className="bg-blue-500/20 text-blue-600 dark:text-blue-400 px-1 rounded border-b border-blue-500/50 font-medium"
              >
                {part.text}
              </span>
            );
          }
          return <span key={idx} className="text-foreground">{part.text}</span>;
        })}
      </span>
    );
  };

  // 生成智能纪要（按时间分段）- 去除标记，但保留高亮功能
  const chapters = segments
    .filter(s => !s.isInterim)
    .reduce((acc, segment) => {
      const text = segment.optimizedText || segment.rawText;
      if (text && text.trim().length > 0) {
        // 去除 [SCHEDULE:...] 和 [TODO:...] 标记，只保留纯文本
        const cleanText = text
          .replace(/\[SCHEDULE:\s*([^\]]+)\]/g, '$1')
          .replace(/\[TODO:\s*([^|]+)(?:\|[^\]]+)?\]/g, '$1');
        
        const timeInSeconds = segment.audioStart ? segment.audioStart / 1000 : 0;
        const hours = Math.floor(timeInSeconds / 3600);
        const mins = Math.floor((timeInSeconds % 3600) / 60);
        const secs = Math.floor(timeInSeconds % 60);
        const timeStr = hours > 0
          ? `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
          : `${mins}:${secs.toString().padStart(2, "0")}`;

        acc.push({
          id: segment.id,
          time: timeStr,
          text: cleanText, // 显示去除标记后的纯文本
          segment,
        });
      }
      return acc;
    }, [] as Array<{ id: string; time: string; text: string; segment: TranscriptSegment }>);

  return (
    <div className="flex-1 overflow-y-auto min-h-0">
      {/* 智能纪要摘要 */}
      {summaryText && (
        <div className="space-y-3 mb-4">
          <div className="flex items-center justify-between px-0 py-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <ThumbsUp className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">智能纪要</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExpandedSections({ ...expandedSections, summary: !expandedSections.summary })}
              className="p-1 rounded hover:bg-muted transition-colors"
              aria-label={expandedSections.summary ? "收起" : "展开"}
            >
              {expandedSections.summary ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
          {expandedSections.summary && (
            <div className="pt-1">
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {summaryText}
              </p>
            </div>
          )}
        </div>
      )}
      
      {/* 分割线 - 智能纪要和待办事项之间的分隔 */}
      {(todos.length > 0 || schedules.length > 0) && (
        <div className="border-t border-border/50 my-4" />
      )}

      {/* 待办事项 - 显示已加入的待办和日程（参考智能纪要的列表样式） */}
      {(todos.length > 0 || schedules.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-0 py-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-semibold">待办事项</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setExpandedSections({ ...expandedSections, todos: !expandedSections.todos })}
              className="p-1 rounded hover:bg-muted transition-colors"
              aria-label={expandedSections.todos ? "收起" : "展开"}
            >
              {expandedSections.todos ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
          </div>
          {expandedSections.todos && (
            <div className="pt-1 space-y-3 max-h-[400px] overflow-y-auto">
              {todos.length === 0 && schedules.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">
                  暂无待办事项
                </div>
              ) : (
                <div className="space-y-2">
                  {todos.map((todo) => {
                    const segment = segments.find(s => s.id === todo.sourceSegmentId);
                    const timeInSeconds = segment?.audioStart ? segment.audioStart / 1000 : 0;
                    const hours = Math.floor(timeInSeconds / 3600);
                    const mins = Math.floor((timeInSeconds % 3600) / 60);
                    const secs = Math.floor(timeInSeconds % 60);
                    const timeStr = hours > 0
                      ? `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
                      : `${mins}:${secs.toString().padStart(2, "0")}`;

                    return (
                      <div
                        key={todo.id}
                        className="group relative py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => segment && onSegmentClick?.(segment)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            <div className="w-4 h-4 rounded border-2 border-primary bg-primary/10 flex items-center justify-center">
                              <CheckCircle2 className="h-2.5 w-2.5 text-primary" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="text-xs font-mono text-muted-foreground">
                              {timeStr}
                            </div>
                            <p className="text-sm text-foreground leading-relaxed">{todo.title}</p>
                            {todo.description && (
                              <p className="text-xs text-muted-foreground leading-relaxed">
                                {todo.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {schedules.map((schedule) => {
                    const segment = segments.find(s => s.id === schedule.sourceSegmentId);
                    
                    // 格式化日期时间（如：2025/12/25 07:00）
                    const scheduleDateTime = schedule.scheduleTime.toLocaleString("zh-CN", {
                      year: "numeric",
                      month: "2-digit",
                      day: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).replace(/\//g, '/');

                    return (
                      <div
                        key={schedule.id}
                        className="group relative py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                        onClick={() => segment && onSegmentClick?.(segment)}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-shrink-0 mt-0.5">
                            <div className="w-4 h-4 rounded border-2 border-amber-500 bg-amber-500/10 flex items-center justify-center">
                              <Clock className="h-2.5 w-2.5 text-amber-500" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0 space-y-1.5">
                            <div className="text-xs font-mono text-muted-foreground">
                              {scheduleDateTime}
                            </div>
                            <p className="text-sm text-foreground leading-relaxed">{schedule.description}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

