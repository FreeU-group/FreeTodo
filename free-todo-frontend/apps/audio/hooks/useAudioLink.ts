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

	const linkExtractedItems = useCallback(
		async (
			recordingId: number,
			links: Array<{ kind: "todo"; item_id: string; todo_id: number }>,
		) => {
			const response = await fetch(`${apiBaseUrl}/api/audio/transcription/${recordingId}/link`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ links }),
			});
			if (!response.ok) {
				throw new Error(`Failed to link items: ${response.status}`);
			}
			return response.json();
		},
		[apiBaseUrl],
	);

	const getTranscriptionExtraction = useCallback(async (recordingId: number): Promise<ExtractionData> => {
		const data = (await getTranscriptionApiAudioTranscriptionRecordingIdGet(recordingId)) as ExtractionData;
		return {
			todos: Array.isArray(data.todos) ? data.todos : [],
		};
	}, []);

	const linkAndRefresh = useCallback(
		async (
			byRec: Map<number, Array<{ kind: "todo"; item_id: string; todo_id: number }>>,
			onUpdate: (recordingId: number, data: ExtractionData) => void,
		) => {
			await Promise.all(
				Array.from(byRec.entries()).map(async ([recId, links]) => {
					await linkExtractedItems(recId, links);
				}),
			);

			try {
				const refreshed = await Promise.all(
					Array.from(byRec.keys()).map(async (recId) => {
						const data = await getTranscriptionExtraction(recId);
						return { id: recId, ...data };
					}),
				);

				for (const r of refreshed) {
					onUpdate(r.id, { todos: r.todos });
				}
			} catch (error) {
				console.error("Failed to refresh extraction data:", error);
				throw error;
			}
		},
		[linkExtractedItems, getTranscriptionExtraction],
	);

	return {
		linkExtractedItems,
		getTranscriptionExtraction,
		linkAndRefresh,
	};
}
