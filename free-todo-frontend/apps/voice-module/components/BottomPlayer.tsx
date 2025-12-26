/**
 * 底部播放器组件（参考通义听悟）
 * 一行式播放器，包含播放控制、进度条、时间、速度等
 */

import { Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";

interface BottomPlayerProps {
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

export function BottomPlayer({
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
}: BottomPlayerProps) {
  const progressRef = useRef<HTMLDivElement>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(externalSpeed || 1);
  const [isHovering, setIsHovering] = useState(false);

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

  // 处理进度条点击
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    onSeek(newTime);
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    onSpeedChange?.(speed);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="shrink-0 border-t border-border/50 bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-4 px-6 py-3">
        {/* 播放控制 */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSkip(-15)}
            className={cn(
              "p-1.5 rounded-md hover:bg-muted transition-colors",
              "text-muted-foreground hover:text-foreground",
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
              "p-2 rounded-full transition-all",
              "bg-primary text-primary-foreground",
              "hover:bg-primary/90 shadow-md hover:shadow-lg",
              "flex items-center justify-center",
              !audioUrl && "opacity-50 cursor-not-allowed"
            )}
            disabled={!audioUrl}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 ml-0.5" />
            )}
          </button>

          <button
            onClick={() => onSkip(15)}
            className={cn(
              "p-1.5 rounded-md hover:bg-muted transition-colors",
              "text-muted-foreground hover:text-foreground",
              !audioUrl && "opacity-50 cursor-not-allowed"
            )}
            disabled={!audioUrl}
            title="前进15秒"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {/* 进度条 */}
        <div className="flex-1 flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono min-w-[2.5rem] text-right">
            {formatTime(currentTime)}
          </span>
          
          <div
            ref={progressRef}
            className="flex-1 h-1.5 bg-muted rounded-full cursor-pointer relative group"
            onClick={handleProgressClick}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            <div className="absolute inset-0 bg-muted rounded-full" />
            <div
              className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
            {/* 进度指示点 */}
            {isHovering && (
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full shadow-md border-2 border-background"
                style={{ left: `calc(${progress}% - 6px)` }}
              />
            )}
          </div>

          <span className="text-xs text-muted-foreground font-mono min-w-[2.5rem]">
            {formatTime(duration)}
          </span>
        </div>

        {/* 播放速度和音量 */}
        <div className="flex items-center gap-2">
          {/* 播放速度 */}
          <select
            value={playbackSpeed}
            onChange={(e) => handleSpeedChange(Number(e.target.value))}
            className={cn(
              "px-2 py-1 text-xs rounded-md border border-border/50",
              "bg-background text-foreground",
              "hover:bg-muted/50 transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-primary/20"
            )}
          >
            <option value={0.5}>0.5x</option>
            <option value={0.75}>0.75x</option>
            <option value={1}>1x</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>

          {/* 音量 */}
          <button
            className={cn(
              "p-1.5 rounded-md hover:bg-muted transition-colors",
              "text-muted-foreground hover:text-foreground"
            )}
            title="音量"
          >
            <Volume2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

