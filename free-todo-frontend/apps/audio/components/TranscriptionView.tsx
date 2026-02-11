"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";

interface TodoItem {
	title: string;
	description?: string;
	deadline?: string;
	source_text?: string;
}

interface TranscriptionViewProps {
	text: string;
	partialText?: string;
	segmentTodos?: TodoItem[][];
	segmentTimesSec?: number[];
	segmentTimeLabels?: string[];
	selectedSegmentIndex?: number | null;
	onSegmentClick?: (index: number) => void;
	isLoadingTimeline?: boolean;
	isRecording?: boolean;
}

interface TextSegment {
	text: string;
	highlight?: "todo";
}

export function TranscriptionView({
	text,
	partialText = "",
	segmentTodos = [],
	segmentTimesSec = [],
	segmentTimeLabels = [],
	selectedSegmentIndex = null,
	onSegmentClick,
	isLoadingTimeline = false,
	isRecording = false,
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

	const highlightedContent = useMemo(() => {
		if (!text) return [];

		const segments = text.split("\n").filter((s) => s.trim());
		if (segments.length === 0) {
			const sentenceEndings = /[。！？.!?]/g;
			const parts = text.split(sentenceEndings);
			segments.push(...parts.filter((s) => s.trim()));
		}

		const findNormalizedMatch = (segment: string, raw: string) => {
			const isIgnorable = (ch: string) => {
				if (/\s/.test(ch)) return true;
				if (/[，。！？、,.!?；;：:“”"‘’'（）()【】[\]《》<>]/.test(ch)) return true;
				if (ch === "钟") return true;
				return false;
			};

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

		const computed = segments.map((segment, segmentIndex) => {
			const highlights: Array<{ start: number; end: number; type: "todo" }> = [];
			const todosForSegment = segmentTodos[segmentIndex] ?? [];

			todosForSegment.forEach((todo) => {
				const candidates = new Set<string>();
				if (todo.source_text?.trim()) candidates.add(todo.source_text.trim());
				if (todo.title?.trim()) candidates.add(todo.title.trim());
				if (todo.description?.trim()) candidates.add(todo.description.trim());
				if (todo.deadline?.trim()) candidates.add(todo.deadline.trim());

				candidates.forEach((searchText) => {
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

			highlights.sort((a, b) => a.start - b.start);
			const merged: typeof highlights = [];
			for (const h of highlights) {
				if (merged.length === 0 || merged[merged.length - 1].end < h.start) {
					merged.push(h);
				} else {
					merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, h.end);
				}
			}

			const textSegments: TextSegment[] = [];
			let lastIndex = 0;

			for (const h of merged) {
				if (h.start > lastIndex) {
					textSegments.push({ text: segment.slice(lastIndex, h.start) });
				}
				textSegments.push({
					text: segment.slice(h.start, h.end),
					highlight: h.type,
				});
				lastIndex = h.end;
			}

			if (lastIndex < segment.length) {
				textSegments.push({ text: segment.slice(lastIndex) });
			}

			return textSegments.length > 0 ? textSegments : [{ text: segment }];
		});
		return computed;
	}, [text, segmentTodos]);

	const displayedTextKey = useMemo(() => `text:${text.length}`, [text]);

	useEffect(() => {
		const contentHash = `${displayedTextKey}:${partialText.length}`;
		if (contentHash === lastContentHashRef.current) return;
		lastContentHashRef.current = contentHash;

		if (!isRecording) return;
		if (!userNearBottomRef.current) return;

		const el = transcriptionRef.current;
		if (!el) return;
		requestAnimationFrame(() => {
			el.scrollTop = el.scrollHeight;
		});
	}, [isRecording, partialText, displayedTextKey]);

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

	const hasContent = text.length > 0 || partialText.length > 0;
	const showLoading = isLoadingTimeline && !hasContent;

	return (
		<div className="flex-1 flex flex-col min-h-0">
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
									</div>
									<p className="text-[15px] leading-[1.8] text-[oklch(var(--foreground))]">
										{paragraph.map((segment, segmentIndex) => {
											const segmentKey = `${paragraphIndex}-${segmentIndex}-${segment.text.slice(0, 10)}`;
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
						{partialText ? (
							<p className="pt-2 text-[oklch(var(--muted-foreground))] italic">{partialText}</p>
						) : null}
					</div>
				) : (
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
