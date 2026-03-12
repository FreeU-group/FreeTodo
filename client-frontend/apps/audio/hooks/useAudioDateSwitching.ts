"use client";

import { useEffect, useRef } from "react";
import { getLocalDateStringForCompare } from "../utils/timeUtils";

interface UseAudioDateSwitchingProps {
	selectedDate: Date;
	isRecording: boolean;
	isViewingCurrentDate: boolean;
	liveRecordingStateRef: React.MutableRefObject<{
		text: string;
		partialText: string;
		segmentTimesSec: number[];
		segmentOffsetsSec: number[];
		segmentRecordingIds: number[];
		segmentTimeLabels: string[];
		todos: Array<{ title: string; description?: string; deadline?: string; source_text?: string }>;
	}>;
	currentLoadingDateRef: React.MutableRefObject<string | null>;
	setTranscriptionText: (text: string | ((prev: string) => string)) => void;
	setPartialText: (text: string) => void;
	setSegmentTimesSec: (times: number[] | ((prev: number[]) => number[])) => void;
	setSegmentOffsetsSec: (offsets: number[] | ((prev: number[]) => number[])) => void;
	setSegmentRecordingIds: (ids: number[] | ((prev: number[]) => number[])) => void;
	setSegmentTimeLabels: (labels: string[] | ((prev: string[]) => string[])) => void;
	setLiveTodos: (todos: Array<{ title: string; description?: string; deadline?: string; source_text?: string }>) => void;
	setIsLoadingTimeline: (loading: boolean) => void;
	loadTimeline: (callback: (loading: boolean) => void, forceReload?: boolean) => void;
}

export function useAudioDateSwitching({
	selectedDate,
	isRecording,
	isViewingCurrentDate,
	liveRecordingStateRef,
	currentLoadingDateRef,
	setTranscriptionText,
	setPartialText,
	setSegmentTimesSec,
	setSegmentOffsetsSec,
	setSegmentRecordingIds,
	setSegmentTimeLabels,
	setLiveTodos,
	setIsLoadingTimeline,
	loadTimeline,
}: UseAudioDateSwitchingProps) {
	const prevSelectedDateRef = useRef<string | null>(null);
	const prevIsViewingCurrentDateRef = useRef<boolean | null>(null);

	useEffect(() => {
		const currentDateStr = getLocalDateStringForCompare(selectedDate);
		const prevDateStr = prevSelectedDateRef.current;

		if (prevDateStr === currentDateStr && prevIsViewingCurrentDateRef.current === isViewingCurrentDate) {
			return;
		}

		console.log("日期切换检查:", {
			isViewingCurrentDate,
			isRecording,
			hasLiveData: liveRecordingStateRef.current.text.length > 0,
			prevDate: prevDateStr,
			currentDate: currentDateStr,
		});

		prevSelectedDateRef.current = currentDateStr;
		prevIsViewingCurrentDateRef.current = isViewingCurrentDate;

		if (isViewingCurrentDate) {
			console.log("切换到当前日期，加载历史数据并合并实时录音状态", {
				liveTextLength: liveRecordingStateRef.current.text.length,
				liveSegmentCount: liveRecordingStateRef.current.segmentTimesSec.length,
			});

			setIsLoadingTimeline(true);
			currentLoadingDateRef.current = currentDateStr;

			loadTimeline(async (loading) => {
				if (currentLoadingDateRef.current !== currentDateStr) {
					console.log("日期已切换，忽略此次加载结果");
					return;
				}

				setIsLoadingTimeline(loading);

				if (!loading) {
					if (currentLoadingDateRef.current !== currentDateStr) {
						console.log("日期已切换，忽略此次合并");
						return;
					}

					await new Promise((resolve) => setTimeout(resolve, 0));

					if (currentLoadingDateRef.current !== currentDateStr) {
						console.log("日期已切换，忽略此次合并");
						return;
					}

					const liveState = liveRecordingStateRef.current;

					if (liveState.text || liveState.partialText) {
						setTranscriptionText((prev) => {
							if (!liveState.text) {
								return prev;
							}
							if (!prev) {
								return liveState.text;
							}
							const needsGap = !prev.endsWith("\n");
							return `${prev}${needsGap ? "\n" : ""}${liveState.text}`;
						});

						setSegmentTimesSec((prev) => [...prev, ...liveState.segmentTimesSec]);
						setSegmentOffsetsSec((prev) => [...prev, ...liveState.segmentOffsetsSec]);
						setSegmentRecordingIds((prev) => [...prev, ...liveState.segmentRecordingIds]);
						setSegmentTimeLabels((prev) => [...prev, ...liveState.segmentTimeLabels]);
						setPartialText(liveState.partialText);
						setLiveTodos(liveState.todos);
					}
				}
			});
		} else {
			console.log("切换到其他日期，加载历史数据，录音状态保持不变", {
				selectedDate: currentDateStr,
			});

			setIsLoadingTimeline(true);
			currentLoadingDateRef.current = currentDateStr;

			setTranscriptionText("");
			setPartialText("");
			setSegmentTimesSec([]);
			setSegmentOffsetsSec([]);
			setSegmentRecordingIds([]);
			setSegmentTimeLabels([]);
			setLiveTodos([]);

			loadTimeline((loading) => {
				if (currentLoadingDateRef.current !== currentDateStr) {
					console.log("日期已切换，忽略此次加载结果");
					return;
				}
				setIsLoadingTimeline(loading);
			});
		}
	}, [
		selectedDate,
		isRecording,
		isViewingCurrentDate,
		loadTimeline,
		setSegmentOffsetsSec,
		setSegmentRecordingIds,
		setSegmentTimeLabels,
		setSegmentTimesSec,
		setTranscriptionText,
		setPartialText,
		setLiveTodos,
		setIsLoadingTimeline,
		currentLoadingDateRef,
		liveRecordingStateRef,
	]);
}
