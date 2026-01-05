/**
 * 原文视图组件
 * 显示转录的原始文本，高亮已提取的字段
 */

import { Edit2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { TranscriptSegment } from "../types";

interface OriginalTextViewProps {
	segments: TranscriptSegment[];
	onSegmentClick?: (segment: TranscriptSegment) => void;
	onSegmentUpdate?: (
		segmentId: string,
		updates: Partial<TranscriptSegment>,
	) => void; // 添加更新回调
	highlightedSegmentId?: string;
	schedules?: Array<{
		sourceSegmentId: string;
		sourceText?: string;
		textStartIndex?: number;
		textEndIndex?: number;
		description?: string;
	}>; // 日程信息，用于高亮
	todos?: Array<{
		sourceSegmentId: string;
		sourceText?: string;
		textStartIndex?: number;
		textEndIndex?: number;
	}>; // 待办信息，用于高亮
}

export function OriginalTextView({
	segments,
	onSegmentClick,
	onSegmentUpdate,
	highlightedSegmentId,
	schedules = [],
	todos = [],
}: OriginalTextViewProps) {
	const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null);
	const [editValue, setEditValue] = useState<string>("");
	const editInputRef = useRef<HTMLTextAreaElement>(null);

	// 当进入编辑模式时，聚焦输入框
	useEffect(() => {
		if (editingSegmentId && editInputRef.current) {
			editInputRef.current.focus();
			editInputRef.current.select();
		}
	}, [editingSegmentId]);

	// 开始编辑
	const handleStartEdit = (segment: TranscriptSegment) => {
		setEditValue(segment.rawText);
		setEditingSegmentId(segment.id);
	};

	// 保存编辑
	const handleSave = (segmentId: string) => {
		const trimmed = editValue.trim();
		if (trimmed && onSegmentUpdate) {
			onSegmentUpdate(segmentId, { rawText: trimmed });
		}
		setEditingSegmentId(null);
	};

	// 取消编辑
	const handleCancel = () => {
		setEditingSegmentId(null);
		setEditValue("");
	};

	// 原文视图也需要高亮，通过sourceText在原文中匹配
	const renderHighlightedText = (text: string, segmentId: string) => {
		// 获取该segment的所有日程和待办
		const segmentSchedules = schedules.filter(
			(s) => s.sourceSegmentId === segmentId,
		);
		const segmentTodos = todos.filter((t) => t.sourceSegmentId === segmentId);

		// 合并所有需要高亮的位置
		const highlights: Array<{
			start: number;
			end: number;
			type: "schedule" | "todo";
		}> = [];

		segmentSchedules.forEach((schedule) => {
			// 优先使用LLM返回的textStartIndex和textEndIndex（如果可用）
			if (
				schedule.textStartIndex !== undefined &&
				schedule.textEndIndex !== undefined
			) {
				// 确保索引在文本范围内
				const start = Math.max(
					0,
					Math.min(schedule.textStartIndex, text.length),
				);
				const end = Math.max(
					start,
					Math.min(schedule.textEndIndex, text.length),
				);
				if (start < end) {
					highlights.push({
						start,
						end,
						type: "schedule",
					});
				}
			} else if (schedule.sourceText?.trim()) {
				// 如果没有索引，使用sourceText在原文中匹配（模糊匹配）
				const sourceText = schedule.sourceText.trim();
				const lowerText = text.toLowerCase();
				const lowerSource = sourceText.toLowerCase();

				// 尝试完整匹配
				let index = lowerText.indexOf(lowerSource);

				// 如果完整匹配失败，尝试匹配关键词（至少3个字符）
				if (index === -1 && sourceText.length >= 3) {
					// 提取关键词（去除标点符号和空格）
					const keywords = sourceText
						.replace(/[，。！？、\s]+/g, "")
						.split("")
						.filter((c) => c.trim());
					if (keywords.length >= 3) {
						// 尝试匹配前3-5个字符
						for (let len = Math.min(5, sourceText.length); len >= 3; len--) {
							const keyword = sourceText
								.substring(0, len)
								.replace(/[，。！？、\s]+/g, "");
							if (keyword.length >= 3) {
								index = lowerText.indexOf(keyword.toLowerCase());
								if (index !== -1) {
									// 找到匹配，使用原始长度
									const endPos = Math.min(
										index + sourceText.length,
										text.length,
									);
									highlights.push({
										start: index,
										end: endPos,
										type: "schedule",
									});
									break;
								}
							}
						}
					}
				} else if (index !== -1) {
					highlights.push({
						start: index,
						end: Math.min(index + sourceText.length, text.length),
						type: "schedule",
					});
				}
			}

			// 如果以上都失败，尝试使用description
			const hasScheduleHighlight = highlights.some(
				(h) => h.type === "schedule" && h.start >= 0,
			);
			if (!hasScheduleHighlight && schedule.description) {
				const desc = schedule.description.trim();
				const index = text.indexOf(desc);
				if (index !== -1) {
					highlights.push({
						start: index,
						end: Math.min(index + desc.length, text.length),
						type: "schedule",
					});
				}
			}
		});

		segmentTodos.forEach((todo) => {
			// 优先使用LLM返回的textStartIndex和textEndIndex（如果可用）
			if (
				todo.textStartIndex !== undefined &&
				todo.textEndIndex !== undefined
			) {
				// 确保索引在文本范围内
				const start = Math.max(0, Math.min(todo.textStartIndex, text.length));
				const end = Math.max(start, Math.min(todo.textEndIndex, text.length));
				if (start < end) {
					highlights.push({
						start,
						end,
						type: "todo",
					});
				}
			} else if (todo.sourceText) {
				// 如果没有索引，使用sourceText匹配（模糊匹配）
				const sourceText = todo.sourceText.trim();
				const lowerText = text.toLowerCase();
				const lowerSource = sourceText.toLowerCase();

				// 尝试完整匹配
				let index = lowerText.indexOf(lowerSource);

				// 如果完整匹配失败，尝试匹配关键词（至少3个字符）
				if (index === -1 && sourceText.length >= 3) {
					// 提取关键词（去除标点符号和空格）
					const keywords = sourceText
						.replace(/[，。！？、\s]+/g, "")
						.split("")
						.filter((c) => c.trim());
					if (keywords.length >= 3) {
						// 尝试匹配前3-5个字符
						for (let len = Math.min(5, sourceText.length); len >= 3; len--) {
							const keyword = sourceText
								.substring(0, len)
								.replace(/[，。！？、\s]+/g, "");
							if (keyword.length >= 3) {
								index = lowerText.indexOf(keyword.toLowerCase());
								if (index !== -1) {
									// 找到匹配，使用原始长度
									const endPos = Math.min(
										index + sourceText.length,
										text.length,
									);
									highlights.push({
										start: index,
										end: endPos,
										type: "todo",
									});
									break;
								}
							}
						}
					}
				} else if (index !== -1) {
					highlights.push({
						start: index,
						end: Math.min(index + sourceText.length, text.length),
						type: "todo",
					});
				}
			}

			// 如果以上都失败，尝试使用title或description
			if (
				highlights.length === 0 ||
				!highlights.some((h) => h.type === "todo")
			) {
				const todoTitle = (todo as any).title || (todo as any).description;
				if (todoTitle?.trim()) {
					const title = todoTitle.trim();
					const lowerTitle = title.toLowerCase();
					const index = text.toLowerCase().indexOf(lowerTitle);
					if (index !== -1) {
						highlights.push({
							start: index,
							end: Math.min(index + title.length, text.length),
							type: "todo",
						});
					} else if (title.length >= 3) {
						// 尝试匹配前3个字符
						const shortTitle = title.substring(0, 3);
						const index2 = text.toLowerCase().indexOf(shortTitle.toLowerCase());
						if (index2 !== -1) {
							highlights.push({
								start: index2,
								end: Math.min(index2 + title.length, text.length),
								type: "todo",
							});
						}
					}
				}
			}
		});

		// 按位置排序
		highlights.sort((a, b) => a.start - b.start);

		// 如果没有高亮，直接返回文本
		if (highlights.length === 0) {
			return <span>{text}</span>;
		}

		// 构建高亮文本
		const parts: Array<{ text: string; highlight?: "schedule" | "todo" }> = [];
		let lastIndex = 0;

		highlights.forEach((highlight) => {
			// 添加高亮前的文本
			if (highlight.start > lastIndex) {
				parts.push({ text: text.substring(lastIndex, highlight.start) });
			}
			// 添加高亮的文本
			parts.push({
				text: text.substring(highlight.start, highlight.end),
				highlight: highlight.type,
			});
			lastIndex = highlight.end;
		});

		// 添加剩余的文本
		if (lastIndex < text.length) {
			parts.push({ text: text.substring(lastIndex) });
		}

		return (
			<>
				{parts.map((part, index) => {
					if (part.highlight === "schedule") {
						return (
							<mark
								key={index}
								className={cn(
									"relative inline-block",
									"bg-gradient-to-r from-amber-100 to-amber-50 dark:from-amber-900/40 dark:to-amber-800/30",
									"text-amber-900 dark:text-amber-100",
									"px-1.5 py-0.5 rounded-md",
									"font-medium",
									"border border-amber-300/50 dark:border-amber-700/50",
									"shadow-sm",
									"transition-all duration-200",
									"hover:shadow-md hover:scale-[1.02]",
									"cursor-pointer",
								)}
								title="日程安排"
							>
								{part.text}
							</mark>
						);
					} else if (part.highlight === "todo") {
						return (
							<mark
								key={index}
								className={cn(
									"relative inline-block",
									"bg-gradient-to-r from-blue-100 to-blue-50 dark:from-blue-900/40 dark:to-blue-800/30",
									"text-blue-900 dark:text-blue-100",
									"px-1.5 py-0.5 rounded-md",
									"font-medium",
									"border border-blue-300/50 dark:border-blue-700/50",
									"shadow-sm",
									"transition-all duration-200",
									"hover:shadow-md hover:scale-[1.02]",
									"cursor-pointer",
								)}
								title="待办事项"
							>
								{part.text}
							</mark>
						);
					} else {
						return <span key={index}>{part.text}</span>;
					}
				})}
			</>
		);
	};

	// 不再需要分段函数，因为后端已经按段落分割成多个独立的segment了

	return (
		<div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
			{segments.length === 0 ? (
				<div className="flex items-center justify-center h-full text-muted-foreground">
					<div className="text-center max-w-md px-4">
						<div className="text-4xl mb-3">📝</div>
						<p className="text-sm font-medium mb-1">暂无转录内容</p>
						<p className="text-xs opacity-70 leading-relaxed">
							当前日期没有转录记录。如果这是已录制的音频，可能需要：
							<br />• 等待转录完成
							<br />• 检查音频是否已上传并处理
							<br />• 确认日期选择是否正确
						</p>
					</div>
				</div>
			) : (
				segments
					.filter((s) => !s.isInterim) // 过滤临时结果
					.map((segment) => {
						const text = segment.rawText; // 原文视图只显示原始文本
						const isHighlighted = segment.id === highlightedSegmentId;

						return (
							<div
								key={segment.id}
								className={cn(
									"group relative py-3 border-b border-border/50 last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer",
									isHighlighted && "bg-primary/5",
								)}
								onClick={() => onSegmentClick?.(segment)}
							>
								<div className="flex items-start gap-3">
									<div className="flex-shrink-0 mt-0.5">
										<div
											className={cn(
												"w-4 h-4 rounded border-2 flex items-center justify-center",
												isHighlighted
													? "border-primary bg-primary/10"
													: "border-border bg-muted/50 group-hover:border-primary/50",
											)}
										>
											<span className="text-[10px]">📝</span>
										</div>
									</div>
									<div className="flex-1 min-w-0 space-y-1.5">
										<div className="flex items-center gap-2">
											<span className="text-xs font-mono text-muted-foreground">
												{segment.timestamp.toLocaleTimeString("zh-CN", {
													hour: "2-digit",
													minute: "2-digit",
													second: "2-digit",
												})}
											</span>
											{!segment.isInterim && onSegmentUpdate && (
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														handleStartEdit(segment);
													}}
													className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted transition-opacity"
													title="编辑文本"
												>
													<Edit2 className="h-3 w-3 text-muted-foreground" />
												</button>
											)}
										</div>
										{editingSegmentId === segment.id ? (
											<div className="space-y-2">
												<textarea
													ref={editInputRef}
													value={editValue}
													onChange={(e) => setEditValue(e.target.value)}
													onKeyDown={(e) => {
														if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
															e.preventDefault();
															handleSave(segment.id);
														} else if (e.key === "Escape") {
															e.preventDefault();
															handleCancel();
														}
													}}
													onBlur={() => handleSave(segment.id)}
													className="w-full min-h-[60px] resize-none rounded-md border border-primary bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
													onClick={(e) => e.stopPropagation()}
												/>
												<div className="flex items-center gap-2 text-xs text-muted-foreground">
													<span>Ctrl+Enter 保存，Esc 取消</span>
												</div>
											</div>
										) : (
											<p className="text-sm text-foreground leading-relaxed">
												{renderHighlightedText(text, segment.id)}
											</p>
										)}
									</div>
								</div>

								{/* 临时结果提示 */}
								{segment.isInterim && (
									<div className="mt-3 text-xs text-muted-foreground italic flex items-center gap-2">
										<span className="animate-pulse">🎤</span>
										<span>正在识别...</span>
									</div>
								)}
							</div>
						);
					})
			)}
		</div>
	);
}
