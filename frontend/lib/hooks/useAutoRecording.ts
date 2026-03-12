"use client";

import { useCallback, useEffect, useRef } from "react";
import {
	formatDateTime,
	getSegmentDate,
} from "@/apps/audio/utils/timeUtils";
import { useConfig } from "@/lib/query";
import { useAudioRecordingStore } from "@/lib/store/audio-recording-store";

/**
 * 全局自动录音 Hook
 *
 * 在应用启动时，根据"自动启动录音"配置决定是否自动开始录音。
 * - 配置开启：应用启动时自动开始录音
 * - 配置关闭：需要用户在音频面板中手动点击"开始录音"
 *
 * 注意：此 hook 应该在应用入口（如 page.tsx）中调用一次
 */
export function useAutoRecording() {
	const { data: config, isLoading: configLoading } = useConfig();
	const autoStartEnabled = (config?.audioIs24x7 as boolean | undefined) ?? false;

	const isRecording = useAudioRecordingStore((state) => state.isRecording);
	const startRecording = useAudioRecordingStore((state) => state.startRecording);
	const updateLastFinalEnd = useAudioRecordingStore((state) => state.updateLastFinalEnd);
	const appendTranscriptionText = useAudioRecordingStore((state) => state.appendTranscriptionText);
	const setPartialText = useAudioRecordingStore((state) => state.setPartialText);
	const appendSegmentData = useAudioRecordingStore((state) => state.appendSegmentData);
	const setLiveTodos = useAudioRecordingStore((state) => state.setLiveTodos);
	const clearSessionData = useAudioRecordingStore((state) => state.clearSessionData);

	const isStartingRef = useRef(false);
	const hasAutoStartedRef = useRef(false);

	const doStartRecording = useCallback(async () => {
		if (isRecording || isStartingRef.current) {
			console.log("[useAutoRecording] 已在录音中或正在启动，忽略启动请求");
			return false;
		}

		console.log("[useAutoRecording] 开始启动录音...");
		isStartingRef.current = true;

		try {
			clearSessionData();

			await startRecording(
				(text, isFinal) => {
					if (isFinal && text.startsWith("__SEGMENT_SAVED__")) {
						console.log("[useAutoRecording] 收到分段保存通知");
						return;
					}

					if (isFinal) {
						const storeState = useAudioRecordingStore.getState();
						const currentRecordingStartedAt = storeState.recordingStartedAt ?? Date.now();
						const currentLastFinalEndMs = storeState.lastFinalEndMs;
						const segmentStartMs = currentLastFinalEndMs ?? currentRecordingStartedAt;
						const elapsedSec = (segmentStartMs - currentRecordingStartedAt) / 1000;

						updateLastFinalEnd(Date.now());
						appendTranscriptionText(text);

						const start = storeState.recordingStartedDate ?? new Date();
						const segmentDate = getSegmentDate(start, elapsedSec, new Date());
						appendSegmentData({
							timeSec: elapsedSec,
							timeLabel: formatDateTime(segmentDate),
							recordingId: 0,
							offsetSec: elapsedSec,
						});
						setPartialText("");
					} else {
						setPartialText(text);
					}
				},
				(data) => {
					if (Array.isArray(data.todos)) setLiveTodos(data.todos);
				},
				(error) => {
					console.error("[useAutoRecording] Recording error:", error);
				},
				true,
			);

			console.log("[useAutoRecording] ✅ 录音启动成功");
			return true;
		} catch (error) {
			console.error("[useAutoRecording] ❌ 启动录音失败:", error);
			return false;
		} finally {
			isStartingRef.current = false;
		}
	}, [
		isRecording,
		clearSessionData,
		startRecording,
		updateLastFinalEnd,
		appendTranscriptionText,
		appendSegmentData,
		setPartialText,
		setLiveTodos,
	]);

	useEffect(() => {
		if (configLoading) {
			return;
		}

		if (hasAutoStartedRef.current) {
			return;
		}

		if (autoStartEnabled && !isRecording && !isStartingRef.current) {
			console.log("[useAutoRecording] 自动启动录音已开启，准备自动启动...");
			hasAutoStartedRef.current = true;

			const timer = setTimeout(() => {
				doStartRecording();
			}, 1500);

			return () => {
				clearTimeout(timer);
			};
		}
	}, [autoStartEnabled, isRecording, configLoading, doStartRecording]);

	return {
		isRecording,
		autoStartEnabled,
		configLoading,
	};
}
