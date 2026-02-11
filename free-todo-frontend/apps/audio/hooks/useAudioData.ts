"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioApiBaseUrl } from "../utils/getAudioApiBaseUrl";
import {
	calculateSegmentOffset,
	formatDateTime,
	getDateString,
	getSegmentDate,
	parseLocalDate,
} from "../utils/timeUtils";

// 日期数据缓存（最多保存7天）
type DateCacheData = {
	transcriptionText: string;
	optimizedText: string;
	segmentOffsetsSec: number[];
	segmentRecordingIds: number[];
	segmentTimeLabels: string[];
	segmentTimesSec: number[];
	recordingDurations: Record<number, number>;
	extractionsByRecordingId: Record<number, { todos?: TodoItem[] }>;
	optimizedExtractionsByRecordingId: Record<number, { todos?: TodoItem[] }>;
	timestamp: number; // 缓存时间戳
};

const MAX_CACHE_DAYS = 7;
const CACHE_EXPIRY_MS = MAX_CACHE_DAYS * 24 * 60 * 60 * 1000; // 7天过期

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

export function useAudioData(
	selectedDate: Date,
	activeTab: "original" | "optimized",
	setTranscriptionText: (text: string) => void,
	setOptimizedText: (text: string) => void,
	// isRecording 参数已移除，日期切换逻辑现在在 AudioPanel 中处理
) {
	const apiBaseUrl = getAudioApiBaseUrl();
	const [selectedRecordingId, setSelectedRecordingId] = useState<number | null>(null);
	const [selectedRecordingDurationSec, setSelectedRecordingDurationSec] = useState<number>(0);
	const [recordingDurations, setRecordingDurations] = useState<Record<number, number>>({});
	const [segmentOffsetsSec, setSegmentOffsetsSec] = useState<number[]>([]);
	const [segmentRecordingIds, setSegmentRecordingIds] = useState<number[]>([]);
	const [segmentTimeLabels, setSegmentTimeLabels] = useState<string[]>([]);
	const [segmentTimesSec, setSegmentTimesSec] = useState<number[]>([]);
	const [extractionsByRecordingId, setExtractionsByRecordingId] = useState<
		Record<number, { todos?: TodoItem[] }>
	>({});
	const [optimizedExtractionsByRecordingId, setOptimizedExtractionsByRecordingId] = useState<
		Record<number, { todos?: TodoItem[] }>
	>({});

	// 数据缓存：按日期字符串存储
	const dateCacheRef = useRef<Map<string, DateCacheData>>(new Map());

	// 清理过期缓存
	const cleanExpiredCache = useCallback(() => {
		const now = Date.now();
		for (const [dateStr, cache] of dateCacheRef.current.entries()) {
			if (now - cache.timestamp > CACHE_EXPIRY_MS) {
				dateCacheRef.current.delete(dateStr);
			}
		}
	}, []);

	// 从缓存恢复数据
	const restoreFromCache = useCallback((dateStr: string, tab: "original" | "optimized") => {
		const cache = dateCacheRef.current.get(dateStr);
		if (!cache) return false;

		// 检查缓存是否过期
		if (Date.now() - cache.timestamp > CACHE_EXPIRY_MS) {
			dateCacheRef.current.delete(dateStr);
			return false;
		}

		// 恢复数据：恢复当前 tab 的文本，但保留另一个 tab 的文本（如果存在）
		if (tab === "original") {
			setTranscriptionText(cache.transcriptionText);
			// 如果缓存中有 optimized 文本，也恢复它（避免切换 tab 时丢失）
			if (cache.optimizedText) {
				setOptimizedText(cache.optimizedText);
			}
		} else {
			setOptimizedText(cache.optimizedText);
			// 如果缓存中有 original 文本，也恢复它（避免切换 tab 时丢失）
			if (cache.transcriptionText) {
				setTranscriptionText(cache.transcriptionText);
			}
		}
		setSegmentOffsetsSec(cache.segmentOffsetsSec);
		setSegmentRecordingIds(cache.segmentRecordingIds);
		setSegmentTimeLabels(cache.segmentTimeLabels);
		setSegmentTimesSec(cache.segmentTimesSec);
		setRecordingDurations(cache.recordingDurations);
		setExtractionsByRecordingId(cache.extractionsByRecordingId);
		setOptimizedExtractionsByRecordingId(cache.optimizedExtractionsByRecordingId);

		// 恢复选中的录音ID
		if (cache.segmentRecordingIds.length > 0) {
			const lastRecId = cache.segmentRecordingIds[cache.segmentRecordingIds.length - 1];
			setSelectedRecordingId(lastRecId);
			if (cache.recordingDurations[lastRecId]) {
				setSelectedRecordingDurationSec(cache.recordingDurations[lastRecId]);
			}
		}

		return true;
	}, [setTranscriptionText, setOptimizedText]);


	const loadRecordings = useCallback(async (opts?: { forceSelectLatest?: boolean }) => {
		try {
			const dateStr = getDateString(selectedDate);
			const response = await fetch(`${apiBaseUrl}/api/audio/recordings?date=${dateStr}`);
			const data = await response.json();
			if (data.recordings) {
				const recordings: Array<{ id: number; durationSeconds?: number }> = data.recordings;
				if (recordings.length > 0) {
					const latest = recordings[recordings.length - 1];
					const hasSelected =
						selectedRecordingId && recordings.some((r) => r.id === selectedRecordingId);
					if (opts?.forceSelectLatest || !hasSelected) {
						setSelectedRecordingId(latest.id);
						setSelectedRecordingDurationSec(Number(latest.durationSeconds ?? 0));
					}
				} else if (opts?.forceSelectLatest) {
					setSelectedRecordingId(null);
					setSelectedRecordingDurationSec(0);
				}
			}
		} catch (error) {
			console.error("Failed to load recordings:", error);
		}
	}, [apiBaseUrl, selectedDate, selectedRecordingId]);

	const loadTimeline = useCallback(async (onLoadingChange?: (loading: boolean) => void, forceReload = false) => {
		try {
			const dateStr = getDateString(selectedDate);

			// 检查缓存
			if (!forceReload) {
				const cached = restoreFromCache(dateStr, activeTab);
				if (cached) {
					console.log("从缓存恢复数据:", dateStr);
					if (onLoadingChange) onLoadingChange(false);
					return;
				}
			}

			// 通知开始加载
			if (onLoadingChange) onLoadingChange(true);

			const response = await fetch(
				`${apiBaseUrl}/api/audio/timeline?date=${dateStr}&optimized=${activeTab === "optimized"}`
			);
			const data = await response.json();

			if (Array.isArray(data.timeline)) {
				// 先清空数据，但保持加载状态直到数据处理完成
				setTranscriptionText("");
				setOptimizedText("");
				setSegmentOffsetsSec([]);
				setSegmentRecordingIds([]);
				setSegmentTimeLabels([]);
				setSegmentTimesSec([]);
				const segments: string[] = [];
				const offsets: number[] = [];
				const timeLabels: string[] = [];
				const recIds: number[] = [];
				const durationMap: Record<number, number> = {};

				data.timeline.forEach((item: {
					id: number;
					start_time: string;
					duration: number;
					text: string;
					segment_timestamps?: number[];
				}) => {
					durationMap[item.id] = item.duration;
					const lines = (item.text || "").split("\n").filter((s: string) => s.trim());
					const count = Math.max(1, lines.length);

					// 使用本地时区解析录音开始时间
					const recordingStartTime = parseLocalDate(item.start_time);

					// 如果 API 返回了精确时间戳，使用它们；否则使用均匀分配
					const hasPreciseTimestamps = Array.isArray(item.segment_timestamps) &&
						item.segment_timestamps.length === lines.length;

					lines.forEach((line: string, idx: number) => {
						segments.push(line);
						// 优先使用 API 返回的精确时间戳，否则使用均匀分配
						const offset = hasPreciseTimestamps
							? (item.segment_timestamps?.[idx] ?? 0)
							: calculateSegmentOffset(
									recordingStartTime,
									idx,
									count,
									item.duration
								);
						offsets.push(offset);
						recIds.push(item.id);

						// 计算文本段的绝对时间（处理跨日期情况）
						const segmentDate = getSegmentDate(recordingStartTime, offset, selectedDate);
						const label = formatDateTime(segmentDate);
						timeLabels.push(label);
					});
				});

				const combinedText = segments.join("\n");
				if (activeTab === "original") {
					setTranscriptionText(combinedText);
				} else {
					setOptimizedText(combinedText);
				}
				setSegmentTimesSec(offsets);
				setSegmentOffsetsSec(offsets);
				setSegmentRecordingIds(recIds);
				setSegmentTimeLabels(timeLabels);
				setRecordingDurations(durationMap);
				if (recIds.length > 0) {
					const lastRecId = recIds[recIds.length - 1];
					setSelectedRecordingId(lastRecId);
					if (durationMap[lastRecId]) {
						setSelectedRecordingDurationSec(durationMap[lastRecId]);
					}
				}

				// 保存到缓存：保留之前 tab 的文本（如果存在），更新当前 tab 的文本
				const existingCache = dateCacheRef.current.get(dateStr);
				const cacheData: DateCacheData = {
					transcriptionText: activeTab === "original"
						? combinedText
						: (existingCache?.transcriptionText || ""),
					optimizedText: activeTab === "optimized"
						? combinedText
						: (existingCache?.optimizedText || ""),
					segmentOffsetsSec: offsets,
					segmentRecordingIds: recIds,
					segmentTimeLabels: timeLabels,
					segmentTimesSec: offsets,
					recordingDurations: durationMap,
					extractionsByRecordingId: extractionsByRecordingId, // 使用当前状态
					optimizedExtractionsByRecordingId: optimizedExtractionsByRecordingId, // 使用当前状态
					timestamp: Date.now(),
				};
				dateCacheRef.current.set(dateStr, cacheData);
				cleanExpiredCache();
			}
		} catch (error) {
			console.error("Failed to load timeline:", error);
		} finally {
			// 通知加载完成
			if (onLoadingChange) onLoadingChange(false);
		}
	}, [activeTab, apiBaseUrl, selectedDate, setTranscriptionText, setOptimizedText, restoreFromCache, cleanExpiredCache, extractionsByRecordingId, optimizedExtractionsByRecordingId]);

	useEffect(() => {
		loadRecordings();
	}, [loadRecordings]);

	// 注意：这个 useEffect 已经被 AudioPanel 中的日期切换逻辑替代
	// 保留此逻辑作为备用，但主要逻辑在 AudioPanel 中处理
	// useEffect(() => {
	// 	// 如果正在录音，需要判断是否查看当前日期
	// 	// - 如果查看当前日期：不加载时间线，保留实时录音文本显示
	// 	// - 如果查看其他日期：加载该日期的时间线（回看模式），不影响录音
	// 	if (isRecording) {
	// 		const now = new Date();
	// 		const nowDateStr = now.toISOString().split("T")[0];
	// 		const selectedDateStr = getDateString(selectedDate);
	// 		const isViewingCurrentDate = selectedDateStr === nowDateStr;
	//
	// 		// 如果查看其他日期，加载该日期的时间线（回看模式）
	// 		if (!isViewingCurrentDate) {
	// 			loadTimeline();
	// 		}
	// 		// 如果查看当前日期，不加载时间线，保留实时录音文本
	// 		return;
	// 	}
	// 	// 停止录音后，延迟加载时间线，给后端时间保存录音
	// 	// 这样避免立即清空文本，让用户看到"获取中"状态
	// 	const timer = setTimeout(() => {
	// 		loadTimeline();
	// 	}, 1000); // 延迟 1 秒，给后端时间保存

	// 	return () => clearTimeout(timer);
	// }, [loadTimeline, isRecording, selectedDate]);

	// 按录音ID加载对应的转录提取结果（用于整天时间线所有录音的持久化高亮）
	useEffect(() => {
		const uniqueIds = Array.from(new Set(segmentRecordingIds.filter((id) => id && id > 0)));
		if (uniqueIds.length === 0) return;
		const controller = new AbortController();
		const isOptimized = activeTab === "optimized";

		(async () => {
			try {
				const results = await Promise.all(
					uniqueIds.map(async (id) => {
						const resp = await fetch(
							`${apiBaseUrl}/api/audio/transcription/${id}?optimized=${isOptimized}`,
							{ signal: controller.signal }
						);
							const data = await resp.json();
							const todos: TodoItem[] = Array.isArray(data.todos) ? data.todos : [];
							return { id, todos };
						})
					);
					setExtractionsByRecordingId((prev) => {
						const next = { ...prev };
						for (const r of results) {
							next[r.id] = { todos: r.todos };
						}
					// 更新缓存
					const dateStr = getDateString(selectedDate);
					const cache = dateCacheRef.current.get(dateStr);
					if (cache) {
						cache.extractionsByRecordingId = next;
						cache.timestamp = Date.now();
					}
					return next;
				});
			} catch (e) {
				if ((e as Error).name !== "AbortError") {
					console.error("Failed to load transcription extraction:", e);
				}
			}
		})();

		return () => controller.abort();
	}, [apiBaseUrl, segmentRecordingIds, activeTab, selectedDate]);

	// 单独加载优化文本的提取结果，用于"关联到待办"弹窗
	useEffect(() => {
		const uniqueIds = Array.from(new Set(segmentRecordingIds.filter((id) => id && id > 0)));
		if (uniqueIds.length === 0) return;
		const controller = new AbortController();
		const missingIds = uniqueIds.filter((id) => !optimizedExtractionsByRecordingId[id]);
		if (missingIds.length === 0) return;

		(async () => {
			try {
				const results = await Promise.all(
					missingIds.map(async (id) => {
						const resp = await fetch(`${apiBaseUrl}/api/audio/transcription/${id}?optimized=true`, {
							signal: controller.signal,
						});
							const data = await resp.json();
							const todos: TodoItem[] = Array.isArray(data.todos) ? data.todos : [];
							return { id, todos };
						})
					);
					setOptimizedExtractionsByRecordingId((prev) => {
						const next = { ...prev };
						for (const r of results) {
							next[r.id] = { todos: r.todos };
						}
					// 更新缓存
					const dateStr = getDateString(selectedDate);
					const cache = dateCacheRef.current.get(dateStr);
					if (cache) {
						cache.optimizedExtractionsByRecordingId = next;
						cache.timestamp = Date.now();
					}
					return next;
				});
			} catch (e) {
				if ((e as Error).name !== "AbortError") {
					console.error("Failed to load optimized transcription extraction:", e);
				}
			}
		})();

		return () => controller.abort();
	}, [apiBaseUrl, segmentRecordingIds, optimizedExtractionsByRecordingId, selectedDate]);

	return {
		selectedRecordingId,
		setSelectedRecordingId,
		selectedRecordingDurationSec,
		setSelectedRecordingDurationSec,
		recordingDurations,
		setRecordingDurations,
		segmentOffsetsSec,
		setSegmentOffsetsSec,
		segmentRecordingIds,
		setSegmentRecordingIds,
		segmentTimeLabels,
		setSegmentTimeLabels,
		segmentTimesSec,
		setSegmentTimesSec,
		extractionsByRecordingId,
		setExtractionsByRecordingId,
		optimizedExtractionsByRecordingId,
		setOptimizedExtractionsByRecordingId,
		loadRecordings,
		loadTimeline, // 暴露 loadTimeline，允许手动触发
	};
}
