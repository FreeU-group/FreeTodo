"use client";

import { useCallback, useEffect, useRef } from "react";
import { toastInfo } from "@/lib/toast";
import { getLocalDateStringForCompare } from "../utils/timeUtils";
import { useAudioRecording } from "./useAudioRecording";

interface UseAudioRecordingControlProps {
	is24x7Enabled: boolean;
	configLoading: boolean;
	selectedDateRef: React.MutableRefObject<Date>;
	currentRecordingDateRef: React.MutableRefObject<Date | null>;
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
	recordingStartedAtMsRef: React.MutableRefObject<number>;
	recordingStartedAtRef: React.MutableRefObject<Date | null>;
	lastFinalEndMsRef: React.MutableRefObject<number | null>;
	setTranscriptionText: (text: string | ((prev: string) => string)) => void;
	setOptimizedText: (text: string | ((prev: string) => string)) => void;
	setPartialText: (text: string) => void;
	setSegmentTimesSec: (times: number[] | ((prev: number[]) => number[])) => void;
	setSegmentOffsetsSec: (offsets: number[] | ((prev: number[]) => number[])) => void;
	setSegmentRecordingIds: (ids: number[] | ((prev: number[]) => number[])) => void;
	setSegmentTimeLabels: (labels: string[] | ((prev: string[]) => string[])) => void;
	setLiveTodos: (todos: Array<{ title: string; description?: string; deadline?: string; source_text?: string }>) => void;
	setSelectedSegmentIndex: (index: number | null) => void;
	loadTimeline: (callback: (loading: boolean) => void, forceReload?: boolean) => void;
	setIsLoadingTimeline: (loading: boolean) => void;
	formatDateTime: (date: Date) => string;
	getSegmentDate: (start: Date, elapsedSec: number, currentDate: Date) => Date;
}

export function useAudioRecordingControl({
	is24x7Enabled,
	configLoading,
	selectedDateRef,
	currentRecordingDateRef,
	liveRecordingStateRef,
	recordingStartedAtMsRef,
	recordingStartedAtRef,
	lastFinalEndMsRef,
	setTranscriptionText,
	setOptimizedText,
	setPartialText,
	setSegmentTimesSec,
	setSegmentOffsetsSec,
	setSegmentRecordingIds,
	setSegmentTimeLabels,
	setLiveTodos,
	setSelectedSegmentIndex,
	loadTimeline,
	setIsLoadingTimeline,
	formatDateTime,
	getSegmentDate,
}: UseAudioRecordingControlProps) {
	const { isRecording, startRecording, stopRecording } = useAudioRecording();
	const isRecordingRef = useRef(false);
	const prevConfigRef = useRef<boolean | undefined>(undefined);
	const isStartingRef = useRef(false);

	// 启动录音的内部函数（可复用）
	const startRecordingInternal = useCallback(async () => {
		// 使用 ref 检查，避免闭包问题
		if (isRecordingRef.current) {
			console.log("已经在录音中，跳过启动");
			return; // 已经在录音中，不重复启动
		}

		console.log("开始启动录音...");

		// 录音始终使用当前日期，不管用户在看哪个日期（回看模式）
		const now = new Date();
		const nowDateStr = getLocalDateStringForCompare(now);
		currentRecordingDateRef.current = now;

		// 如果用户正在查看当前日期，保留已有文本；如果查看其他日期，不影响回看模式
		// 使用 ref 获取最新的 selectedDate，避免依赖项变化导致重新创建
		const currentSelectedDate = selectedDateRef.current;
		const selectedDateStr = getLocalDateStringForCompare(currentSelectedDate);
		const isViewingCurrentDate = selectedDateStr === nowDateStr;

		// 只有在查看当前日期时，才保留已有文本并追加新内容
		// 如果查看其他日期，录音在后台进行，不影响回看模式的显示
		if (isViewingCurrentDate) {
			// 查看当前日期：保留已有文本，在末尾追加新内容
			setSelectedSegmentIndex(null);
		} else {
			// 查看其他日期：录音在后台进行，不影响回看模式的显示
			// 不修改 transcriptionText 等状态，让回看模式继续显示历史录音
		}

		// 标记正在启动，防止重复启动
		isRecordingRef.current = true;

		// 录制开始：记录起始时间用于段落时间标签
		recordingStartedAtMsRef.current = performance.now();
		recordingStartedAtRef.current = now;
	lastFinalEndMsRef.current = null; // 重置，第一段文本使用录音开始时间
	// 开始录音前，清空本次会话的实时高亮状态
	setLiveTodos([]);

		console.log("准备调用 startRecording，isRecordingRef.current:", isRecordingRef.current);
		await startRecording(
			(text, isFinal) => {
				// 每次回调都检查当前日期，确保使用最新的 selectedDate
				const now = new Date();
				const nowDateStr = getLocalDateStringForCompare(now);
				const currentSelectedDate = selectedDateRef.current;
				const selectedDateStr = getLocalDateStringForCompare(currentSelectedDate);
				const isViewingCurrentDate = selectedDateStr === nowDateStr;

				// 调试日志：帮助排查日期匹配问题
				if (isFinal && text.length > 0 && text !== "__SEGMENT_SAVED__") {
					console.log("录音回调日期检查:", {
						nowDateStr,
						selectedDateStr,
						isViewingCurrentDate,
						text: text.substring(0, 20),
					});
				}

				// 处理分段保存通知
				if (isFinal && text.startsWith("__SEGMENT_SAVED__")) {
					// 提取分段保存的原因
					const reason = text.replace("__SEGMENT_SAVED__:", "") || "分段保存";

					// 显示状态提示
					if (reason.includes("30分钟")) {
						toastInfo("达到30分钟分段时间，保存当前段并开始新段", { duration: 3000 });
					} else if (reason.includes("静音")) {
						const silenceMatch = reason.match(/(\d+)秒/);
						if (silenceMatch) {
							const seconds = parseInt(silenceMatch[1], 10);
							const minutes = Math.floor(seconds / 60);
							toastInfo(`检测到长时间静音（${minutes > 0 ? `${minutes}分` : ""}${seconds % 60}秒），保存当前段并开始新段`, { duration: 3000 });
						} else {
							toastInfo(reason, { duration: 3000 });
						}
					} else {
						toastInfo(reason, { duration: 3000 });
					}

					// 分段已保存，重置时间戳和文本（但保留已显示的文本，因为已经保存到后端）
					// 重置录音开始时间，用于新段的时间戳计算
					recordingStartedAtMsRef.current = performance.now();
					recordingStartedAtRef.current = new Date();
					lastFinalEndMsRef.current = null;

					// 清空 liveRecordingStateRef，因为数据已经保存到后端
					liveRecordingStateRef.current = {
						text: "",
						optimizedText: "",
						partialText: "",
						segmentTimesSec: [],
						segmentOffsetsSec: [],
						segmentRecordingIds: [],
						segmentTimeLabels: [],
						todos: [],
					};

					// 如果正在查看当前日期，需要重新加载时间线以显示已保存的历史数据
					if (isViewingCurrentDate) {
						// 清空实时状态（因为已保存到后端）
						setPartialText("");
						setLiveTodos([]);

						// 延迟重新加载时间线，给后端时间保存数据
						setTimeout(() => {
							// 检查是否仍在查看当前日期
							const currentSelectedDate = selectedDateRef.current;
							const currentDateStr = getLocalDateStringForCompare(new Date());
							const selectedDateStr = getLocalDateStringForCompare(currentSelectedDate);
							if (selectedDateStr === currentDateStr) {
								// 强制重新加载时间线，显示已保存的历史数据
								setIsLoadingTimeline(true);
								loadTimeline((loading) => {
									setIsLoadingTimeline(loading);
								}, true); // forceReload = true，强制重新加载
							}
						}, 1000); // 延迟1秒，确保后端已保存
					}
					// 更新当前录音日期
					currentRecordingDateRef.current = now;
					return;
				}

				// 规则：
				// - final=false：作为"未完成文本"斜体显示（不落盘）
				// - final=true：替换掉未完成文本，并把最终句追加到正文
				if (isFinal) {
					// 使用前一个 final 文本的结束时间作为当前文本的开始时间
					// 对于第一段文本，使用录音开始时间
					// 这样能更准确地对应到音频开始位置，避免 ASR 处理延迟的影响
					const segmentStartMs = lastFinalEndMsRef.current ?? recordingStartedAtMsRef.current;
					const elapsedSec = (segmentStartMs - recordingStartedAtMsRef.current) / 1000;

					// 记录当前 final 文本的结束时间，作为下一段文本的开始时间
					lastFinalEndMsRef.current = performance.now();

					// 计算新的时间标签
					const start = recordingStartedAtRef.current ?? new Date();
					const currentDate = currentRecordingDateRef.current ?? new Date();
					const segmentDate = getSegmentDate(start, elapsedSec, currentDate);
					const newTimeLabel = formatDateTime(segmentDate);

					// 始终更新 liveRecordingStateRef（持久化状态），无论是否在查看当前日期
					// 这样切换回当前日期时可以恢复
					const currentLive = liveRecordingStateRef.current;
					const needsGap = currentLive.text && !currentLive.text.endsWith("\n");
					liveRecordingStateRef.current = {
						...currentLive,
						text: `${currentLive.text}${needsGap ? "\n" : ""}${text}\n`,
						segmentTimesSec: [...currentLive.segmentTimesSec, elapsedSec],
						segmentOffsetsSec: [...currentLive.segmentOffsetsSec, elapsedSec],
						segmentRecordingIds: [...currentLive.segmentRecordingIds, 0],
						segmentTimeLabels: [...currentLive.segmentTimeLabels, newTimeLabel],
						partialText: "", // final 文本到达时，清空 partial
					};

					// 如果不在当前日期，只更新 ref，不更新 UI
					if (!isViewingCurrentDate) {
						return;
					}

					// 查看当前日期：追加文本到现有内容（历史数据 + 实时数据）
					setTranscriptionText((prev) => {
						// 如果已有文本且不以换行结尾，添加换行
						const needsGap = prev && !prev.endsWith("\n");
						return `${prev}${needsGap ? "\n" : ""}${text}\n`;
					});
					setSegmentTimesSec((prev) => [...prev, elapsedSec]);
					setSegmentOffsetsSec((prev) => [...prev, elapsedSec]);
					setSegmentRecordingIds((prev) => [...prev, 0]);
					setSegmentTimeLabels((prev) => [...prev, newTimeLabel]);
					setPartialText("");
				} else {
					// partial 文本：始终更新持久化状态
					liveRecordingStateRef.current = {
						...liveRecordingStateRef.current,
						partialText: text,
					};

					// 只有在查看当前日期时才更新 UI
					if (isViewingCurrentDate) {
						setPartialText(text);
					}
				}
			},
			(data) => {
				// 每次回调都检查当前日期
				const now = new Date();
				const nowDateStr = getLocalDateStringForCompare(now);
				const currentSelectedDate = selectedDateRef.current;
				const selectedDateStr = getLocalDateStringForCompare(currentSelectedDate);
				const isViewingCurrentDate = selectedDateStr === nowDateStr;

				// 始终更新持久化状态，无论是否在查看当前日期
				if (typeof data.optimizedText === "string") {
					liveRecordingStateRef.current = {
						...liveRecordingStateRef.current,
						optimizedText: data.optimizedText,
					};
				}
				if (Array.isArray(data.todos)) {
					liveRecordingStateRef.current = {
						...liveRecordingStateRef.current,
						todos: data.todos,
					};
				}

				// 如果不在当前日期，只更新 ref，不更新 UI
				if (!isViewingCurrentDate) {
					return;
				}

				// 查看当前日期：同步更新 UI 状态
				if (typeof data.optimizedText === "string") setOptimizedText(data.optimizedText);
				if (Array.isArray(data.todos)) setLiveTodos(data.todos);
			},
			(error) => {
				console.error("Recording error:", error);
				// 显示用户友好的错误提示
				// toastError 需要从外部传入，这里只记录日志
			},
			is24x7Enabled
		);
	}, [
		startRecording,
		is24x7Enabled,
		setSegmentOffsetsSec,
		setSegmentRecordingIds,
		setSegmentTimeLabels,
		setSegmentTimesSec,
		loadTimeline,
		formatDateTime,
		getSegmentDate,
		setTranscriptionText,
		setOptimizedText,
		setPartialText,
		setLiveTodos,
		setSelectedSegmentIndex,
		setIsLoadingTimeline,
		currentRecordingDateRef,
		lastFinalEndMsRef,
		recordingStartedAtMsRef,
		selectedDateRef,
		recordingStartedAtRef,
		liveRecordingStateRef,
	]);

	// 自动启动/停止录音：监听配置变化
	useEffect(() => {
		// 等待配置加载完成
		if (configLoading) {
			console.log("配置加载中，等待配置加载完成...");
			return;
		}

		// 调试日志
		console.log("配置状态检查:", {
			is24x7Enabled,
			isRecording,
			isStarting: isStartingRef.current,
			prevConfig: prevConfigRef.current,
		});

		// 配置开启且未在录音中且未在启动中：自动启动
		if (is24x7Enabled && !isRecording && !isStartingRef.current) {
			console.log("✅ 配置已开启，准备自动启动录音...");
			isStartingRef.current = true; // 标记正在启动

			// 延迟一点启动，确保组件完全初始化
			const timer = setTimeout(async () => {
				console.log("开始执行自动启动录音...");
				try {
					await startRecordingInternal();
					console.log("✅ 录音启动成功");
					prevConfigRef.current = true;
				} catch (error) {
					console.error("❌ 自动启动录音失败:", error);
					// 启动失败，允许重试
				} finally {
					isStartingRef.current = false;
				}
			}, 1000);

			return () => {
				clearTimeout(timer);
				isStartingRef.current = false;
			};
		}

		// 配置从 true 变为 false：自动停止
		if (!is24x7Enabled && isRecording) {
			console.log("配置已关闭，停止录音...");
			const currentSegmentTimesSec = liveRecordingStateRef.current.segmentTimesSec;
			stopRecording(currentSegmentTimesSec.length > 0 ? currentSegmentTimesSec : undefined);
			prevConfigRef.current = false;
		}

		// 更新配置状态
		if (!is24x7Enabled && !isRecording) {
			prevConfigRef.current = false;
		}
	}, [is24x7Enabled, isRecording, startRecordingInternal, stopRecording, configLoading, liveRecordingStateRef]);

	return {
		isRecording,
		startRecordingInternal,
		stopRecording,
	};
}
