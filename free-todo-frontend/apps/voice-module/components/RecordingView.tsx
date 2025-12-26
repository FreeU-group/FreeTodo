/**
 * 录音视图组件
 * 显示录音状态、发言人信息、转录文本等
 */

import { AlertCircle, Mic, Pause, Play, Square, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "../types";
import { AudioSphere } from "./AudioSphere";
import { useEffect, useRef } from "react";

interface RecordingViewProps {
  isRecording: boolean;
  isPaused?: boolean; // 是否暂停
  recordingDuration: number; // 录音时长（秒）
  maxDuration?: number; // 最大录音时长（秒），默认6小时
  segments: TranscriptSegment[];
  currentSpeaker?: string;
  onSpeakerChange?: (speaker: string) => void;
  onSegmentClick?: (segment: TranscriptSegment) => void;
  highlightedSegmentId?: string;
  warningMessage?: string;
  onPause?: () => void;
  onResume?: () => void; // 恢复录音
  onStop?: () => void;
  audioLevel?: number; // 音频电平（0-100）
  analyser?: AnalyserNode | null; // 音频分析器节点
  schedules?: import('../types').ScheduleItem[]; // 日程列表，用于高亮
  todos?: import('../services/TodoExtractionService').ExtractedTodo[]; // 待办列表，用于高亮
}

export function RecordingView({
  isRecording,
  isPaused = false,
  recordingDuration,
  maxDuration = 6 * 3600, // 默认6小时
  segments,
  currentSpeaker,
  onSpeakerChange,
  onSegmentClick,
  highlightedSegmentId,
  warningMessage,
  onPause,
  onResume,
  onStop,
  audioLevel = 0,
  analyser,
  schedules = [],
  todos = [],
}: RecordingViewProps) {
  // 格式化时间显示
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatMaxTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // 包含临时片段（用于实时显示）
  const validSegments = segments.filter(s => {
    // 如果是临时结果，只要有文本就显示
    if (s.isInterim) {
      return (s.interimText || s.rawText || '').trim().length > 0;
    }
    // 非临时结果需要有文本
    return s.rawText && s.rawText.trim().length > 0;
  });

  // 自动滚动到底部
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [validSegments]);

  // 渲染高亮文本（高亮标记格式和提取的日程/待办文字）
  const renderOptimizedText = (text: string, segmentId: string) => {
    // 获取该segment的所有日程和待办
    const segmentSchedules = schedules.filter(s => s.sourceSegmentId === segmentId);
    const segmentTodos = todos.filter(t => t.sourceSegmentId === segmentId);
    
    // 合并所有需要高亮的位置（包括标记格式和提取的文字）
    const highlights: Array<{ start: number; end: number; type: 'schedule' | 'todo' }> = [];
    
    // 1. 先处理标记格式 [SCHEDULE:...] 和 [TODO:...]
    const schedulePattern = /\[SCHEDULE:\s*([^\]]+)\]/g;
    const todoPattern = /\[TODO:\s*([^|]+)(?:\|[^\]]+)?\]/g;
    
    let match;
    while ((match = schedulePattern.exec(text)) !== null) {
      highlights.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'schedule',
      });
    }
    
    while ((match = todoPattern.exec(text)) !== null) {
      highlights.push({
        start: match.index,
        end: match.index + match[0].length,
        type: 'todo',
      });
    }
    
    // 2. 处理提取的日程和待办文字（在去除标记后的文本中匹配）
    const textWithoutTags = text
      .replace(/\[SCHEDULE:\s*([^\]]+)\]/g, '$1')
      .replace(/\[TODO:\s*([^|]+)(?:\|[^\]]+)?\]/g, '$1');
    
    segmentSchedules.forEach(schedule => {
      if (schedule.description) {
        const description = schedule.description.trim();
        if (description.length < 2) return;
        
        // 在去除标记后的文本中查找
        const lowerText = textWithoutTags.toLowerCase();
        const lowerDesc = description.toLowerCase();
        let index = lowerText.indexOf(lowerDesc);
        
        if (index !== -1) {
          // 需要找到在原始文本中的位置
          let originalIndex = 0;
          let cleanIndex = 0;
          for (let i = 0; i < text.length && cleanIndex < index; i++) {
            // 跳过标记
            if (text.substring(i).match(/^\[SCHEDULE:|^\[TODO:/)) {
              const tagMatch = text.substring(i).match(/^\[(?:SCHEDULE|TODO):[^\]]*\]/);
              if (tagMatch) {
                i += tagMatch[0].length - 1;
                continue;
              }
            }
            cleanIndex++;
            originalIndex = i;
          }
          
          highlights.push({
            start: originalIndex,
            end: Math.min(originalIndex + description.length, text.length),
            type: 'schedule',
          });
        }
      }
    });
    
    segmentTodos.forEach(todo => {
      if (todo.title) {
        const title = todo.title.trim();
        if (title.length < 2) return;
        
        const lowerText = textWithoutTags.toLowerCase();
        const lowerTitle = title.toLowerCase();
        const index = lowerText.indexOf(lowerTitle);
        
        if (index !== -1) {
          // 需要找到在原始文本中的位置
          let originalIndex = 0;
          let cleanIndex = 0;
          for (let i = 0; i < text.length && cleanIndex < index; i++) {
            // 跳过标记
            if (text.substring(i).match(/^\[SCHEDULE:|^\[TODO:/)) {
              const tagMatch = text.substring(i).match(/^\[(?:SCHEDULE|TODO):[^\]]*\]/);
              if (tagMatch) {
                i += tagMatch[0].length - 1;
                continue;
              }
            }
            cleanIndex++;
            originalIndex = i;
          }
          
          highlights.push({
            start: originalIndex,
            end: Math.min(originalIndex + title.length, text.length),
            type: 'todo',
          });
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

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* 发言人信息栏 */}
      <div className="shrink-0 px-6 py-4 border-b border-border/50 bg-muted/30">
        <div className="flex items-center gap-4">
          {/* 发言人图标 */}
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center border-2 border-primary/30">
              <User className="w-6 h-6 text-primary" />
            </div>
            {isRecording && (
              <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full border-2 border-background animate-pulse" />
            )}
          </div>

          {/* 发言人信息 */}
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-foreground">发言人</span>
              <span className="text-xs text-muted-foreground font-mono">
                {formatTime(recordingDuration)}
              </span>
            </div>
            {currentSpeaker && (
              <input
                type="text"
                value={currentSpeaker}
                onChange={(e) => onSpeakerChange?.(e.target.value)}
                className="text-sm text-foreground bg-transparent border-none outline-none focus:ring-0 p-0"
                placeholder="点击编辑发言人"
                disabled={!isRecording}
              />
            )}
          </div>

          {/* 提示信息 */}
          {isRecording && (
            <div className="px-3 py-2 bg-primary/10 rounded-lg border border-primary/20 flex items-center gap-2 text-xs text-primary">
              <span>点击发言人可编辑，录音结束可智能区分发言人</span>
              <button className="text-primary/60 hover:text-primary">
                ×
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 转录文本区域 */}
      <div className="flex-1 overflow-y-auto p-6">
        {validSegments.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            {isRecording ? (
              <>
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4 animate-pulse">
                  <Mic className="w-8 h-8 text-primary" />
                </div>
                <p className="text-sm">正在录音，等待语音输入...</p>
              </>
            ) : (
              <p className="text-sm">暂无转录内容</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {validSegments.map((segment) => {
              const isHighlighted = segment.id === highlightedSegmentId;
              // 临时结果优先显示 interimText，否则显示 rawText
              const text = segment.isInterim 
                ? (segment.interimText || segment.rawText || "")
                : (segment.rawText || "");
              const segmentTime = segment.audioStart ? segment.audioStart / 1000 : 0;

              return (
                <div
                  key={segment.id}
                  className={cn(
                    "p-4 rounded-lg border transition-all cursor-pointer",
                    "hover:bg-muted/50",
                    isHighlighted
                      ? "bg-primary/10 border-primary/50 shadow-md"
                      : segment.isInterim
                      ? "bg-muted/30 border-muted/50" // 临时结果使用不同的样式
                      : "bg-background border-border/50"
                  )}
                  onClick={() => onSegmentClick?.(segment)}
                >
                  {/* 时间戳和发言人 */}
                  <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                    {currentSpeaker && (
                      <span className="px-2 py-0.5 bg-primary/10 text-primary rounded">
                        {currentSpeaker}
                      </span>
                    )}
                    {segment.isInterim && (
                      <span className="inline-flex items-center gap-1 text-xs text-primary/70">
                        <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                        </svg>
                        <span>正在识别...</span>
                      </span>
                    )}
                    <span className="font-mono">
                      {formatTime(segmentTime)}
                    </span>
                  </div>

                  {/* 文本内容 */}
                  {segment.isInterim ? (
                    <p className={cn(
                      "leading-relaxed whitespace-pre-wrap text-muted-foreground/60 italic"
                    )}>
                      {text}
                    </p>
                  ) : segment.isOptimized ? (
                    <div className="leading-relaxed whitespace-pre-wrap">
                      {renderOptimizedText(segment.optimizedText || segment.rawText || '', segment.id)}
                    </div>
                  ) : (
                    <p className="leading-relaxed whitespace-pre-wrap text-foreground">
                      {text}
                    </p>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* 警告提示 */}
      {warningMessage && (
        <div className="shrink-0 mx-6 mb-4 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700 dark:text-amber-300 flex-1">
            {warningMessage}
          </p>
        </div>
      )}

      {/* 底部录音控制栏 */}
      <div className="shrink-0 border-t border-border/50 bg-background/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-6 py-4">
          {/* 左侧：声波可视化圆球 */}
          <div className="flex items-center gap-4">
            {isRecording ? (
              <div className="flex-shrink-0">
                {/* 圆球声波可视化组件 */}
                <AudioSphere
                  analyser={analyser || null}
                  isRecording={isRecording}
                  size={64}
                />
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/20 to-primary/40 flex items-center justify-center border-2 border-primary/30">
                <Mic className="w-6 h-6 text-primary" />
              </div>
            )}

            {/* 录音状态文字 */}
            <div className="flex flex-col gap-1">
              <span className={cn(
                "text-base font-semibold",
                isRecording ? "text-primary" : "text-muted-foreground"
              )}>
                {isRecording ? "录音中..." : "未开始录音"}
              </span>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="font-mono font-medium">{formatTime(recordingDuration)}</span>
                <span className="text-muted-foreground/50">/</span>
                <span className="font-mono">{formatMaxTime(maxDuration)}</span>
              </div>
            </div>
          </div>

          {/* 右侧：控制按钮 */}
          {isRecording && (
            <div className="flex items-center gap-3">
              {isPaused ? (
                // 暂停状态：显示恢复按钮
                onResume && (
                  <button
                    onClick={onResume}
                    className={cn(
                      "px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
                      "bg-amber-500 hover:bg-amber-600",
                      "text-white shadow-md hover:shadow-lg",
                      "flex items-center gap-2",
                      "active:scale-95"
                    )}
                    title="恢复录音"
                  >
                    <Play className="w-4 h-4" />
                    恢复
                  </button>
                )
              ) : (
                // 录音中：显示暂停按钮
                onPause && (
                  <button
                    onClick={onPause}
                    className={cn(
                      "px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
                      "bg-background hover:bg-muted",
                      "text-foreground border border-border",
                      "flex items-center gap-2 shadow-sm hover:shadow-md",
                      "active:scale-95"
                    )}
                    title="暂停"
                  >
                    <Pause className="w-4 h-4" />
                    暂停
                  </button>
                )
              )}
              {onStop && (
                <button
                  onClick={onStop}
                  className={cn(
                    "px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
                    "bg-red-500 hover:bg-red-600",
                    "text-white shadow-md hover:shadow-lg",
                    "flex items-center gap-2",
                    "active:scale-95"
                  )}
                  title="停止录音"
                >
                  <Square className="w-4 h-4" />
                  停止
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

