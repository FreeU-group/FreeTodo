"use client";

import { useEffect, useMemo, useState } from "react";

interface UseSegmentSyncOptions {
	isRecording: boolean;
	selectedRecordingId: number | null;
	currentTime: number;
	segmentRecordingIds: number[];
	segmentOffsetsSec: number[];
	transcriptionText: string;
}

interface UseSegmentSyncReturn {
	selectedSegmentIndex: number | null;
	setSelectedSegmentIndex: (index: number | null) => void;
	currentSegmentText: string;
}

/**
 * 管理段落选择状态同步
 * - 根据播放时间自动更新选中段落
 * - 计算当前选中段落的文本
 */
export function useSegmentSync({
	isRecording,
	selectedRecordingId,
	currentTime,
	segmentRecordingIds,
	segmentOffsetsSec,
	transcriptionText,
}: UseSegmentSyncOptions): UseSegmentSyncReturn {
	const [selectedSegmentIndex, setSelectedSegmentIndex] = useState<number | null>(null);

	// 根据当前播放时间自动更新选中的文本段（仅回看模式）
	useEffect(() => {
		if (isRecording) return;
		if (!selectedRecordingId) return;
		if (!segmentRecordingIds.length) return;

		const indicesForRec: number[] = [];
		for (let i = 0; i < segmentRecordingIds.length; i++) {
			if (segmentRecordingIds[i] === selectedRecordingId) {
				indicesForRec.push(i);
			}
		}
		if (indicesForRec.length === 0) return;

		// 选取"offset <= currentTime"中最接近 currentTime 的段落
		let bestIndex = indicesForRec[0];
		let bestDiff = Number.POSITIVE_INFINITY;
		for (const idx of indicesForRec) {
			const offset = segmentOffsetsSec[idx] ?? 0;
			const diff = currentTime - offset;
			// 允许一点点负误差
			if (diff >= -0.5 && diff < bestDiff) {
				bestDiff = diff;
				bestIndex = idx;
			}
		}
		if (selectedSegmentIndex !== bestIndex) {
			setSelectedSegmentIndex(bestIndex);
		}
	}, [
		isRecording,
		selectedRecordingId,
		currentTime,
		segmentRecordingIds,
		segmentOffsetsSec,
		selectedSegmentIndex,
	]);

	// 计算当前选中段落的文本
	const currentSegmentText = useMemo(() => {
		if (selectedSegmentIndex == null) return "";
		const lines = transcriptionText.split("\n").filter((s) => s.trim());
		return lines[selectedSegmentIndex] ?? "";
	}, [selectedSegmentIndex, transcriptionText]);

	return {
		selectedSegmentIndex,
		setSelectedSegmentIndex,
		currentSegmentText,
	};
}
