"use client";

import {
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Clock,
	ThumbsUp,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { ExtractedTodo } from "../services/TodoExtractionService";
import type { ScheduleItem, TranscriptSegment } from "../types";

interface ExtractedItemsPanelProps {
	todos: ExtractedTodo[];
	schedules: ScheduleItem[];
	segments?: TranscriptSegment[]; // 用于计算时间戳和点击跳转
	onDismissTodo?: (todoId: string) => void;
	onDismissSchedule?: (scheduleId: string) => void;
	onAddTodo?: (todo: ExtractedTodo) => void; // 用户选择加入待办
	onAddSchedule?: (schedule: ScheduleItem) => void; // 用户选择加入日程
	onSegmentClick?: (segment: TranscriptSegment) => void; // 点击跳转到音频位置
	isExtracting?: boolean; // 是否正在提取
}

export function ExtractedItemsPanel({
	todos,
	schedules,
	segments = [],
	onDismissTodo,
	onDismissSchedule,
	onAddTodo,
	onAddSchedule,
	onSegmentClick,
	isExtracting = false,
}: ExtractedItemsPanelProps) {
	const [isExpanded, setIsExpanded] = useState(true);
	const [dismissedTodos, setDismissedTodos] = useState<Set<string>>(new Set());
	const [dismissedSchedules, setDismissedSchedules] = useState<Set<string>>(
		new Set(),
	);

	// 过滤已关闭的项
	const visibleTodos = useMemo(
		() => todos.filter((todo) => !dismissedTodos.has(todo.id)),
		[todos, dismissedTodos],
	);
	const visibleSchedules = useMemo(
		() => schedules.filter((schedule) => !dismissedSchedules.has(schedule.id)),
		[schedules, dismissedSchedules],
	);

	// 始终显示面板，即使没有内容也显示标题

	const handleDismissTodo = (todoId: string) => {
		setDismissedTodos((prev) => new Set(prev).add(todoId));
		onDismissTodo?.(todoId);
	};

	const handleDismissSchedule = (scheduleId: string) => {
		setDismissedSchedules((prev) => new Set(prev).add(scheduleId));
		onDismissSchedule?.(scheduleId);
	};

	return (
		<div className="overflow-hidden">
			{/* 头部 - 与智能纪要保持一致 */}
			<div
				className="flex items-center justify-between px-0 py-3 cursor-pointer hover:opacity-80 transition-opacity"
				onClick={() => setIsExpanded(!isExpanded)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						setIsExpanded(!isExpanded);
					}
				}}
				role="button"
				tabIndex={0}
			>
				<div className="flex items-center gap-2">
					<div className="flex items-center gap-1.5">
						<ThumbsUp className="h-4 w-4 text-primary" />
						<span className="text-sm font-semibold">智能提取</span>
					</div>
				</div>
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						setIsExpanded(!isExpanded);
					}}
					className="p-1 rounded hover:bg-muted transition-colors"
					aria-label={isExpanded ? "收起" : "展开"}
				>
					{isExpanded ? (
						<ChevronUp className="h-4 w-4 text-muted-foreground" />
					) : (
						<ChevronDown className="h-4 w-4 text-muted-foreground" />
					)}
				</button>
			</div>

			{/* 内容区域 */}
			{isExpanded && (
				<div className="pt-1 space-y-4 max-h-[400px] overflow-y-auto">
					{/* 待办事项 - 与智能纪要保持一致 - 始终显示标题 */}
					<div className="space-y-2">
						{visibleTodos.length > 0
							? visibleTodos.map((todo) => {
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
											onKeyDown={(e) => {
												if ((e.key === "Enter" || e.key === " ") && segment) {
													e.preventDefault();
													onSegmentClick?.(segment);
												}
											}}
											role="button"
											tabIndex={0}
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
														{todo.deadline && (
															<span className="ml-2 text-xs text-muted-foreground font-mono bg-muted/50 px-2 py-0.5 rounded">
																{todo.deadline.toLocaleString("zh-CN", {
																	month: "2-digit",
																	day: "2-digit",
																	hour: "2-digit",
																	minute: "2-digit",
																})}
															</span>
														)}
														<span
															className={cn(
																"ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium",
																todo.priority === "high"
																	? "bg-red-500/10 text-red-600 dark:text-red-400"
																	: todo.priority === "low"
																		? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
																		: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
															)}
														>
															{todo.priority === "high"
																? "高优先级"
																: todo.priority === "low"
																	? "低优先级"
																	: "中优先级"}
														</span>
													</div>
													<p className="text-sm text-foreground leading-relaxed">
														{todo.title}
													</p>
													{todo.description && (
														<p className="text-xs text-muted-foreground leading-relaxed">
															{todo.description}
														</p>
													)}
													<div className="flex items-center gap-2 mt-2">
														{onAddTodo ? (
															<button
																type="button"
																onClick={(e) => {
																	e.stopPropagation();
																	onAddTodo(todo);
																}}
																className="px-2 py-0.5 text-[10px] bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
															>
																加入待办
															</button>
														) : (
															<span className="text-[10px] text-muted-foreground/70">
																✅ 已自动创建
															</span>
														)}
														<button
															type="button"
															onClick={(e) => {
																e.stopPropagation();
																handleDismissTodo(todo.id);
															}}
															className="p-1 rounded hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
															aria-label="关闭"
														>
															<X className="h-3.5 w-3.5 text-muted-foreground" />
														</button>
													</div>
												</div>
											</div>
										</div>
									);
								})
							: null}
					</div>

					{/* 分割线 - 待办事项和日程之间的分隔 */}
					{visibleTodos.length > 0 && visibleSchedules.length > 0 && (
						<div className="border-t border-border/50 my-2" />
					)}

					{/* 日程安排 - 始终显示标题 */}
					<div className="space-y-2">
						{isExtracting && visibleSchedules.length === 0 ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
								<div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
								<span>正在提取日程安排...</span>
							</div>
						) : visibleSchedules.length > 0 ? (
							visibleSchedules.map((schedule) => {
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
										onKeyDown={(e) => {
											if ((e.key === "Enter" || e.key === " ") && segment) {
												e.preventDefault();
												onSegmentClick?.(segment);
											}
										}}
										role="button"
										tabIndex={0}
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
													<span
														className={cn(
															"ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium",
															schedule.status === "confirmed"
																? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
																: schedule.status === "cancelled"
																	? "bg-red-500/10 text-red-600 dark:text-red-400"
																	: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
														)}
													>
														{schedule.status === "confirmed"
															? "已确认"
															: schedule.status === "cancelled"
																? "已取消"
																: "待确认"}
													</span>
												</div>
												<p className="text-sm text-foreground leading-relaxed">
													{schedule.description}
												</p>
												<div className="flex items-center gap-2 mt-2">
													{onAddSchedule ? (
														<button
															type="button"
															onClick={(e) => {
																e.stopPropagation();
																onAddSchedule(schedule);
															}}
															className="px-2.5 py-1 text-xs bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors font-medium"
														>
															加入日程
														</button>
													) : (
														<span className="text-[10px] text-muted-foreground/70">
															✅ 已自动保存
														</span>
													)}
													<button
														type="button"
														onClick={(e) => {
															e.stopPropagation();
															handleDismissSchedule(schedule.id);
														}}
														className="p-1 rounded hover:bg-muted transition-colors opacity-0 group-hover:opacity-100"
														aria-label="关闭"
													>
														<X className="h-3.5 w-3.5 text-muted-foreground" />
													</button>
												</div>
											</div>
										</div>
									</div>
								);
							})
						) : (
							<div className="text-sm text-muted-foreground py-4 text-center">
								暂无日程安排
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
