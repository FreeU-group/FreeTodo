/**
 * 会议播放器组件（参考通义听悟）
 * 左侧固定播放器，包含标题、日期、播放控制、进度条
 */

import { Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "../types";

interface MeetingPlayerProps {
  title?: string;
  date: Date;
  duration: number; // 总时长（秒）
  currentTime: number; // 当前播放时间（秒）
  isPlaying: boolean;
  audioUrl?: string;
  playbackSpeed?: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onSkip: (seconds: number) => void;
  onSpeedChange?: (speed: number) => void;
}

export function MeetingPlayer({
  title,
  date,
  duration,
  currentTime,
  isPlaying,
  audioUrl,
  playbackSpeed: externalSpeed,
  onPlay,
  onPause,
  onSeek,
  onSkip,
  onSpeedChange,
}: MeetingPlayerProps) {
  const progressRef = useRef<HTMLDivElement>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(externalSpeed || 1);

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    onSpeedChange?.(speed);
  };

  // 格式化时间显示
  const formatTime = (seconds: number): string => {
    // 检查是否为有效数字
    if (!Number.isFinite(seconds) || isNaN(seconds) || seconds < 0) {
      return "0:00";
    }
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

  // 处理进度条点击
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    onSeek(newTime);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col h-full bg-background border-r border-border/50">
      {/* 顶部：标题和日期 */}
      <div className="p-6 border-b border-border/50">
        {title && (
          <h2 className="text-lg font-semibold text-foreground mb-2 line-clamp-2">
            {title}
          </h2>
        )}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>{formatDate(date)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* 中间：播放器 */}
      <div className="flex-1 flex flex-col items-center justify-center p-8">
        {/* 大播放按钮 */}
        <button
          onClick={isPlaying ? onPause : onPlay}
          className={cn(
            "w-24 h-24 rounded-full transition-all mb-8",
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90 shadow-lg hover:shadow-xl",
            "flex items-center justify-center",
            !audioUrl && "opacity-50 cursor-not-allowed"
          )}
          disabled={!audioUrl}
        >
          {isPlaying ? (
            <Pause className="w-10 h-10 ml-1" />
          ) : (
            <Play className="w-10 h-10 ml-1" />
          )}
        </button>

        {/* 进度条 */}
        <div className="w-full space-y-2">
          <div
            ref={progressRef}
            className="w-full h-2 bg-muted rounded-full cursor-pointer relative group"
            onClick={handleProgressClick}
          >
            <div className="absolute inset-0 bg-muted rounded-full" />
            <div
              className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
            {/* 进度指示点 */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `calc(${progress}% - 8px)` }}
            />
          </div>

          {/* 时间显示 */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* 播放控制 */}
        <div className="flex items-center gap-4 mt-6">
          <button
            onClick={() => onSkip(-15)}
            className={cn(
              "p-2 rounded-md hover:bg-muted transition-colors",
              "text-muted-foreground hover:text-foreground"
            )}
            title="后退15秒"
          >
            <SkipBack className="w-5 h-5" />
          </button>

          <button
            onClick={() => onSkip(15)}
            className={cn(
              "p-2 rounded-md hover:bg-muted transition-colors",
              "text-muted-foreground hover:text-foreground"
            )}
            title="前进15秒"
          >
            <SkipForward className="w-5 h-5" />
          </button>

          {/* 播放速度 */}
          <select
            value={playbackSpeed}
            onChange={(e) => handleSpeedChange(Number(e.target.value))}
            className={cn(
              "px-2 py-1 text-xs rounded-md",
              "bg-muted/50 border border-border/50",
              "text-foreground"
            )}
          >
            <option value={0.5}>0.5x</option>
            <option value={0.75}>0.75x</option>
            <option value={1}>1x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>

          <button
            className={cn(
              "p-2 rounded-md hover:bg-muted transition-colors",
              "text-muted-foreground hover:text-foreground"
            )}
            title="音量"
          >
            <Volume2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

