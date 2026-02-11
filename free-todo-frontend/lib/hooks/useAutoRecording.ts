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

	// 从全局 store 获取状态和方法
	const isRecording = useAudioRecordingStore((state) => state.isRecording);
	const startRecording = useAudioRecordingStore((state) => state.startRecording);
	const updateLastFinalEnd = useAudioRecordingStore((state) => state.updateLastFinalEnd);
	const appendTranscriptionText = useAudioRecordingStore((state) => state.appendTranscriptionText);
	const setPartialText = useAudioRecordingStore((state) => state.setPartialText);
	const setOptimizedText = useAudioRecordingStore((state) => state.setOptimizedText);
	const appendSegmentData = useAudioRecordingStore((state) => state.appendSegmentData);
	const setLiveTodos = useAudioRecordingStore((state) => state.setLiveTodos);
	const clearSessionData = useAudioRecordingStore((state) => state.clearSessionData);

	// 用于防止重复启动
	const isStartingRef = useRef(false);
	const hasAutoStartedRef = useRef(false);

	// 启动录音的核心逻辑
	const doStartRecording = useCallback(async () => {
		if (isRecording || isStartingRef.current) {
			console.log("[useAutoRecording] 已在录音中或正在启动，忽略启动请求");
			return false;
		}

		console.log("[useAutoRecording] 开始启动录音...");
		isStartingRef.current = true;

		try {
			// 清空会话数据
			clearSessionData();

			// 启动录音，始终使用 7×24 模式（启用分段保存和自动重连）
			await startRecording(
				(text, isFinal) => {
					// 处理分段保存通知
					if (isFinal && text.startsWith("__SEGMENT_SAVED__")) {
						console.log("[useAutoRecording] 收到分段保存通知");
						return;
					}

					if (isFinal) {
						// 获取 store 状态计算时间
						const storeState = useAudioRecordingStore.getState();
						const currentRecordingStartedAt = storeState.recordingStartedAt ?? Date.now();
						const currentLastFinalEndMs = storeState.lastFinalEndMs;
						const segmentStartMs = currentLastFinalEndMs ?? currentRecordingStartedAt;
						const elapsedSec = (segmentStartMs - currentRecordingStartedAt) / 1000;

						// 更新时间戳
						updateLastFinalEnd(Date.now());

						// 追加转录文本
						appendTranscriptionText(text);

						// 追加段落数据
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
					if (typeof data.optimizedText === "string") setOptimizedText(data.optimizedText);
					if (Array.isArray(data.todos)) setLiveTodos(data.todos);
				},
				(error) => {
					console.error("[useAutoRecording] Recording error:", error);
				},
				true // 始终使用 7×24 模式
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
		setOptimizedText,
		setLiveTodos,
	]);

	// 应用启动时自动开始录音（仅在配置开启时）
	useEffect(() => {
		// 等待配置加载完成
		if (configLoading) {
			return;
		}

		// 如果已经自动启动过，不再重复启动
		if (hasAutoStartedRef.current) {
			return;
		}

		// 如果配置开启且未在录音中，自动启动录音
		if (autoStartEnabled && !isRecording && !isStartingRef.current) {
			console.log("[useAutoRecording] 自动启动录音已开启，准备自动启动...");
			hasAutoStartedRef.current = true;

			// 延迟一点启动，确保应用完全初始化
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
