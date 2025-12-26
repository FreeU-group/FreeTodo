"use client";

import React, { useEffect, useRef } from 'react';
import { TranscriptSegment } from '../types';

interface TranscriptionLogProps {
  segments: TranscriptSegment[];
  onSegmentClick: (
    start: number,
    end: number,
    segmentId?: string,
    absoluteStartMs?: number
  ) => void;
  isRecording?: boolean;
}

const TranscriptionLog: React.FC<TranscriptionLogProps> = ({ segments, onSegmentClick, isRecording }) => {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [segments]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const renderOptimizedText = (text: string, containsSchedule: boolean) => {
    // 参考代码：直接匹配 [SCHEDULE:...] 格式
    if (!containsSchedule) return <span className="text-foreground">{text}</span>;
    const parts = text.split(/(\[SCHEDULE:.*?\])/g);
    return (
      <span>
        {parts.map((part, idx) => {
          if (part.startsWith('[SCHEDULE:') && part.endsWith(']')) {
            const content = part.replace('[SCHEDULE:', '').replace(']', '').trim();
            return (
              <span
                key={idx}
                className="bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1 rounded border-b border-amber-500/50 font-medium"
              >
                {content}
              </span>
            );
          }
          return <span key={idx} className="text-foreground">{part}</span>;
        })}
      </span>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-sm relative">
       {segments.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <p className="text-sm font-medium">准备转录...</p>
            <p className="text-xs mt-1 opacity-70">开始说话即可实时转录</p>
        </div>
       )}

      {segments.map((segment) => (
        <div 
            key={segment.id} 
            onClick={() =>
              !isRecording &&
              onSegmentClick(
                segment.audioStart,
                segment.audioEnd,
                segment.id, // 传递 transcript.id 而不是 segmentId
                segment.absoluteStart ? segment.absoluteStart.getTime() : undefined
              )
            }
            className={`flex gap-3 group animate-in fade-in slide-in-from-bottom-2 duration-300 p-3 rounded-lg transition-all border
                ${isRecording ? 'opacity-70 cursor-not-allowed border-transparent' : 'cursor-pointer hover:bg-muted/40 hover:shadow-sm border-transparent hover:border-border/50'}
                ${segment.containsSchedule ? 'bg-amber-500/5 border-amber-500/20' : ''}
                ${segment.containsTodo ? 'bg-blue-500/5 border-blue-500/20' : ''}
                ${segment.containsSchedule && segment.containsTodo ? 'bg-gradient-to-r from-amber-500/5 to-blue-500/5 border-amber-500/20' : ''}
            `}
        >
          <div className="flex-shrink-0 w-20 text-xs text-muted-foreground pt-1 border-r border-border pr-2 text-right">
            {formatTime(segment.timestamp)}
          </div>
          <div className="flex-1 pt-0.5">
            {segment.isInterim ? (
              // ⚡ 飞书式临时结果：显示灰色斜体，带识别中状态，实时更新
              <div className="text-muted-foreground/60 italic">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 text-xs text-primary/70">
                    <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                    </svg>
                    <span>正在识别...</span>
                  </span>
                </div>
                {/* ⚡ 飞书式：临时文本直接显示，不闪烁，流畅更新 */}
                <div className="mt-1 transition-all duration-150">
                  {segment.interimText || segment.rawText || ''}
                </div>
              </div>
            ) : segment.isOptimized ? (
              // 已优化：显示优化后的文本，带提取结果展示
              <div className="leading-relaxed">
                {renderOptimizedText(segment.optimizedText || segment.rawText, segment.containsSchedule || false)}
                <div className="flex flex-wrap items-center gap-2 mt-2">
                  {segment.containsSchedule && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400 border border-amber-500/20">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="font-medium">已提取日程</span>
                    </span>
                  )}
                  {segment.containsTodo && (
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-blue-500/10 text-xs text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span className="font-medium">已提取待办</span>
                    </span>
                  )}
                </div>
              </div>
            ) : (
              // 原始结果：显示原始文本，带优化中状态
              <div className="text-muted-foreground">
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-flex items-center gap-1 text-xs text-blue-500/70">
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <span>优化中...</span>
                  </span>
                </div>
                <div className="italic">
                  {segment.rawText}
                </div>
              </div>
            )}
            
            {!isRecording && (
                <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-2">
                      {segment.audioFileId && segment.uploadStatus === 'uploaded' ? (
                        <span className="text-green-600 dark:text-green-400 flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-medium">音频已就绪</span>
                        </span>
                      ) : segment.uploadStatus === 'uploading' ? (
                        <span className="text-blue-600 dark:text-blue-400 flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20">
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span className="font-medium">上传中...</span>
                        </span>
                      ) : segment.uploadStatus === 'failed' ? (
                        <span className="text-red-600 dark:text-red-400 flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/10 border border-red-500/20">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-medium">上传失败</span>
                        </span>
                      ) : (
                        <span className="text-primary flex items-center gap-1 px-2 py-0.5 rounded bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors cursor-pointer">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="font-medium">点击回放</span>
                        </span>
                      )}
                    </div>
                    {/* 显示提取状态 */}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
                      {segment.containsSchedule && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          已关联日程
                        </span>
                      )}
                      {segment.containsTodo && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          已关联待办
                        </span>
                      )}
                    </div>
                </div>
            )}
          </div>
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default TranscriptionLog;

