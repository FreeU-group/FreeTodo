/**
 * 模式切换组件（灵动岛式）
 * 支持回看模式和录音模式的切换
 */

import { Mic, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type ViewMode = "playback" | "recording";

interface ModeSwitcherProps {
	currentMode: ViewMode;
	onModeChange: (mode: ViewMode) => void;
	isRecording?: boolean;
}

export function ModeSwitcher({
	currentMode,
	onModeChange,
	isRecording = false,
}: ModeSwitcherProps) {
	return (
		<div className="flex items-center gap-2">
			{/* 回看模式按钮 */}
			<button
				onClick={() => onModeChange("playback")}
				className={cn(
					"flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
					"text-sm font-medium",
					currentMode === "playback"
						? "bg-primary text-primary-foreground shadow-md"
						: "bg-muted/50 text-muted-foreground hover:bg-muted",
				)}
			>
				<Play className="w-4 h-4" />
				<span>回看</span>
			</button>

			{/* 录音模式按钮 */}
			<button
				onClick={() => onModeChange("recording")}
				className={cn(
					"flex items-center gap-2 px-4 py-2 rounded-lg transition-all",
					"text-sm font-medium relative",
					currentMode === "recording"
						? "bg-primary text-primary-foreground shadow-md"
						: "bg-muted/50 text-muted-foreground hover:bg-muted",
				)}
				disabled={isRecording && currentMode !== "recording"}
			>
				<Mic className="w-4 h-4" />
				<span>录音</span>
				{isRecording && (
					<span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
				)}
			</button>
		</div>
	);
}
