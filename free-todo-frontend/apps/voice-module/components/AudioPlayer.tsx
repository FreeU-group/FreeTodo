/**
 * 音频播放器组件
 * 用于回看模式，支持播放、进度调整、时间显示
 */

import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "../types";

interface AudioPlayerProps {
  audioUrl?: string;
  segments?: TranscriptSegment[]; // 用于显示小节信息
  currentTime?: number; // 当前播放时间（秒）
  duration?: number; // 总时长（秒）
  isPlaying?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
  onSeek?: (time: number) => void;
  onSegmentHover?: (segment: TranscriptSegment | null) => void; // 鼠标悬停时显示小节
}

export function AudioPlayer({
  audioUrl,
  segments = [],
  currentTime = 0,
  duration = 0,
  isPlaying = false,
  onPlay,
  onPause,
  onSeek,
  onSegmentHover,
}: AudioPlayerProps) {
  const progressRef = useRef<HTMLDivElement>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  // 格式化时间显示
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // 处理进度条点击
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * duration;
    onSeek?.(newTime);
  };

  // 处理鼠标移动（显示悬停时间）
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, x / rect.width));
    const time = percentage * duration;
    setHoverTime(time);

    // 找到对应的小节
    if (segments.length > 0 && onSegmentHover) {
      const segment = segments.find(
        (s) => s.audioStart <= time * 1000 && s.audioEnd >= time * 1000
      );
      onSegmentHover(segment || null);
    }
  };

  // 处理鼠标离开
  const handleMouseLeave = () => {
    setHoverTime(null);
    onSegmentHover?.(null);
  };

  // 快进/快退
  const handleSkip = (seconds: number) => {
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    onSeek?.(newTime);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex flex-col gap-3 p-4 bg-muted/30 rounded-lg border border-border/50">
      {/* 播放控制 */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => handleSkip(-10)}
          className={cn(
            "p-2 rounded-full hover:bg-muted transition-colors",
            "text-muted-foreground hover:text-foreground"
          )}
          title="后退10秒"
        >
          <SkipBack className="w-5 h-5" />
        </button>

        <button
          onClick={isPlaying ? onPause : onPlay}
          className={cn(
            "p-3 rounded-full transition-all",
            "bg-primary text-primary-foreground",
            "hover:bg-primary/90 shadow-md hover:shadow-lg"
          )}
        >
          {isPlaying ? (
            <Pause className="w-6 h-6" />
          ) : (
            <Play className="w-6 h-6 ml-0.5" />
          )}
        </button>

        <button
          onClick={() => handleSkip(10)}
          className={cn(
            "p-2 rounded-full hover:bg-muted transition-colors",
            "text-muted-foreground hover:text-foreground"
          )}
          title="前进10秒"
        >
          <SkipForward className="w-5 h-5" />
        </button>
      </div>

      {/* 进度条 */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground font-mono min-w-[40px]">
          {formatTime(currentTime)}
        </span>

        <div
          ref={progressRef}
          className="flex-1 h-2 bg-muted rounded-full cursor-pointer relative group"
          onClick={handleProgressClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {/* 进度条背景 */}
          <div className="absolute inset-0 bg-muted rounded-full" />

          {/* 已播放进度 */}
          <div
            className="absolute left-0 top-0 h-full bg-primary rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />

          {/* 悬停指示器 */}
          {hoverTime !== null && (
            <div
              className="absolute top-0 h-full w-0.5 bg-primary/50"
              style={{ left: `${(hoverTime / duration) * 100}%` }}
            />
          )}

          {/* 悬停时间提示 */}
          {hoverTime !== null && (
            <div
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-foreground text-background text-xs rounded shadow-lg pointer-events-none"
              style={{ left: `${(hoverTime / duration) * 100}%` }}
            >
              {formatTime(hoverTime)}
            </div>
          )}
        </div>

        <span className="text-xs text-muted-foreground font-mono min-w-[40px]">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

