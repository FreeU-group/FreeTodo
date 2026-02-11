"use client";

import { useEffect, useRef } from "react";
import { getLocalDateStringForCompare } from "../utils/timeUtils";

interface UseAudioDateSwitchingProps {
	selectedDate: Date;
	isRecording: boolean;
	isViewingCurrentDate: boolean;
	liveRecordingStateRef: React.MutableRefObject<{
		text: string;
		optimizedText: string;
		partialText: string;
		segmentTimesSec: number[];
		segmentOffsetsSec: number[];
		segmentRecordingIds: number[];
		segmentTimeLabels: string[];
		todos: Array<{ title: string; description?: string; deadline?: string; source_text?: string }>;
	}>;
	currentLoadingDateRef: React.MutableRefObject<string | null>;
	setTranscriptionText: (text: string | ((prev: string) => string)) => void;
	setOptimizedText: (text: string | ((prev: string) => string)) => void;
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
	setOptimizedText,
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

	// 监听日期切换：处理实时文本显示和加载状态
	// 重要：只依赖 selectedDate 的变化，不依赖 state 变量来避免无限循环
	useEffect(() => {
		const currentDateStr = getLocalDateStringForCompare(selectedDate);
		const prevDateStr = prevSelectedDateRef.current;

		// 如果日期没有变化，跳过执行
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

		// 更新 ref
		prevSelectedDateRef.current = currentDateStr;
		prevIsViewingCurrentDateRef.current = isViewingCurrentDate;

		if (isViewingCurrentDate) {
			// 切换到当前日期：显示历史数据 + 实时录音数据
			console.log("切换到当前日期，加载历史数据并合并实时录音状态", {
				liveTextLength: liveRecordingStateRef.current.text.length,
				liveSegmentCount: liveRecordingStateRef.current.segmentTimesSec.length,
			});

			// 先加载该日期的历史数据（已保存的录音）
			setIsLoadingTimeline(true);
			currentLoadingDateRef.current = currentDateStr; // 记录当前加载的日期

			loadTimeline(async (loading) => {
				// 检查日期是否仍然匹配（防止快速切换导致数据错乱）
				if (currentLoadingDateRef.current !== currentDateStr) {
					console.log("日期已切换，忽略此次加载结果");
					return;
				}

				setIsLoadingTimeline(loading);

				// 加载完成后，合并实时录音数据
				if (!loading) {
					// 再次检查日期是否匹配
					if (currentLoadingDateRef.current !== currentDateStr) {
						console.log("日期已切换，忽略此次合并");
						return;
					}

					// 等待一个 tick，确保 loadTimeline 的状态更新已完成
					await new Promise((resolve) => setTimeout(resolve, 0));

					// 再次检查日期是否匹配
					if (currentLoadingDateRef.current !== currentDateStr) {
						console.log("日期已切换，忽略此次合并");
						return;
					}

					const liveState = liveRecordingStateRef.current;

					// 如果实时数据存在，追加到历史数据后面
					if (liveState.text || liveState.partialText) {
						// 合并文本：历史数据 + 实时数据
						setTranscriptionText((prev) => {
							if (!liveState.text) {
								return prev; // 没有实时文本，保持历史数据
							}
							if (!prev) {
								return liveState.text; // 没有历史数据，直接使用实时数据
							}
							// 历史数据 + 实时数据（用换行分隔）
							const needsGap = !prev.endsWith("\n");
							return `${prev}${needsGap ? "\n" : ""}${liveState.text}`;
						});

						// 合并时间戳数组
						setSegmentTimesSec((prev) => [...prev, ...liveState.segmentTimesSec]);
						setSegmentOffsetsSec((prev) => [...prev, ...liveState.segmentOffsetsSec]);
						setSegmentRecordingIds((prev) => [...prev, ...liveState.segmentRecordingIds]);
						setSegmentTimeLabels((prev) => [...prev, ...liveState.segmentTimeLabels]);

						// 实时数据覆盖优化文本和高亮（因为是最新的）
						if (liveState.optimizedText) {
							setOptimizedText(liveState.optimizedText);
						}
						setPartialText(liveState.partialText);
						setLiveTodos(liveState.todos);
					}
				}
			});
		} else {
			// 切换到其他日期：只加载历史数据，不影响录音状态
			console.log("切换到其他日期，加载历史数据，录音状态保持不变", {
				selectedDate: currentDateStr,
			});

			setIsLoadingTimeline(true);
			currentLoadingDateRef.current = currentDateStr; // 记录当前加载的日期

			// 清空当前显示，准备加载历史数据（回看状态）
			// 注意：这不会影响 liveRecordingStateRef（录音状态）
			setTranscriptionText("");
			setOptimizedText("");
			setPartialText("");
			setSegmentTimesSec([]);
			setSegmentOffsetsSec([]);
			setSegmentRecordingIds([]);
			setSegmentTimeLabels([]);
			setLiveTodos([]);

			// 加载该日期的时间线（回看数据）
			loadTimeline((loading) => {
				// 检查日期是否仍然匹配（防止快速切换导致数据错乱）
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
		setOptimizedText,
		setPartialText,
		setLiveTodos,
		setIsLoadingTimeline,
		currentLoadingDateRef,
		liveRecordingStateRef,
	]);
}
