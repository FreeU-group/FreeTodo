"use client";

import { useCallback } from "react";
import { useAudioRecordingStore } from "@/lib/store/audio-recording-store";

/**
 * 音频录音 Hook
 *
 * 使用全局 store 管理录音状态，确保面板切换时录音不会中断。
 * 这个 hook 是对 useAudioRecordingStore 的封装，提供与原来相同的接口。
 */
export function useAudioRecording() {
	const isRecording = useAudioRecordingStore((state) => state.isRecording);
	const startRecordingAction = useAudioRecordingStore((state) => state.startRecording);
	const stopRecordingAction = useAudioRecordingStore((state) => state.stopRecording);

	const startRecording = useCallback(
		async (
			onTranscription: (text: string, isFinal: boolean) => void,
			onRealtimeNlp?: (data: {
				todos?: Array<{ title: string; description?: string; deadline?: string }>;
			}) => void,
			onError?: (error: Error) => void,
			is24x7: boolean = false,
		) => {
			await startRecordingAction(onTranscription, onRealtimeNlp, onError, is24x7);
		},
		[startRecordingAction],
	);

	const stopRecording = useCallback(
		(segmentTimestamps?: number[]) => {
			stopRecordingAction(segmentTimestamps);
		},
		[stopRecordingAction],
	);

	return {
		isRecording,
		startRecording,
		stopRecording,
	};
}
