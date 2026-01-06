"use client";

import { Mic, Play, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViewMode } from "./ModeSwitcher";

interface BottomControlBarProps {
	viewMode: ViewMode;
	isRecording: boolean;
	recordingDuration: number;
	onModeChange: (mode: ViewMode) => void;
	onStartRecording: () => void;
	onStopRecording: () => void;
}

export function BottomControlBar({
	viewMode,
	isRecording,
	recordingDuration,
	onModeChange,
	onStartRecording,
	onStopRecording,
}: BottomControlBarProps) {
	const formatTime = (seconds: number): string => {
		const hours = Math.floor(seconds / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);

		if (hours > 0) {
			return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
		}
		return `${minutes}:${secs.toString().padStart(2, "0")}`;
	};

	// 回看模式：显示回看按钮（80%）+ 录音按钮（20%）
	if (viewMode === "playback") {
		return (
			<div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
				<div className="flex items-center gap-2 bg-background/95 backdrop-blur-md border border-border/50 rounded-full shadow-2xl px-2 py-2">
					{/* 左侧：回看模式（80%） */}
					<button
						type="button"
						onClick={() => onModeChange("playback")}
						className={cn(
							"flex items-center gap-3 px-6 py-3 rounded-full",
							"bg-muted/50 hover:bg-muted transition-all duration-300",
							"text-sm font-medium",
							"flex-[4] min-w-[200px]",
						)}
					>
						<Play className="w-4 h-4" />
						<span>回看</span>
					</button>

					{/* 右侧：录音按钮（20%） */}
					<button
						type="button"
						onClick={onStartRecording}
						className={cn(
							"flex items-center justify-center w-12 h-12 rounded-full",
							"bg-primary hover:bg-primary/90 transition-all duration-300",
							"text-primary-foreground shadow-lg hover:shadow-xl",
							"active:scale-95",
						)}
						title="开始录音"
					>
						<Mic className="w-5 h-5" />
					</button>
				</div>
			</div>
		);
	}

	// 录音模式：显示录音状态（80%）+ 回看按钮（20%）
	if (viewMode === "recording" && isRecording) {
		return (
			<div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
				<div className="flex items-center gap-2 bg-background/95 backdrop-blur-md border border-border/50 rounded-full shadow-2xl px-2 py-2">
					{/* 左侧：录音状态（80%） */}
					<div
						className={cn(
							"flex items-center gap-3 px-6 py-3 rounded-full",
							"bg-red-500/10 border border-red-500/30",
							"flex-[4] min-w-[200px]",
						)}
					>
						<div className="relative w-3 h-3">
							<div className="absolute inset-0 bg-red-500 rounded-full animate-ping" />
							<div className="absolute inset-0 bg-red-500 rounded-full" />
						</div>
						<span className="text-sm font-medium text-red-600 dark:text-red-400">
							录音中 {formatTime(recordingDuration)}
						</span>
						<button
							type="button"
							onClick={onStopRecording}
							className="ml-auto p-1.5 rounded-full hover:bg-red-500/20 transition-colors"
							title="停止录音"
						>
							<Square className="w-4 h-4 text-red-600 dark:text-red-400" />
						</button>
					</div>

					{/* 右侧：回看按钮（20%） */}
					<button
						type="button"
						onClick={() => onModeChange("playback")}
						className={cn(
							"flex items-center justify-center w-12 h-12 rounded-full",
							"bg-muted hover:bg-muted/80 transition-all duration-300",
							"text-foreground shadow-md hover:shadow-lg",
							"active:scale-95",
						)}
						title="切换到回看"
					>
						<Play className="w-5 h-5" />
					</button>
				</div>
			</div>
		);
	}

	return null;
}
