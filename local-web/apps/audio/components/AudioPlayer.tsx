"use client";

import { Pause, Play } from "lucide-react";

interface AudioPlayerProps {
	title: string;
	date: string;
	currentTime?: string;
	totalTime?: string;
	isPlaying?: boolean;
	onPlay?: () => void;
	/** 当前进度，0~1 之间 */
	progress?: number;
	onSeek?: (ratio: number) => void;
	/** 当前段落文本（随点击文本同步） */
	currentSegmentText?: string;
	/** 播放倍速 */
	playbackRate?: number;
	/** 设置播放倍速 */
	onPlaybackRateChange?: (rate: number) => void;
}

export function AudioPlayer({
	title,
	date,
	currentTime = "0:00",
	totalTime = "0:00",
	isPlaying = false,
	onPlay,
	progress = 0,
	onSeek,
	currentSegmentText = "",
	playbackRate = 1.0,
	onPlaybackRateChange,
}: AudioPlayerProps) {
	const clampedProgress = Number.isFinite(progress) ? Math.min(Math.max(progress, 0), 1) : 0;

	return (
		<div className="px-4 py-2 flex items-center gap-3 border-t border-[oklch(var(--border))] bg-[oklch(var(--muted))]/30">
			<button
				type="button"
				className="p-1.5 rounded-full bg-[oklch(var(--primary))] text-white hover:opacity-60"
				onClick={onPlay}
			>
				{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
			</button>
			<div className="flex-1">
				<div className="text-xs font-medium">{title}</div>
				<div className="text-xs text-[oklch(var(--muted-foreground))]">{date}</div>
				{currentSegmentText ? (
					<div className="mt-1 text-xs text-[oklch(var(--foreground))] line-clamp-1">
						{currentSegmentText}
					</div>
				) : null}
				<div className="flex items-center gap-2 mt-1">
					<span className="text-xs text-[oklch(var(--muted-foreground))]">{currentTime}</span>
					<button
						type="button"
						aria-label="拖动进度条"
						disabled={!onSeek}
						className="relative flex-1 h-1.5 bg-[oklch(var(--muted))] rounded-full cursor-pointer group disabled:cursor-default"
						onClick={(e) => {
							if (!onSeek) return;
							const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
							const ratio = (e.clientX - rect.left) / rect.width;
							onSeek(Math.min(Math.max(ratio, 0), 1));
						}}
						onKeyDown={(e) => {
							if (!onSeek) return;
							if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
							e.preventDefault();
							const step = 0.05;
							onSeek(clampedProgress + (e.key === "ArrowRight" ? step : -step));
						}}
					>
						<div
							className="absolute left-0 top-0 h-full rounded-full bg-[oklch(var(--primary))] group-hover:bg-[oklch(var(--primary))/80] transition-colors"
							style={{ width: `${clampedProgress * 100}%` }}
						/>
					</button>
					<span className="text-xs text-[oklch(var(--muted-foreground))]">{totalTime}</span>
				</div>
			</div>
			<select
				value={playbackRate}
				onChange={(e) => {
					const rate = parseFloat(e.target.value);
					if (onPlaybackRateChange) {
						onPlaybackRateChange(rate);
					}
				}}
				className="text-xs px-2 py-1 rounded border border-[oklch(var(--border))] bg-[oklch(var(--background))]"
			>
				<option value={0.5}>0.5x</option>
				<option value={0.75}>0.75x</option>
				<option value={1.0}>1x</option>
				<option value={1.25}>1.25x</option>
				<option value={1.5}>1.5x</option>
				<option value={1.75}>1.75x</option>
				<option value={2.0}>2x</option>
			</select>
		</div>
	);
}
