"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { MessageTodoExtractionModal } from "@/apps/chat/components/message/MessageTodoExtractionModal";
import { cn } from "@/lib/utils";
import { useAudioLink } from "../hooks/useAudioLink";

type TodoItem = {
	id?: string;
	dedupe_key?: string;
	title: string;
	description?: string;
	start_time?: string;
	startTime?: string;
	deadline?: string;
	source_text?: string;
	linked?: boolean;
	linked_todo_id?: number | null;
};

interface ExtractionPanelProps {
	dateKey: string;
	segmentRecordingIds: number[];
	extractionsByRecordingId: Record<number, { todos?: TodoItem[] }>;
	setExtractionsByRecordingId: React.Dispatch<
		React.SetStateAction<Record<number, { todos?: TodoItem[] }>>
	>;
	parseTimeToIsoWithDate: (raw?: string | null) => string | undefined;
	// 录音中的实时提取结果（recId=0 表示录音中）
	liveTodos?: Array<{
		title: string;
		description?: string;
		startTime?: string;
		deadline?: string;
		source_text?: string;
	}>;
	isRecording?: boolean;
	isExtracting?: boolean; // 后端正在提取中
}

export function AudioExtractionPanel({
	dateKey,
	segmentRecordingIds,
	extractionsByRecordingId,
	setExtractionsByRecordingId,
	parseTimeToIsoWithDate,
	liveTodos = [],
	isRecording = false,
	isExtracting = false,
}: ExtractionPanelProps) {
	const tAudio = useTranslations("audio");
	const [showExtractionModal, setShowExtractionModal] = useState(false);
	const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
	const { linkAndRefresh } = useAudioLink();

	type ModalItem = {
		key: string;
		name: string;
		description?: string;
		deadline?: string;
		rawTime?: string;
		tags: string[];
		_meta: { recordingIds: number[]; kind: "todo"; itemKey: string };
	};

	const extractionTodosForModal = useMemo(() => {
		const uniqueIds = Array.from(new Set(segmentRecordingIds.filter((id) => id && id > 0)));
		const aggregated = new Map<string, ModalItem>();

		// 先处理录音中的实时提取结果（recId=0）
		if (isRecording && liveTodos.length > 0) {
			for (const item of liveTodos) {
				const itemKey = (item.source_text || item.title || "").toString();
				if (!itemKey) continue;
				const mapKey = `todo:${itemKey}`;
				const liveTime = item.startTime ?? item.deadline ?? null;
				if (!aggregated.has(mapKey)) {
					aggregated.set(mapKey, {
						key: `audio:${dateKey}:${mapKey}:live`,
						name: item.source_text || item.title,
						description: item.source_text || item.description || undefined,
						deadline: parseTimeToIsoWithDate(liveTime),
						rawTime: liveTime || item.source_text || undefined,
						tags: [tAudio("linkTodoTag")],
						_meta: { recordingIds: [0], kind: "todo", itemKey },
					});
				}
			}
		}

		// 然后处理已保存录音的提取结果
		for (const recId of uniqueIds) {
			const ext = extractionsByRecordingId[recId];
			if (!ext) continue;

			for (const item of ext.todos ?? []) {
				const itemKey = (item.dedupe_key || item.id || "").toString();
				if (!itemKey) continue;
				if (item?.linked || item?.linked_todo_id) {
					aggregated.delete(`todo:${itemKey}`);
					continue;
				}
				const mapKey = `todo:${itemKey}`;
				const todoTime = item.startTime ?? item.start_time ?? item.deadline ?? null;
				const existing = aggregated.get(mapKey);
				if (existing) {
					if (!existing._meta.recordingIds.includes(recId)) {
						existing._meta.recordingIds.push(recId);
					}
				} else {
					aggregated.set(mapKey, {
						key: `audio:${dateKey}:${mapKey}`,
						name: item.source_text || item.title,
						description: item.source_text || item.description || undefined,
						deadline: parseTimeToIsoWithDate(todoTime),
						rawTime: todoTime || item.source_text || undefined,
						tags: [tAudio("linkTodoTag")],
						_meta: { recordingIds: [recId], kind: "todo", itemKey },
					});
				}
			}
		}

		return Array.from(aggregated.values());
	}, [
		dateKey,
		segmentRecordingIds,
		extractionsByRecordingId,
		parseTimeToIsoWithDate,
		tAudio,
		isRecording,
		liveTodos,
	]);

	const filteredTodoCount = extractionTodosForModal.length;
	const hasExtraction = filteredTodoCount > 0;

	return (
		<>
			{(hasExtraction || isExtracting || (isRecording && liveTodos.length > 0)) ? (
				<div className="flex items-center justify-between px-4 py-2 border-b border-[oklch(var(--border))] bg-[oklch(var(--muted))]/40">
					<div className="flex items-center gap-2">
						{isExtracting && (
							<div className="flex items-center gap-1.5 text-xs text-[oklch(var(--muted-foreground))]">
								<div className="h-3 w-3 border-2 border-[oklch(var(--primary))] border-t-transparent rounded-full animate-spin" />
								<span>提取中...</span>
							</div>
						)}
						{(hasExtraction || (isRecording && liveTodos.length > 0)) && (
							<div className="text-sm text-[oklch(var(--muted-foreground))]">
								{`待添加 ${filteredTodoCount} 个待办`}
							</div>
						)}
					</div>
					{hasExtraction && (
						<button
							type="button"
							onClick={() => {
								setSelectedIndexes(new Set());
								setShowExtractionModal(true);
							}}
							className={cn(
								"px-3 py-1.5 text-sm rounded-md",
								"bg-[oklch(var(--primary))] text-white hover:opacity-90 transition-colors",
							)}
						>
							{tAudio("linkTodo")}
						</button>
					)}
				</div>
			) : null}

			<MessageTodoExtractionModal
				isOpen={showExtractionModal}
				onClose={() => setShowExtractionModal(false)}
				todos={extractionTodosForModal}
				parentTodoId={null}
				selectedTodoIndexes={showExtractionModal ? selectedIndexes : undefined}
				onSelectedTodoIndexesChange={(next) => setSelectedIndexes(next)}
				onSuccessWithCreated={async (created) => {
					// 聚合按 recordingId 调用 link API（减少请求次数）
					const byRec = new Map<number, Array<{ kind: "todo"; item_id: string; todo_id: number }>>();
					for (const row of created) {
						const item = extractionTodosForModal[row.index] as unknown as {
							_meta?: { recordingIds: number[]; kind: "todo"; itemKey: string };
						};
						const meta = item?._meta;
						if (!meta?.recordingIds?.length || !meta.itemKey) continue;
						for (const recId of meta.recordingIds) {
							// 跳过 recId=0（实时提取结果，还没有保存到数据库）
							if (recId <= 0) continue;
							const arr = byRec.get(recId) ?? [];
							arr.push({ kind: "todo", item_id: meta.itemKey, todo_id: row.todoId });
							byRec.set(recId, arr);
						}
					}

					// 前端即时标记 linked，避免再次出现（优化用户体验）
					setExtractionsByRecordingId((prev) => {
						const next = { ...prev };
						for (const [recId, links] of byRec.entries()) {
							const ext = next[recId];
							if (!ext) continue;

							if (links.length > 0) {
								const keyToTodoId = new Map(links.map((l) => [l.item_id, l.todo_id]));
								next[recId] = {
									...ext,
									todos: (ext.todos ?? []).map((t) => {
										const k = (t.dedupe_key || t.id || "").toString();
										if (!k) return t;
										const linkedTodoId = keyToTodoId.get(k);
										if (!linkedTodoId) return t;
										return { ...t, linked: true, linked_todo_id: linkedTodoId };
									}),
								};
							}
						}
						return next;
					});

					// 使用 hook 进行链接和刷新（始终使用优化文本的提取结果）
					try {
						await linkAndRefresh(byRec, (recordingId, data) => {
							setExtractionsByRecordingId((prev) => {
								const next = { ...prev };
								next[recordingId] = { todos: data.todos };
								return next;
							});
						});
					} catch (error) {
						console.error("Failed to link and refresh extraction data:", error);
						// 即使失败，前端已经标记了 linked，所以用户体验不受影响
					}

					setShowExtractionModal(false);
				}}
			/>
		</>
	);
}
