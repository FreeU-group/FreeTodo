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

  const renderOptimizedText = (text: string, isSchedule: boolean) => {
    if (!isSchedule) return <span className="text-foreground">{text}</span>;
    const parts = text.split(/(\[SCHEDULE:.*?\])/g);
    return (
      <span>
        {parts.map((part, idx) => {
          if (part.startsWith('[SCHEDULE:') && part.endsWith(']')) {
            const content = part.replace('[SCHEDULE:', '').replace(']', '').trim();
            return (
              <span key={idx} className="bg-amber-500/20 text-amber-600 dark:text-amber-400 px-1 rounded border-b border-amber-500/50 font-medium animate-pulse">
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
    <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono text-sm relative">
       {segments.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-50">
            <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            <p>准备转录...</p>
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
                segment.segmentId,
                segment.absoluteStart ? segment.absoluteStart.getTime() : undefined
              )
            }
            className={`flex gap-3 group animate-in fade-in slide-in-from-bottom-2 duration-300 p-2 rounded-lg transition-colors
                ${isRecording ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer hover:bg-muted/30'}
            `}
        >
          <div className="flex-shrink-0 w-20 text-xs text-muted-foreground pt-1 border-r border-border pr-2 text-right">
            {formatTime(segment.timestamp)}
          </div>
          <div className="flex-1 pt-0.5">
            {segment.isInterim ? (
              // 临时结果：显示灰色斜体，带闪烁动画
              <div className="text-muted-foreground/60 italic animate-pulse">
                {segment.interimText || segment.rawText}
                <span className="inline-block w-1.5 h-1.5 bg-primary rounded-full animate-bounce ml-1"></span>
              </div>
            ) : segment.isOptimized ? (
              // 已优化：显示优化后的文本
              <div className="leading-relaxed">
                {renderOptimizedText(segment.optimizedText || segment.rawText, segment.containsSchedule)}
              </div>
            ) : (
              // 原始结果：显示原始文本，带处理中动画
              <div className="text-muted-foreground italic">
                {segment.rawText} <span className="inline-block w-1.5 h-1.5 bg-primary rounded-full animate-bounce ml-1"></span>
              </div>
            )}
            
            {!isRecording && (
                <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-primary">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    点击回放
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

