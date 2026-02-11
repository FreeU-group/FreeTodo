
"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

interface TodoItem {
	title: string;
	description?: string;
	deadline?: string;
	// 后端 LLM 可能返回的原文高亮片段（用于更精准的高亮）
	source_text?: string;
}

interface TranscriptionViewProps {
	originalText: string;
	optimizedText: string;
	partialText?: string;
	activeTab: "original" | "optimized";
	onTabChange: (tab: "original" | "optimized") => void;
	/** 每个文本段对应的待办高亮列表（与时间线一一对应） */
	segmentTodos?: TodoItem[][];
	isRecording?: boolean;
	segmentTimesSec?: number[];
	segmentTimeLabels?: string[];
	selectedSegmentIndex?: number | null;
	onSegmentClick?: (index: number) => void;
	isLoadingTimeline?: boolean; // 正在加载时间线（显示在文本区域底部）
}

interface TextSegment {
	text: string;
	highlight?: "todo";
}

export function TranscriptionView({
	originalText,
	optimizedText,
	partialText = "",
	activeTab,
	onTabChange,
	segmentTodos = [],
	isRecording = false,
	segmentTimesSec = [],
	segmentTimeLabels = [],
	selectedSegmentIndex = null,
	onSegmentClick,
	isLoadingTimeline = false,
}: TranscriptionViewProps) {
	const transcriptionRef = useRef<HTMLDivElement>(null);
	const userNearBottomRef = useRef(true);
	const lastContentHashRef = useRef("");

	const formatTime = (seconds: number) => {
		if (!Number.isFinite(seconds) || seconds < 0) return "";
		const mins = Math.floor(seconds / 60);
		const secs = Math.floor(seconds % 60);
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	// 高亮显示待办和日程，并自动分段
	const highlightedContent = useMemo(() => {
		const text = activeTab === "original" ? originalText : optimizedText;
		if (!text) {
			return [];
		}

		// 自动分段：按换行符分段，如果没有换行符则按句子结束标记分段
		const segments = text.split("\n").filter((s) => s.trim());
		if (segments.length === 0) {
			// 如果没有换行符，尝试按句子结束标记分段
			const sentenceEndings = /[。！？.!?]/g;
			const parts = text.split(sentenceEndings);
			segments.push(...parts.filter((s) => s.trim()));
		}

		// 帮助函数：支持“归一化匹配”（用于处理 LLM/智能优化带来的微小差异）
		// - 忽略空白字符
		// - 忽略常见中文/英文标点
		// - 忽略“钟”（常见于“八点钟” vs “八点”）
		const findNormalizedMatch = (segment: string, raw: string) => {
			const isIgnorable = (ch: string) => {
				if (/\s/.test(ch)) return true;
				// 常见标点：中英文 + 顿号/冒号/分号/引号/括号
				if (/[，。！？、,.!?；;：:“”"‘’'（）()【】[\]《》<>]/.test(ch)) return true;
				// “点钟/八点钟”里的“钟”常导致不匹配
				if (ch === "钟") return true;
				return false;
			};

			// 构造“去掉可忽略字符”的版本，并记录映射关系
			const segChars = Array.from(segment);
			const compactSeg: string[] = [];
			const indexMap: number[] = [];
			for (let i = 0; i < segChars.length; i++) {
				const ch = segChars[i];
				if (!isIgnorable(ch)) {
					compactSeg.push(ch);
					indexMap.push(i);
				}
			}
			const compactSegment = compactSeg.join("");

			const candChars = Array.from(raw);
			const compactCand = candChars.filter((ch) => !isIgnorable(ch)).join("");
			if (!compactCand) return null;

			const startCompact = compactSegment.indexOf(compactCand);
			if (startCompact === -1) return null;

			const endCompact = startCompact + compactCand.length - 1;
			const start = indexMap[startCompact];
			const end = indexMap[endCompact] + 1;
			if (start == null || end == null) return null;
			return { start, end };
		};

		// 为每个段落创建高亮
		const computed = segments.map((segment, segmentIndex) => {
			const highlights: Array<{ start: number; end: number; type: "todo" }> = [];

			// 当前段落对应的高亮数据（按录音ID预先拆分好）
			const todosForSegment = segmentTodos[segmentIndex] ?? [];

			// 高亮待办事项：优先使用 LLM 明确给出的 source_text，其次再用 title / description / deadline 进行匹配
			todosForSegment.forEach((todo) => {
				const candidates = new Set<string>();
				if (todo.source_text?.trim()) candidates.add(todo.source_text.trim());
				if (todo.title?.trim()) candidates.add(todo.title.trim());
				if (todo.description?.trim()) candidates.add(todo.description.trim());
				if (todo.deadline?.trim()) candidates.add(todo.deadline.trim());

				candidates.forEach((searchText) => {
					// 太短的关键词容易误伤，忽略
					if (!searchText || searchText.length < 2) return;

					let hasDirectMatch = false;
				let index = segment.indexOf(searchText);
				while (index !== -1) {
						hasDirectMatch = true;
					highlights.push({
						start: index,
						end: index + searchText.length,
						type: "todo",
					});
					index = segment.indexOf(searchText, index + searchText.length);
				}

					// 如果原文中没有完全相同的子串，再尝试“去空格”的宽松匹配
					if (!hasDirectMatch) {
						const normalized = findNormalizedMatch(segment, searchText);
						if (normalized) {
							highlights.push({
								start: normalized.start,
								end: normalized.end,
								type: "todo",
							});
						}
					}
				});
			});

			// 按位置排序并合并重叠
			highlights.sort((a, b) => a.start - b.start);
			const merged: typeof highlights = [];
			for (const h of highlights) {
				if (merged.length === 0 || merged[merged.length - 1].end < h.start) {
					merged.push(h);
				} else {
					merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, h.end);
				}
			}

			// 将文本转换为带高亮的片段数组
			const textSegments: TextSegment[] = [];
			let lastIndex = 0;

			for (const h of merged) {
				// 添加高亮前的文本
				if (h.start > lastIndex) {
					textSegments.push({ text: segment.substring(lastIndex, h.start) });
				}
				// 添加高亮文本
				textSegments.push({
					text: segment.substring(h.start, h.end),
					highlight: h.type,
				});
				lastIndex = h.end;
			}

			// 添加剩余文本
			if (lastIndex < segment.length) {
				textSegments.push({ text: segment.substring(lastIndex) });
			}

			return textSegments.length > 0 ? textSegments : [{ text: segment }];
		});
		return computed;
	}, [originalText, optimizedText, activeTab, segmentTodos]);

	// 当前实际展示的整段文本（用于滚动计算等）
	const displayedTextKey = useMemo(
		() => `${activeTab}:${(activeTab === "original" ? originalText : optimizedText).length}`,
		[activeTab, originalText, optimizedText]
	);

	// 自动滚动策略：
	// - 回看模式：不强制滚动（从顶部开始，用户自己滚）
	// - 录音模式：仅当用户在底部附近时才自动滚动到最新
	useLayoutEffect(() => {
		const el = transcriptionRef.current;
		if (!el) return;

		const currentText = activeTab === "original" ? originalText : optimizedText;
		const contentHash = `${activeTab}:${currentText.length}:${partialText.length}`;
		if (contentHash === lastContentHashRef.current) return;
		lastContentHashRef.current = contentHash;

		if (!isRecording) return;
		if (!userNearBottomRef.current) return;
		el.scrollTop = el.scrollHeight;
	}, [originalText, optimizedText, partialText, activeTab, isRecording]);

	// 非录音模式：每次文本内容变化时，自动滚动到底部，方便刷新/进入页面后看到最新内容
	useEffect(() => {
		if (isRecording) return;
		// 读取 displayedTextKey 以保证依赖关系完整（内容变化时重新滚动）
		// eslint-disable-next-line @typescript-eslint/no-unused-expressions
		displayedTextKey;
		const el = transcriptionRef.current;
		if (!el) return;
		requestAnimationFrame(() => {
			el.scrollTop = el.scrollHeight;
		});
	}, [isRecording, displayedTextKey]);

	// 开始录音时，强制认为在底部并立即滚到底，避免首次不自动滚动
	useEffect(() => {
		if (!isRecording) return;
		userNearBottomRef.current = true;
		const el = transcriptionRef.current;
		if (el) {
			requestAnimationFrame(() => {
				el.scrollTop = el.scrollHeight;
			});
		}
	}, [isRecording]);

	const currentText = activeTab === "original" ? originalText : optimizedText;
	const hasContent = currentText.length > 0 || (activeTab === "original" && partialText.length > 0);
	// 如果正在加载，显示加载状态而不是空状态
	const showLoading = isLoadingTimeline && !hasContent;

	return (
		<div className="flex-1 flex flex-col min-h-0">
			{/* 标签页：右对齐按钮，风格贴近参考图 */}
			<div className="flex justify-start gap-2 px-2 pb-3 mt-2 border-b border-[oklch(var(--border))]">
				<button
					type="button"
					onClick={() => onTabChange("original")}
					className={cn(
						"px-3 py-1 text-[13px] font-medium rounded-md transition-colors",
						activeTab === "original"
							? "bg-[oklch(var(--primary))] text-white shadow-sm"
							: "bg-[oklch(var(--muted))] text-[oklch(var(--muted-foreground))] hover:text-[oklch(var(--foreground))]"
					)}
				>
					原文
				</button>
				<button
					type="button"
					onClick={() => onTabChange("optimized")}
					className={cn(
						"px-3 py-1 text-[13px] font-medium rounded-md transition-colors",
						activeTab === "optimized"
							? "bg-[oklch(var(--primary))] text-white shadow-sm"
							: "bg-[oklch(var(--muted))] text-[oklch(var(--muted-foreground))] hover:text-[oklch(var(--foreground))]"
					)}
				>
					智能优化
				</button>
			</div>

			{/* 转录内容区域 */}
			<div
				ref={transcriptionRef}
				className="flex-1 overflow-auto px-4 py-5"
				onScroll={() => {
					const el = transcriptionRef.current;
					if (!el) return;
					const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
					userNearBottomRef.current = distanceToBottom < 80;
				}}
			>
				{showLoading ? (
					<div className="flex flex-col items-center justify-center h-full text-center">
						<div className="flex items-center gap-2 py-4 text-sm text-[oklch(var(--muted-foreground))]">
							<div className="h-4 w-4 border-2 border-[oklch(var(--primary))] border-t-transparent rounded-full animate-spin" />
							<span>获取中...</span>
						</div>
					</div>
				) : hasContent ? (
					<div className="flex flex-col gap-5">
						{highlightedContent.map((paragraph, paragraphIndex) => {
							const paragraphKey = `${paragraphIndex}-${paragraph.map((s) => s.text).join("").slice(0, 20)}`;
							const timeLabel =
								segmentTimeLabels[paragraphIndex] ?? formatTime(segmentTimesSec[paragraphIndex] ?? NaN);
							const showOptimizedTag = activeTab === "optimized";
							const isSelected = selectedSegmentIndex != null && selectedSegmentIndex === paragraphIndex;
							return (
								<button
									type="button"
									key={paragraphKey}
									className={cn(
										"flex flex-col items-start text-left bg-transparent border-none p-0 gap-1.5 rounded-md px-1 -mx-1",
										isSelected
											? "bg-[oklch(var(--muted))] border border-[oklch(var(--border))] shadow-sm"
											: "",
										onSegmentClick ? "cursor-pointer" : "cursor-default",
									)}
									onClick={() => onSegmentClick?.(paragraphIndex)}
								>
									<div className="flex items-center gap-2 text-[12px] text-[oklch(var(--muted-foreground))] tabular-nums leading-none">
										<span className="inline-flex h-[14px] w-[14px] rounded-[4px] border border-[oklch(var(--border))] bg-[oklch(var(--muted))]/60 shadow-[0_1px_2px_rgba(0,0,0,0.05)] items-center justify-center text-[10px]">
											✨
										</span>
										<span className="mt-[1px]">{timeLabel || "--:--"}</span>
										{showOptimizedTag ? (
											<span className="ml-1 inline-flex items-center px-2 py-[2px] rounded-full text-[11px] font-medium bg-[oklch(var(--primary))/15] text-[oklch(var(--primary))]">
												智能优化
											</span>
										) : null}
									</div>
									<p className="text-[15px] leading-[1.8] text-[oklch(var(--foreground))]">
									{paragraph.map((segment, segmentIndex) => {
											const segmentKey = `${paragraphIndex}-${segmentIndex}-${segment.text.slice(
												0,
												10,
											)}`;
										if (segment.highlight) {
											return (
													<span
														key={segmentKey}
														className="px-1 rounded-md bg-[oklch(var(--primary))/18] text-[oklch(var(--primary))] font-semibold"
													>
													{segment.text}
												</span>
											);
										}
										return <span key={segmentKey}>{segment.text}</span>;
									})}
								</p>
								</button>
							);
						})}
						{/* 实时未完成文本：用斜体/弱化显示，仅在原文页显示 */}
						{activeTab === "original" && partialText ? (
							<p className="pt-2 text-[oklch(var(--muted-foreground))] italic">
								{partialText}
							</p>
						) : null}
					</div>
				) : showLoading ? (
					// 加载状态：显示获取中动效
					<div className="flex flex-col items-center justify-center h-full text-center">
						<div className="mb-4">
							<div className="h-12 w-12 border-4 border-[oklch(var(--primary))] border-t-transparent rounded-full animate-spin mx-auto" />
						</div>
						<p className="text-sm font-medium text-[oklch(var(--foreground))] mb-1">获取中...</p>
						<p className="text-xs text-[oklch(var(--muted-foreground))]">
							正在加载该日期的转录内容
						</p>
					</div>
				) : (
					// 空状态：没有内容且不在加载中
					<div className="flex flex-col items-center justify-center h-full text-center">
						<div className="mb-4 text-[oklch(var(--muted-foreground))]">
							<svg
								className="w-16 h-16 mx-auto mb-2"
								fill="none"
								stroke="currentColor"
								viewBox="0 0 24 24"
								role="img"
								aria-label="文档图标"
							>
								<title>文档图标</title>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={1.5}
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
						</div>
						<p className="text-sm text-[oklch(var(--muted-foreground))] mb-2">暂无转录内容</p>
						<p className="text-xs text-[oklch(var(--muted-foreground))]">
							当前日期没有转录记录。如果这是已录制的音频，可能需要：
						</p>
						<ul className="text-xs text-[oklch(var(--muted-foreground))] mt-2 list-disc list-inside">
							<li>等待转录完成</li>
							<li>检查音频是否已上传并处理</li>
							<li>确认日期选择是否正确</li>
						</ul>
					</div>
				)}
				{/* 文本区域底部的加载状态（当有内容时显示在底部） */}
				{isLoadingTimeline && hasContent && (
					<div className="flex items-center justify-center gap-2 py-4 text-sm text-[oklch(var(--muted-foreground))]">
						<div className="h-4 w-4 border-2 border-[oklch(var(--primary))] border-t-transparent rounded-full animate-spin" />
						<span>获取中...</span>
					</div>
				)}
			</div>
		</div>
	);
}
