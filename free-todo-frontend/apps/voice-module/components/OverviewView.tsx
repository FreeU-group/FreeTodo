/**
 * 概览视图组件（智能纪要）
 * 左侧时间轴，右侧一句话
 */

import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "../types";

interface OverviewViewProps {
	segments: TranscriptSegment[];
	onSegmentClick?: (segment: TranscriptSegment) => void;
	highlightedSegmentId?: string;
}

export function OverviewView({
	segments,
	onSegmentClick,
	highlightedSegmentId,
}: OverviewViewProps) {
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

	// 将片段转换为章节（参考图片样式）
	const chapters = segments
		.filter((s) => !s.isInterim && (s.optimizedText || s.rawText))
		.map((segment) => {
			const text = segment.optimizedText || segment.rawText || "";
			const timeInSeconds = segment.audioStart ? segment.audioStart / 1000 : 0;

			return {
				id: segment.id,
				time: formatTime(timeInSeconds),
				text: text.length > 150 ? `${text.substring(0, 150)}...` : text,
				segment,
			};
		});

	return (
		<div className="flex-1 overflow-y-auto p-6 min-h-0">
			{chapters.length === 0 ? (
				<div className="flex items-center justify-center h-full text-muted-foreground">
					<div className="text-center">
						<div className="text-4xl mb-2">📑</div>
						<p className="text-sm font-medium">暂无章节内容</p>
						<p className="text-xs mt-1 opacity-70">章节内容将显示在这里</p>
					</div>
				</div>
			) : (
				<div className="relative max-w-4xl mx-auto">
					{/* 左侧时间轴竖线 */}
					<div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gradient-to-b from-border/30 via-border/50 to-border/30" />

					{/* 章节列表 */}
					<div className="space-y-3">
						{chapters.map((chapter, index) => {
							const isHighlighted = chapter.id === highlightedSegmentId;

							return (
								<div
									key={chapter.id}
									className={cn(
										"group relative flex gap-4 cursor-pointer transition-all duration-300",
										"hover:bg-muted/40 p-4 rounded-xl border border-transparent hover:border-primary/20",
										isHighlighted &&
											"bg-primary/5 border-primary/30 shadow-lg scale-[1.02]",
									)}
									onClick={() => onSegmentClick?.(chapter.segment)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											onSegmentClick?.(chapter.segment);
										}
									}}
									role="button"
									tabIndex={0}
								>
									{/* 左侧时间轴节点 */}
									<div className="flex flex-col items-center shrink-0 w-12">
										<div
											className={cn(
												"w-4 h-4 rounded-full border-2 transition-all z-10 shadow-sm",
												isHighlighted
													? "bg-primary border-primary shadow-lg scale-125"
													: "bg-background border-border/60 group-hover:border-primary/60 group-hover:bg-primary/10",
											)}
										/>
										{/* 连接线（最后一个不显示） */}
										{index < chapters.length - 1 && (
											<div className="w-0.5 h-full min-h-[2rem] bg-gradient-to-b from-border/40 via-border/60 to-border/40 mt-1" />
										)}
									</div>

									{/* 右侧内容 */}
									<div className="flex-1 min-w-0 pt-0.5">
										{/* 时间标签 */}
										<div className="mb-2">
											<span
												className={cn(
													"text-xs font-mono px-2.5 py-1 rounded-lg transition-all",
													isHighlighted
														? "bg-primary/20 text-primary font-semibold"
														: "bg-muted/60 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary",
												)}
											>
												{chapter.time}
											</span>
										</div>
										{/* 文本内容 */}
										<p
											className={cn(
												"text-sm leading-relaxed transition-colors",
												isHighlighted
													? "text-foreground font-medium"
													: "text-foreground/90 group-hover:text-foreground",
											)}
										>
											{chapter.text}
										</p>
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}
		</div>
	);
}
