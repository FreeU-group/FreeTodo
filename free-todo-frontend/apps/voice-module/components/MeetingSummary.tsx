/**
 * 会议纪要组件（参考通义听悟）
 * 包含：会议摘要、智能纪要、待办事项
 */

import {
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Clock,
	ThumbsUp,
} from "lucide-react";
import { useState } from "react";
import type { ExtractedTodo } from "../services/TodoExtractionService";
import type { ScheduleItem, TranscriptSegment } from "../types";

interface MeetingSummaryProps {
	segments: TranscriptSegment[];
	schedules: ScheduleItem[];
	todos: ExtractedTodo[];
	onSegmentClick?: (segment: TranscriptSegment) => void;
	summaryText?: string; // LLM生成的智能纪要
	isSummarizing?: boolean; // 是否正在生成纪要
}

export function MeetingSummary({
	segments,
	schedules,
	todos,
	onSegmentClick,
	summaryText,
	isSummarizing = false,
}: MeetingSummaryProps) {
	const [expandedSections, setExpandedSections] = useState({
		summary: true,
		chapters: true,
		todos: true,
	});

	return (
		<div className="flex-1 overflow-y-auto min-h-0">
			{/* 智能纪要摘要 - 始终显示标题 */}
			<div className="space-y-3 mb-4">
				<div className="flex items-center justify-between px-0 py-3">
					<div className="flex items-center gap-2">
						<div className="flex items-center gap-1.5">
							<ThumbsUp className="h-4 w-4 text-primary" />
							<span className="text-sm font-semibold">智能纪要</span>
						</div>
					</div>
					<button
						type="button"
						onClick={() =>
							setExpandedSections({
								...expandedSections,
								summary: !expandedSections.summary,
							})
						}
						className="p-1 rounded hover:bg-muted transition-colors"
						aria-label={expandedSections.summary ? "收起" : "展开"}
					>
						{expandedSections.summary ? (
							<ChevronUp className="h-4 w-4 text-muted-foreground" />
						) : (
							<ChevronDown className="h-4 w-4 text-muted-foreground" />
						)}
					</button>
				</div>
				{expandedSections.summary && (
					<div className="pt-1">
						{isSummarizing ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
								<span>正在生成纪要...</span>
							</div>
						) : summaryText ? (
							<p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
								{summaryText}
							</p>
						) : (
							<p className="text-sm text-muted-foreground">暂无纪要内容</p>
						)}
					</div>
				)}
			</div>

			{/* 分割线 - 智能纪要和待办事项之间的分隔 */}
			{(todos.length > 0 || schedules.length > 0) && (
				<div className="border-t border-border/50 my-4" />
			)}

			{/* 待办事项 - 始终显示标题 */}
			<div className="space-y-3">
				<div className="flex items-center justify-between px-0 py-3">
					<div className="flex items-center gap-2">
						<div className="flex items-center gap-1.5">
							<CheckCircle2 className="h-4 w-4 text-primary" />
							<span className="text-sm font-semibold">待办事项</span>
						</div>
					</div>
					<button
						type="button"
						onClick={() =>
							setExpandedSections({
								...expandedSections,
								todos: !expandedSections.todos,
							})
						}
						className="p-1 rounded hover:bg-muted transition-colors"
						aria-label={expandedSections.todos ? "收起" : "展开"}
					>
						{expandedSections.todos ? (
							<ChevronUp className="h-4 w-4 text-muted-foreground" />
						) : (
							<ChevronDown className="h-4 w-4 text-muted-foreground" />
						)}
					</button>
				</div>
				{expandedSections.todos && (
					<div className="pt-1 space-y-3 max-h-[400px] overflow-y-auto">
						{todos.length === 0 && schedules.length === 0 ? (
							<div className="text-center py-6 text-sm text-muted-foreground">
								暂无待办事项
							</div>
						) : (
							<div className="space-y-2">
								{todos.map((todo) => {
									const segment = segments.find(
										(s) => s.id === todo.sourceSegmentId,
									);
									const timeInSeconds = segment?.audioStart
										? segment.audioStart / 1000
										: 0;
									const hours = Math.floor(timeInSeconds / 3600);
									const mins = Math.floor((timeInSeconds % 3600) / 60);
									const secs = Math.floor(timeInSeconds % 60);
									const timeStr =
										hours > 0
											? `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
											: `${mins}:${secs.toString().padStart(2, "0")}`;

									return (
										<div
											key={todo.id}
											className="group relative py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
											onClick={() => segment && onSegmentClick?.(segment)}
										>
											<div className="flex items-start gap-3">
												<div className="flex-shrink-0 mt-0.5">
													<div className="w-4 h-4 rounded border-2 border-primary bg-primary/10 flex items-center justify-center">
														<CheckCircle2 className="h-2.5 w-2.5 text-primary" />
													</div>
												</div>
												<div className="flex-1 min-w-0 space-y-1.5">
													<div className="text-xs font-mono text-muted-foreground">
														{timeStr}
													</div>
													<p className="text-sm text-foreground leading-relaxed">
														{todo.title}
													</p>
													{todo.description && (
														<p className="text-xs text-muted-foreground leading-relaxed">
															{todo.description}
														</p>
													)}
												</div>
											</div>
										</div>
									);
								})}
								{schedules.map((schedule) => {
									const segment = segments.find(
										(s) => s.id === schedule.sourceSegmentId,
									);

									// 格式化日期时间（如：2025/12/25 07:00）
									const scheduleDateTime = schedule.scheduleTime
										.toLocaleString("zh-CN", {
											year: "numeric",
											month: "2-digit",
											day: "2-digit",
											hour: "2-digit",
											minute: "2-digit",
										})
										.replace(/\//g, "/");

									return (
										<div
											key={schedule.id}
											className="group relative py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
											onClick={() => segment && onSegmentClick?.(segment)}
										>
											<div className="flex items-start gap-3">
												<div className="flex-shrink-0 mt-0.5">
													<div className="w-4 h-4 rounded border-2 border-amber-500 bg-amber-500/10 flex items-center justify-center">
														<Clock className="h-2.5 w-2.5 text-amber-500" />
													</div>
												</div>
												<div className="flex-1 min-w-0 space-y-1.5">
													<div className="text-xs font-mono text-muted-foreground">
														{scheduleDateTime}
													</div>
													<p className="text-sm text-foreground leading-relaxed">
														{schedule.description}
													</p>
												</div>
											</div>
										</div>
									);
								})}
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
