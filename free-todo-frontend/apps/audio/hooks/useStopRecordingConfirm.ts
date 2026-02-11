"use client";

import { useCallback, useState } from "react";
import { useAudioRecordingStore } from "@/lib/store/audio-recording-store";
import { getAudioApiBaseUrl } from "../utils/getAudioApiBaseUrl";

interface UseStopRecordingConfirmOptions {
	selectedDate: Date;
	stopRecording: (timestamps?: number[]) => void;
	loadRecordings: (options?: { forceSelectLatest?: boolean }) => Promise<void>;
	loadTimeline: (setLoading: (loading: boolean) => void, forceReload?: boolean) => Promise<void>;
}

interface UseStopRecordingConfirmReturn {
	showStopConfirm: boolean;
	isExtracting: boolean;
	isLoadingTimeline: boolean;
	setIsLoadingTimeline: (loading: boolean) => void;
	openStopConfirm: () => void;
	cancelStopConfirm: () => void;
	confirmStop: () => void;
}

/**
 * 管理停止录音确认弹窗和后续轮询逻辑
 */
export function useStopRecordingConfirm({
	selectedDate,
	stopRecording,
	loadRecordings,
	loadTimeline,
}: UseStopRecordingConfirmOptions): UseStopRecordingConfirmReturn {
	const apiBaseUrl = getAudioApiBaseUrl();
	const [showStopConfirm, setShowStopConfirm] = useState(false);
	const [isExtracting, setIsExtracting] = useState(false);
	const [isLoadingTimeline, setIsLoadingTimeline] = useState(false);

	const openStopConfirm = useCallback(() => {
		setShowStopConfirm(true);
	}, []);

	const cancelStopConfirm = useCallback(() => {
		setShowStopConfirm(false);
	}, []);

	const confirmStop = useCallback(() => {
		setShowStopConfirm(false);
		// 从 store 获取时间戳数组
		const storeState = useAudioRecordingStore.getState();
		const timestamps = storeState.segmentTimesSec;
		stopRecording(timestamps.length > 0 ? timestamps : undefined);

		// 停止后后端才会落库录音记录：轮询检查直到新录音出现
		setIsExtracting(true);
		setIsLoadingTimeline(true);

		// 记录停止前的录音数量，用于判断是否有新录音
		let previousRecordingCount = 0;
		let pollCount = 0;
		const maxPolls = 15; // 最多轮询 15 次（约 7.5 秒）

		const checkNewRecording = async () => {
			pollCount++;
			try {
				const dateStr = selectedDate.toISOString().split("T")[0];
				const response = await fetch(`${apiBaseUrl}/api/audio/recordings?date=${dateStr}`);
				const data = await response.json();
				if (data.recordings) {
					const recordings: Array<{ id: number; durationSeconds?: number }> = data.recordings;
					const currentCount = recordings.length;

					// 首次记录数量
					if (previousRecordingCount === 0) {
						previousRecordingCount = currentCount;
					}

					// 如果有新录音，加载最新录音和时间线
					if (currentCount > previousRecordingCount) {
						await loadRecordings({ forceSelectLatest: true });
						await loadTimeline((loading) => {
							setIsLoadingTimeline(loading);
						});

						setTimeout(() => {
							setIsExtracting(false);
							setIsLoadingTimeline(false);
						}, 1500);
						return;
					}

					// 如果已经轮询了足够多次，仍然加载
					if (pollCount >= maxPolls) {
						await loadRecordings({ forceSelectLatest: true });
						await loadTimeline((loading) => {
							setIsLoadingTimeline(loading);
						});
						setTimeout(() => {
							setIsExtracting(false);
							setIsLoadingTimeline(false);
						}, 1000);
						return;
					}
				}
			} catch (error) {
				console.error("Failed to check new recording:", error);
				if (pollCount >= maxPolls) {
					setIsExtracting(false);
					return;
				}
			}

			setTimeout(checkNewRecording, 500);
		};

		setTimeout(checkNewRecording, 800);
	}, [apiBaseUrl, selectedDate, stopRecording, loadRecordings, loadTimeline]);

	return {
		showStopConfirm,
		isExtracting,
		isLoadingTimeline,
		setIsLoadingTimeline,
		openStopConfirm,
		cancelStopConfirm,
		confirmStop,
	};
}
