"use client";

import { useCallback } from "react";
import { getTranscriptionApiAudioTranscriptionRecordingIdGet } from "@/lib/generated/audio/audio";
import { getAudioApiBaseUrl } from "../utils/getAudioApiBaseUrl";

type TodoItem = {
	id?: string;
	dedupe_key?: string;
	title: string;
	description?: string;
	deadline?: string;
	source_text?: string;
	linked?: boolean;
	linked_todo_id?: number | null;
};

type ExtractionData = {
	todos?: TodoItem[];
};

/**
 * Hook for linking extracted items to todos
	* 用于将提取的待办关联到待办列表
 */
export function useAudioLink() {
	const apiBaseUrl = getAudioApiBaseUrl();

	/**
	 * Link extracted items to todos
	 * @param recordingId - 录音ID
	 * @param links - 链接列表，包含 kind (todo), item_id, todo_id
	 * @param optimized - 是否更新优化文本的提取结果（默认 true）
	 */
	const linkExtractedItems = useCallback(
		async (
			recordingId: number,
			links: Array<{ kind: "todo"; item_id: string; todo_id: number }>,
			optimized: boolean = true
		) => {
			const response = await fetch(
				`${apiBaseUrl}/api/audio/transcription/${recordingId}/link?optimized=${optimized}`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ links }),
				}
			);
			if (!response.ok) {
				throw new Error(`Failed to link items: ${response.status}`);
			}
			return response.json();
		},
		[apiBaseUrl]
	);

	/**
	 * Get transcription extraction data
	 * @param recordingId - 录音ID
	 * @param optimized - 是否获取优化文本的提取结果（默认 true）
	 */
	const getTranscriptionExtraction = useCallback(
		async (recordingId: number, optimized: boolean = true): Promise<ExtractionData> => {
			const data = (await getTranscriptionApiAudioTranscriptionRecordingIdGet(recordingId, {
				optimized,
			})) as ExtractionData;
			return {
				todos: Array.isArray(data.todos) ? data.todos : [],
			};
		},
		[]
	);

	/**
	 * Link items and update extraction data
	 * 关联项目并更新提取数据（完整流程）
	 * @param byRec - 按 recordingId 分组的链接数据
	 * @param onUpdate - 更新提取数据的回调
	 */
	const linkAndRefresh = useCallback(
		async (
			byRec: Map<number, Array<{ kind: "todo"; item_id: string; todo_id: number }>>,
			onUpdate: (recordingId: number, data: ExtractionData) => void
		) => {
			// 1. 调用 link API
			await Promise.all(
				Array.from(byRec.entries()).map(async ([recId, links]) => {
					await linkExtractedItems(recId, links, true);
				})
			);

			// 2. 重新拉取数据
			try {
				const refreshed = await Promise.all(
					Array.from(byRec.keys()).map(async (recId) => {
						const data = await getTranscriptionExtraction(recId, true);
						return { id: recId, ...data };
					})
				);

				// 3. 调用更新回调
				for (const r of refreshed) {
					onUpdate(r.id, { todos: r.todos });
				}
			} catch (error) {
				console.error("Failed to refresh extraction data:", error);
				throw error;
			}
		},
		[linkExtractedItems, getTranscriptionExtraction]
	);

	return {
		linkExtractedItems,
		getTranscriptionExtraction,
		linkAndRefresh,
	};
}
