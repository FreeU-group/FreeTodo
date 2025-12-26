/**
 * 紧凑型播放器组件（参考通义听悟）
 * 左侧不独占的播放器，包含播放控制和进度条
 */

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useState, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { SpeedSelector } from "./SpeedSelector";
import { AudioFileSelector } from "./AudioFileSelector";
import type { AudioSegment } from "../types";

interface CompactPlayerProps {
  title?: string;
  date: Date;
  duration: number; // 总时长（秒）
  currentTime: number; // 当前播放时间（秒）
  isPlaying: boolean;
  audioUrl?: string;
  playbackSpeed?: number;
  hoveredSegment?: { time: string; text: string } | null; // 悬停时显示的小节信息
  audioSegments?: AudioSegment[]; // 音频文件列表
  selectedAudioId?: string; // 当前选中的音频ID
  onSelectAudio?: (audio: AudioSegment) => void; // 选择音频文件回调
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onSkip: (seconds: number) => void;
  onSpeedChange?: (speed: number) => void;
  onHoverTimeChange?: (time: number | null) => void; // 鼠标悬停时间变化回调
  getSegmentAtTime?: (time: number) => { time: string; text: string } | null; // 根据时间获取小节信息
}

export function CompactPlayer({
  title,
  date,
  duration,
  currentTime,
  isPlaying,
  audioUrl,
  playbackSpeed: externalSpeed,
  hoveredSegment,
  audioSegments = [],
  selectedAudioId,
  onSelectAudio,
  onPlay,
  onPause,
  onSeek,
  onSkip,
  onSpeedChange,
  onHoverTimeChange,
  getSegmentAtTime,
}: CompactPlayerProps) {
  const progressRef = useRef<HTMLDivElement>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(externalSpeed || 1);
  const [isHovering, setIsHovering] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverSegment, setHoverSegment] = useState<{ time: string; text: string } | null>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastHoverTimeRef = useRef<number | null>(null);

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

  // 格式化日期显示
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours();
    const minute = date.getMinutes();
    return `${year}年${month}月${day}日 ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  };

  // 处理进度条鼠标移动（计算悬停位置）- 使用节流避免频繁更新
  const handleProgressMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = percentage * duration;
    
    // 每次移动都更新 hoverTime（用于显示时间）
    setHoverTime(time);
    onHoverTimeChange?.(time);
    
    // 只有当时间变化超过0.2秒时才更新文本，避免频繁闪烁
    if (lastHoverTimeRef.current === null || Math.abs(time - lastHoverTimeRef.current) > 0.2) {
      lastHoverTimeRef.current = time;
      
      // 获取该时间点对应的小节信息（每次都要更新，确保文本变化）
      if (getSegmentAtTime) {
        const segment = getSegmentAtTime(time);
        setHoverSegment(segment);
      } else {
        // 如果没有 getSegmentAtTime，清空 hoverSegment
        setHoverSegment(null);
      }
    }
  }, [duration, onHoverTimeChange, getSegmentAtTime]);

  // 处理进度条点击
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const newTime = percentage * duration;
    onSeek(newTime);
    setHoverTime(null); // 点击后清除悬停状态
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    onSpeedChange?.(speed);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="relative flex flex-col gap-4 p-4 mb-8">
      <div className="relative z-10">
        {/* 标题和日期 */}
        <div className="mb-3 flex items-start justify-between gap-3">
          {title && (
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground mb-1.5 line-clamp-1 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {title}
              </h3>
              <p className="text-xs text-muted-foreground font-medium">{formatDate(date)}</p>
            </div>
          )}
          {/* 音频文件选择器 */}
          {audioSegments.length > 1 && onSelectAudio && (
            <AudioFileSelector
              audioSegments={audioSegments}
              selectedAudioId={selectedAudioId}
              onSelectAudio={onSelectAudio}
            />
          )}
        </div>

        {/* 播放控制 */}
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => onSkip(-15)}
            className={cn(
              "p-2 rounded-lg transition-all duration-200",
              "bg-muted/50 hover:bg-muted border border-border/30",
              "text-muted-foreground hover:text-foreground",
              "hover:shadow-md active:scale-95",
              !audioUrl && "opacity-50 cursor-not-allowed"
            )}
            disabled={!audioUrl}
            title="后退15秒"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            onClick={isPlaying ? onPause : onPlay}
            className={cn(
              "p-3 rounded-full transition-all duration-300",
              "bg-gradient-to-br from-primary to-primary/80 text-primary-foreground",
              "hover:from-primary/90 hover:to-primary/70",
              "shadow-lg hover:shadow-xl hover:scale-105",
              "flex items-center justify-center",
              "border border-primary/20",
              !audioUrl && "opacity-50 cursor-not-allowed"
            )}
            disabled={!audioUrl}
          >
            {isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </button>

          <button
            onClick={() => onSkip(15)}
            className={cn(
              "p-2 rounded-lg transition-all duration-200",
              "bg-muted/50 hover:bg-muted border border-border/30",
              "text-muted-foreground hover:text-foreground",
              "hover:shadow-md active:scale-95",
              !audioUrl && "opacity-50 cursor-not-allowed"
            )}
            disabled={!audioUrl}
            title="前进15秒"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {/* 播放速度 */}
          <div className="ml-auto">
            <SpeedSelector
              speed={playbackSpeed}
              onSpeedChange={handleSpeedChange}
            />
          </div>
        </div>

        {/* 进度条 */}
        <div className="space-y-2">
          {/* 时间显示和悬停提示 - 移到播放条上方 */}
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-mono font-semibold text-foreground">{formatTime(currentTime)}</span>
            {(hoveredSegment || hoverSegment) && !isHovering && (
              <div className="flex-1 mx-3 px-3 py-1.5 bg-muted/80 backdrop-blur-sm rounded-lg border border-border/50 text-xs text-foreground max-w-[250px] truncate shadow-sm">
                <span className="font-medium text-primary">{(hoveredSegment || hoverSegment)?.time}</span>
                <span className="mx-1.5 text-muted-foreground">•</span>
                <span className="truncate">{(hoveredSegment || hoverSegment)?.text}</span>
              </div>
            )}
            <span className="font-mono font-semibold text-muted-foreground">{formatTime(duration)}</span>
          </div>

          <div
            ref={progressRef}
            className="w-full h-2 bg-muted/50 rounded-full cursor-pointer relative group overflow-visible"
            onClick={handleProgressClick}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => {
              setIsHovering(false);
              setHoverTime(null);
              setHoverSegment(null);
              lastHoverTimeRef.current = null;
              onHoverTimeChange?.(null);
              if (hoverTimeoutRef.current) {
                clearTimeout(hoverTimeoutRef.current);
                hoverTimeoutRef.current = null;
              }
            }}
            onMouseMove={handleProgressMouseMove}
          >
            {/* 背景渐变 */}
            <div className="absolute inset-0 bg-gradient-to-r from-muted via-muted/80 to-muted rounded-full" />
            
            {/* 进度条 */}
            <div
              className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary via-primary/90 to-primary rounded-full transition-all duration-300 shadow-sm"
              style={{ width: `${progress}%` }}
            >
              {/* 进度条光泽效果 */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
            
            {/* 进度指示点 */}
            <div
              className={cn(
                "absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full shadow-lg border-2 border-background transition-all duration-200 z-10",
                isHovering ? "opacity-100 scale-110" : "opacity-0 scale-100"
              )}
              style={{ left: `calc(${progress}% - 8px)` }}
            />
            
            {/* 悬停时的预览指示点 */}
            {hoverTime !== null && isHovering && (
              <>
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary/60 rounded-full border border-primary/80 shadow-md z-20"
                  style={{ left: `calc(${(hoverTime / duration) * 100}% - 6px)` }}
                />
                {/* 悬停提示框 - 优先使用 hoverSegment（根据悬停时间动态获取），否则使用 hoveredSegment（当前播放位置） */}
                {(hoverSegment || hoveredSegment) && (
                  <div
                    className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-popover border border-border rounded-lg shadow-lg text-xs z-30 min-w-[200px] max-w-[300px] pointer-events-none"
                    style={{ 
                      left: `${(hoverTime / duration) * 100}%`,
                      transform: 'translateX(-50%)'
                    }}
                  >
                    <div className="font-mono font-semibold text-primary mb-1">
                      {formatTime(hoverTime)}
                    </div>
                    <div className="text-foreground line-clamp-2">
                      {/* 优先显示悬停时间对应的文本，如果没有则显示当前播放位置的文本 */}
                      {(hoverSegment || hoveredSegment)?.text || '暂无转录内容'}
                    </div>
                    {/* 小箭头 */}
                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
                      <div className="w-2 h-2 bg-popover border-r border-b border-border rotate-45"></div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

