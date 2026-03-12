"use client";

import { Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioRecording {
	id: number;
	date: string;
	time: string;
	duration: string;
	size: string;
	isCurrent?: boolean;
}

interface AudioListProps {
	recordings: AudioRecording[];
	onPlay?: (id: number) => void;
}

export function AudioList({ recordings, onPlay }: AudioListProps) {
	return (
		<div className="px-4 py-2 border-b border-[oklch(var(--border))]">
			<div className="text-xs font-medium mb-2">♫ 音频列表</div>
			<div className="space-y-1">
				{recordings.map((audio) => (
					<div
						key={audio.id}
						className={cn(
							"flex items-center justify-between p-2 rounded text-xs",
							audio.isCurrent
								? "bg-[oklch(var(--primary))]/10"
								: "hover:bg-[oklch(var(--muted))]"
						)}
					>
						<div className="flex items-center gap-2">
							{audio.isCurrent && (
								<span className="px-1.5 py-0.5 text-xs rounded bg-[oklch(var(--primary))] text-white">
									当前
								</span>
							)}
							<span>{audio.time}</span>
							<span className="text-[oklch(var(--muted-foreground))]">{audio.duration}</span>
							<span className="text-[oklch(var(--muted-foreground))]">{audio.size}</span>
						</div>
						{onPlay && (
							<button
								type="button"
								className="p-1 rounded hover:bg-[oklch(var(--muted))]"
								onClick={() => onPlay(audio.id)}
							>
								<Play className="h-3 w-3" />
							</button>
						)}
					</div>
				))}
			</div>
		</div>
	);
}
