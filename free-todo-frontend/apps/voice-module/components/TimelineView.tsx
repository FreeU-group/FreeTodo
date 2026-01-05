/**
 * 时间轴视图组件（参考飞书妙计）
 * 右侧竖式时间轴，显示发言人和时间线
 */

import { Clock, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "../types";

interface TimelineViewProps {
	segments: TranscriptSegment[];
	currentTime?: number; // 当前播放时间（秒）
	onSegmentClick?: (segment: TranscriptSegment) => void;
	highlightedSegmentId?: string;
}

export function TimelineView({
	segments,
	currentTime = 0,
	onSegmentClick,
	highlightedSegmentId,
}: TimelineViewProps) {
	// 过滤非临时片段
	const validSegments = segments.filter(
		(s) => !s.isInterim && s.rawText && s.rawText.trim().length > 0,
	);

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

	// 获取片段的时间（秒）
	const getSegmentTime = (segment: TranscriptSegment): number => {
		return segment.audioStart ? segment.audioStart / 1000 : 0;
	};

	// 判断片段是否在当前播放时间附近（用于高亮）
	const isNearCurrentTime = (segment: TranscriptSegment): boolean => {
		if (!currentTime) return false;
		const segmentTime = getSegmentTime(segment);
		const segmentEnd = segment.audioEnd
			? segment.audioEnd / 1000
			: segmentTime + 5;
		return currentTime >= segmentTime && currentTime <= segmentEnd;
	};

	if (validSegments.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full p-6 text-center">
				<Clock className="w-12 h-12 text-muted-foreground/30 mb-4" />
				<p className="text-sm text-muted-foreground">暂无时间轴内容</p>
			</div>
		);
	}

	return (
		<div className="flex-1 overflow-y-auto p-4">
			<div className="relative">
				{/* 时间轴竖线 */}
				<div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border/50" />

				{/* 时间轴节点 */}
				<div className="space-y-4">
					{validSegments.map((segment, index) => {
						const segmentTime = getSegmentTime(segment);
						const isHighlighted =
							highlightedSegmentId === segment.id || isNearCurrentTime(segment);
						const text = segment.optimizedText || segment.rawText || "";
						const previewText =
							text.length > 50 ? text.substring(0, 50) + "..." : text;

						return (
							<div
								key={segment.id}
								className={cn(
									"relative flex gap-4 cursor-pointer transition-all",
									"hover:bg-muted/50 rounded-lg p-3",
									isHighlighted && "bg-primary/5 border border-primary/20",
								)}
								onClick={() => onSegmentClick?.(segment)}
							>
								{/* 时间轴节点 */}
								<div className="flex flex-col items-center shrink-0">
									{/* 时间轴圆点 */}
									<div
										className={cn(
											"w-3 h-3 rounded-full border-2 transition-all z-10",
											isHighlighted
												? "bg-primary border-primary shadow-md"
												: "bg-background border-border hover:border-primary/50",
										)}
									/>
									{/* 连接线（最后一个不显示） */}
									{index < validSegments.length - 1 && (
										<div className="w-0.5 h-full min-h-[2rem] bg-border/50 mt-2" />
									)}
								</div>

								{/* 内容区域 */}
								<div className="flex-1 min-w-0 pb-2">
									{/* 时间标签 */}
									<div className="flex items-center gap-2 mb-2">
										<span className="text-xs font-mono text-muted-foreground bg-muted/50 px-2 py-0.5 rounded">
											{formatTime(segmentTime)}
										</span>
										{/* 发言人（如果有） */}
										{segment.speaker && (
											<div className="flex items-center gap-1 text-xs text-muted-foreground">
												<User className="w-3 h-3" />
												<span>{segment.speaker}</span>
											</div>
										)}
									</div>

									{/* 文本预览 */}
									<p
										className={cn(
											"text-sm leading-relaxed line-clamp-2",
											isHighlighted
												? "text-foreground font-medium"
												: "text-muted-foreground",
										)}
									>
										{previewText}
									</p>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
