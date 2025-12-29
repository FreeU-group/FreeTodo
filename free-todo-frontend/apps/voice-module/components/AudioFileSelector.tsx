/**
 * 音频文件选择器组件
 * 用于选择要播放的音频文件
 */

import { Music, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import type { AudioSegment } from "../types";

interface AudioFileSelectorProps {
  audioSegments: AudioSegment[];
  selectedAudioId?: string;
  onSelectAudio: (audio: AudioSegment) => void;
}

export function AudioFileSelector({
  audioSegments,
  selectedAudioId,
  onSelectAudio,
}: AudioFileSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [popupPosition, setPopupPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

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

  // 获取当前选中的音频
  const selectedAudio = audioSegments.find(a => a.id === selectedAudioId);

  // 点击外部关闭
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (event: MouseEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        const target = event.target as HTMLElement;
        if (!target.closest('[data-audio-selector-popup]')) {
          setIsOpen(false);
          setPopupPosition(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  if (audioSegments.length === 0) {
    return null;
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => {
          if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setPopupPosition({
              top: rect.bottom + window.scrollY + 8,
              left: rect.left + window.scrollX,
              width: rect.width,
            });
          }
          setIsOpen(!isOpen);
        }}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs",
          "bg-muted/50 hover:bg-muted transition-colors",
          "border border-border/50",
          "text-muted-foreground hover:text-foreground"
        )}
        title="选择音频文件"
      >
        <Music className="w-3.5 h-3.5" />
        <span className="truncate max-w-[120px]">
          {selectedAudio 
            ? `${formatTime(selectedAudio.startTime)} (${formatDuration(selectedAudio.duration)})`
            : `${audioSegments.length} 个音频`}
        </span>
        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", isOpen && "rotate-180")} />
      </button>

      {/* 下拉菜单 */}
      {isOpen && audioSegments.length > 0 && popupPosition && typeof window !== 'undefined' && createPortal(
        <div 
          data-audio-selector-popup
          className="fixed z-[9999] bg-background border border-border rounded-lg shadow-lg max-h-[400px] overflow-y-auto min-w-[280px]"
          style={{
            top: `${popupPosition.top}px`,
            left: `${popupPosition.left}px`,
            width: `${Math.max(popupPosition.width, 280)}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {audioSegments.map((audio) => (
            <button
              key={audio.id}
              onClick={() => {
                onSelectAudio(audio);
                setIsOpen(false);
                setPopupPosition(null);
              }}
              className={cn(
                "w-full px-4 py-3 text-left text-sm transition-colors border-b border-border/50 last:border-b-0",
                "hover:bg-muted/50",
                selectedAudioId === audio.id && "bg-primary/10 text-primary"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Music className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <span className="font-medium truncate">
                      {formatTime(audio.startTime)}
                    </span>
                    {selectedAudioId === audio.id && (
                      <span className="px-1.5 py-0.5 text-[10px] bg-primary/20 text-primary rounded">
                        当前
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground ml-6">
                    <span>时长: {formatDuration(audio.duration)}</span>
                    <span>•</span>
                    <span>{formatFileSize(audio.fileSize)}</span>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}





















