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

type DateCacheData = {
	transcriptionText: string;
	segmentOffsetsSec: number[];
	segmentRecordingIds: number[];
	segmentTimeLabels: string[];
	segmentTimesSec: number[];
	recordingDurations: Record<number, number>;
	extractionsByRecordingId: Record<number, { todos?: TodoItem[] }>;
	timestamp: number;
};

const MAX_CACHE_DAYS = 7;
const CACHE_EXPIRY_MS = MAX_CACHE_DAYS * 24 * 60 * 60 * 1000;

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
	setTranscriptionText: (text: string) => void,
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

	const dateCacheRef = useRef<Map<string, DateCacheData>>(new Map());

	const cleanExpiredCache = useCallback(() => {
		const now = Date.now();
		for (const [dateStr, cache] of dateCacheRef.current.entries()) {
			if (now - cache.timestamp > CACHE_EXPIRY_MS) {
				dateCacheRef.current.delete(dateStr);
			}
		}
	}, []);

	const restoreFromCache = useCallback(
		(dateStr: string) => {
			const cache = dateCacheRef.current.get(dateStr);
			if (!cache) return false;

			if (Date.now() - cache.timestamp > CACHE_EXPIRY_MS) {
				dateCacheRef.current.delete(dateStr);
				return false;
			}

			setTranscriptionText(cache.transcriptionText);
			setSegmentOffsetsSec(cache.segmentOffsetsSec);
			setSegmentRecordingIds(cache.segmentRecordingIds);
			setSegmentTimeLabels(cache.segmentTimeLabels);
			setSegmentTimesSec(cache.segmentTimesSec);
			setRecordingDurations(cache.recordingDurations);
			setExtractionsByRecordingId(cache.extractionsByRecordingId);

			if (cache.segmentRecordingIds.length > 0) {
				const lastRecId = cache.segmentRecordingIds[cache.segmentRecordingIds.length - 1];
				setSelectedRecordingId(lastRecId);
				if (cache.recordingDurations[lastRecId]) {
					setSelectedRecordingDurationSec(cache.recordingDurations[lastRecId]);
				}
			}

			return true;
		},
		[setTranscriptionText],
	);

	const loadRecordings = useCallback(
		async (opts?: { forceSelectLatest?: boolean }) => {
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
		},
		[apiBaseUrl, selectedDate, selectedRecordingId],
	);

	const loadTimeline = useCallback(
		async (onLoadingChange?: (loading: boolean) => void, forceReload = false) => {
			try {
				const dateStr = getDateString(selectedDate);

				if (!forceReload) {
					const cached = restoreFromCache(dateStr);
					if (cached) {
						if (onLoadingChange) onLoadingChange(false);
						return;
					}
				}

				if (onLoadingChange) onLoadingChange(true);

				const response = await fetch(`${apiBaseUrl}/api/audio/timeline?date=${dateStr}`);
				const data = await response.json();

				if (Array.isArray(data.timeline)) {
					setTranscriptionText("");
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
						const recordingStartTime = parseLocalDate(item.start_time);
						const hasPreciseTimestamps =
							Array.isArray(item.segment_timestamps) &&
							item.segment_timestamps.length === lines.length;

						lines.forEach((line: string, idx: number) => {
							segments.push(line);
							const offset = hasPreciseTimestamps
								? (item.segment_timestamps?.[idx] ?? 0)
								: calculateSegmentOffset(recordingStartTime, idx, count, item.duration);
							offsets.push(offset);
							recIds.push(item.id);

							const segmentDate = getSegmentDate(recordingStartTime, offset, selectedDate);
							const label = formatDateTime(segmentDate);
							timeLabels.push(label);
						});
					});

					const combinedText = segments.join("\n");
					setTranscriptionText(combinedText);
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

					const cacheData: DateCacheData = {
						transcriptionText: combinedText,
						segmentOffsetsSec: offsets,
						segmentRecordingIds: recIds,
						segmentTimeLabels: timeLabels,
						segmentTimesSec: offsets,
						recordingDurations: durationMap,
						extractionsByRecordingId,
						timestamp: Date.now(),
					};
					dateCacheRef.current.set(dateStr, cacheData);
					cleanExpiredCache();
				}
			} catch (error) {
				console.error("Failed to load timeline:", error);
			} finally {
				if (onLoadingChange) onLoadingChange(false);
			}
		},
		[
			apiBaseUrl,
			selectedDate,
			setTranscriptionText,
			restoreFromCache,
			cleanExpiredCache,
			extractionsByRecordingId,
		],
	);

	useEffect(() => {
		loadRecordings();
	}, [loadRecordings]);

	useEffect(() => {
		const uniqueIds = Array.from(new Set(segmentRecordingIds.filter((id) => id && id > 0)));
		if (uniqueIds.length === 0) return;
		const controller = new AbortController();

		(async () => {
			try {
				const results = await Promise.all(
					uniqueIds.map(async (id) => {
						const resp = await fetch(`${apiBaseUrl}/api/audio/transcription/${id}`, {
							signal: controller.signal,
						});
						const data = await resp.json();
						const todos: TodoItem[] = Array.isArray(data.todos) ? data.todos : [];
						return { id, todos };
					}),
				);
				setExtractionsByRecordingId((prev) => {
					const next = { ...prev };
					for (const r of results) {
						next[r.id] = { todos: r.todos };
					}

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
	}, [apiBaseUrl, segmentRecordingIds, selectedDate]);

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
		loadRecordings,
		loadTimeline,
	};
}
