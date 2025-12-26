/**
 * 音频列表面板组件
 * 显示当前日期的所有音频文件列表
 */

import { ChevronDown, ChevronUp, Music, Play } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AudioSegment } from "../types";

interface AudioListPanelProps {
  audioSegments: AudioSegment[];
  selectedAudioId?: string;
  onSelectAudio: (audio: AudioSegment) => void;
}

export function AudioListPanel({
  audioSegments,
  selectedAudioId,
  onSelectAudio,
}: AudioListPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  // 格式化时间显示
  const formatTime = (date: Date): string => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  // 格式化时长显示
  const formatDuration = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (audioSegments.length === 0) {
    return null;
  }

  return (
    <div className="overflow-hidden">
      {/* 头部 - 与智能纪要保持一致 */}
      <div
        className="flex items-center justify-between px-0 py-3 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <Music className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">音频列表</span>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
          }}
          className="p-1 rounded hover:bg-muted transition-colors"
          aria-label={isExpanded ? "收起" : "展开"}
        >
          {isExpanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* 内容区域 */}
      {isExpanded && (
        <div className="pt-1 space-y-3 max-h-[400px] overflow-y-auto">
          {audioSegments.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              暂无音频文件
            </div>
          ) : (
            <div className="space-y-2">
              {audioSegments.map((audio) => {
                const isSelected = selectedAudioId === audio.id;
                
                return (
                  <div
                    key={audio.id}
                    className={cn(
                      "group relative py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer",
                      isSelected && "bg-primary/5"
                    )}
                    onClick={() => onSelectAudio(audio)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        <div className={cn(
                          "w-4 h-4 rounded border-2 flex items-center justify-center",
                          isSelected
                            ? "border-primary bg-primary/10"
                            : "border-muted-foreground/30 bg-muted/50"
                        )}>
                          <Music className={cn(
                            "h-2.5 w-2.5",
                            isSelected ? "text-primary" : "text-muted-foreground"
                          )} />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="text-xs font-mono text-muted-foreground">
                          {formatTime(audio.startTime)}
                          {isSelected && (
                            <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded font-medium">
                              当前
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>时长: {formatDuration(audio.duration)}</span>
                          <span>•</span>
                          <span>{formatFileSize(audio.fileSize)}</span>
                        </div>
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
  );
}



