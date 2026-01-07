/**
 * 新的语音模块面板（重构版）
 * 使用新的UI组件结构，参考千问、飞书、腾讯会议的界面设计
 *
 * 核心功能流程：
 * 1. 采集音频（保留）
 * 2. 自动转录
 * 3. LLM优化
 * 4. 智能提取（待办事项、日程）
 */

"use client";

import { Mic, Play, Upload } from "lucide-react";
import type OpenAI from "openai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCreateTodo } from "@/lib/query/todos";
import { useModuleContextStore } from "@/lib/store/module-context-store";
import { cn } from "@/lib/utils";
import { AudioListPanel } from "./components/AudioListPanel";
import { CompactPlayer } from "./components/CompactPlayer";
import { DateSelector } from "./components/DateSelector";
import { ExtractedItemsPanel } from "./components/ExtractedItemsPanel";
import { MeetingSummary } from "./components/MeetingSummary";
import type { ViewMode } from "./components/ModeSwitcher";
import { OptimizedTextView } from "./components/OptimizedTextView";
import { OriginalTextView } from "./components/OriginalTextView";
import { RecordingView } from "./components/RecordingView";
import { OptimizationService } from "./services/OptimizationService";
import { PersistenceService } from "./services/PersistenceService";
import { RecognitionService } from "./services/RecognitionService";
import { RecordingService } from "./services/RecordingService";
import { ScheduleExtractionService } from "./services/ScheduleExtractionService";
import {
	type ExtractedTodo,
	TodoExtractionService,
} from "./services/TodoExtractionService";
import { WebSocketRecognitionService } from "./services/WebSocketRecognitionService";
import { useAppStore } from "./store/useAppStore";
import type { AudioSegment, ScheduleItem, TranscriptSegment } from "./types";

// 音频录音记录类型
type AudioRecording = {
	id: string;
	segment_id: string;
	start_time: string;
	end_time: string | null;
	duration_seconds: number | null;
	file_url: string | null;
	filename: string | null;
	file_size: number | null;
	title?: string | null;
	is_full_audio?: boolean;
	is_segment_audio?: boolean;
	is_transcribed?: boolean;
	is_extracted?: boolean;
	is_summarized?: boolean;
};

// API基础URL
const API_BASE_URL =
	typeof window !== "undefined"
		? process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api"
		: "http://localhost:8000/api";

// 辅助函数：将相对路径URL转换为完整URL
function normalizeAudioUrl(fileUrl: string | undefined): string | null {
	if (!fileUrl) return null;

	// 如果已经是完整URL（http/https/blob），直接返回
	if (
		fileUrl.startsWith("http://") ||
		fileUrl.startsWith("https://") ||
		fileUrl.startsWith("blob:")
	) {
		return fileUrl;
	}

	// 处理相对路径（如 /api/audio/file/...）
	if (fileUrl.startsWith("/")) {
		// 如果以/api开头，需要拼接base URL
		if (fileUrl.startsWith("/api/")) {
			const baseUrl = API_BASE_URL.replace("/api", ""); // 移除/api后缀，因为fileUrl已经包含/api
			return `${baseUrl}${fileUrl}`;
		} else {
			// 其他相对路径，直接使用当前域名
			return `${window.location.origin}${fileUrl}`;
		}
	}

	// 处理以api/开头的路径（没有前导斜杠）
	if (fileUrl.startsWith("api/")) {
		const baseUrl = API_BASE_URL.replace("/api", "");
		return `${baseUrl}/${fileUrl}`;
	}

	// 其他情况，直接拼接API_BASE_URL
	return `${API_BASE_URL}/${fileUrl}`;
}

export function VoiceModulePanel() {
	// 从store获取状态
	const {
		isRecording,
		recordingStartTime,
		transcripts,
		schedules,
		extractedTodos,
		audioSegments,
		startRecording: storeStartRecording,
		stopRecording: storeStopRecording,
		setCurrentTime: storeSetCurrentTime,
		addTranscript,
		updateTranscript,
		addSchedule,
		addExtractedTodo,
		removeExtractedTodo,
		removeSchedule,
		addAudioSegment,
		updateAudioSegment,
		setProcessStatus,
	} = useAppStore();

	// 服务引用
	const recordingServiceRef = useRef<RecordingService | null>(null);
	const recognitionServiceRef = useRef<
		RecognitionService | WebSocketRecognitionService | null
	>(null);
	const [recognitionServiceType, setRecognitionServiceType] = useState<
		"web-speech" | "websocket"
	>("web-speech");
	const optimizationServiceRef = useRef<OptimizationService | null>(null);
	const scheduleExtractionServiceRef = useRef<ScheduleExtractionService | null>(
		null,
	);
	const todoExtractionServiceRef = useRef<TodoExtractionService | null>(null);
	const persistenceServiceRef = useRef<PersistenceService | null>(null);
	const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
	const playbackIntervalRef = useRef<number | null>(null);

	// 音频相关状态
	const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
	const [error, setError] = useState<string | null>(null);
	const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// 设置错误提示，3秒后自动清除
	const setErrorWithAutoHide = useCallback((errorMessage: string | null) => {
		// 清除之前的定时器
		if (errorTimeoutRef.current) {
			clearTimeout(errorTimeoutRef.current);
			errorTimeoutRef.current = null;
		}

		setError(errorMessage);

		// 如果有错误消息，3秒后自动清除
		if (errorMessage) {
			errorTimeoutRef.current = setTimeout(() => {
				setError(null);
				errorTimeoutRef.current = null;
			}, 3000);
		}
	}, []);

	// 组件卸载时清除定时器
	useEffect(() => {
		return () => {
			if (errorTimeoutRef.current) {
				clearTimeout(errorTimeoutRef.current);
				errorTimeoutRef.current = null;
			}
		};
	}, []);

	// 设置当前模块上下文
	const { setCurrentModule, setVoiceTranscripts } = useModuleContextStore();

	// 创建Todo的mutation（用于智能提取）
	const createTodoMutation = useCreateTodo();

	// UI状态
	const [selectedDate, setSelectedDate] = useState<Date>(new Date());
	const [pendingTodos, setPendingTodos] = useState<ExtractedTodo[]>([]); // 待确认的待办列表
	const [pendingSchedules, setPendingSchedules] = useState<ScheduleItem[]>([]); // 待确认的日程列表
	const [meetingSummary, setMeetingSummary] = useState<string>(""); // LLM生成的智能纪要
	const [currentView, setCurrentView] = useState<"original" | "optimized">(
		"original",
	); // 原文 / 智能优化版
	const [viewMode, setViewMode] = useState<ViewMode>("playback");
	// const [apiResponse, setApiResponse] = useState<any>(null); // 存储后端API响应，用于展示（暂未使用）
	const [highlightedSegmentId, setHighlightedSegmentId] = useState<
		string | undefined
	>();
	const [hoveredSegment] = useState<TranscriptSegment | null>(null);
	const [recordingDuration, setRecordingDuration] = useState(0); // 录音时长（秒）
	const [currentSpeaker, setCurrentSpeaker] = useState<string>("发言人1");
	const [meetingTitle, setMeetingTitle] = useState<string>(""); // 会议标题
	const [isEditingTitle, setIsEditingTitle] = useState(false); // 是否正在编辑标题
	const [editTitleValue, setEditTitleValue] = useState<string>(""); // 编辑中的标题值
	const titleInputRef = useRef<HTMLInputElement>(null); // 标题输入框引用

	// 当进入编辑模式时，聚焦输入框
	useEffect(() => {
		if (isEditingTitle && titleInputRef.current) {
			titleInputRef.current.focus();
			titleInputRef.current.select();
		}
	}, [isEditingTitle]);
	const [nowTime, setNowTime] = useState<Date | null>(null); // 当前时间（初始为 null，避免 SSR 不一致）
	const [dayAudioSegments, setDayAudioSegments] = useState<AudioSegment[]>([]); // 当前日期的音频列表（从后端查询）
	const [isLoadingAudioList, setIsLoadingAudioList] = useState(false); // 加载音频列表中
	const [allAudioRecordings, setAllAudioRecordings] = useState<
		Map<string, number>
	>(new Map()); // 所有日期的音频数量（用于日历显示）

	// 加载状态
	const [isTranscribing, setIsTranscribing] = useState(false); // 转录中
	const [isExtracting, setIsExtracting] = useState(false); // 提取中
	const [isSummarizing, setIsSummarizing] = useState(false); // 生成纪要中
	const [isLoadingAudio] = useState(false); // 加载音频中（暂未使用，保留占位）

	// 播放器状态
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
	const [playbackSpeed, setPlaybackSpeed] = useState(1);
	const [selectedAudioId, setSelectedAudioId] = useState<string | undefined>(
		undefined,
	);

	// 录音停止确认对话框状态
	const [showStopConfirmDialog, setShowStopConfirmDialog] = useState(false);
	const [stopConfirmTitle, setStopConfirmTitle] = useState("");
	const [pendingFullAudio, setPendingFullAudio] = useState<{
		blob: Blob;
		startTime: Date;
		endTime: Date;
		recordingId: string;
	} | null>(null);

	// 设置模块上下文
	useEffect(() => {
		setCurrentModule("voice");
		return () => {
			setCurrentModule(null);
		};
	}, [setCurrentModule]);

	// 更新音频转录内容到模块上下文（供AI聊天使用）
	useEffect(() => {
		// 只传递当前日期的转录内容，并且优先使用优化后的文本
		const dayTranscripts = transcripts.filter((t) => {
			const transcriptDate = new Date(t.timestamp);
			return transcriptDate.toDateString() === selectedDate.toDateString();
		});

		setVoiceTranscripts(
			dayTranscripts.map((t) => ({
				timestamp: t.timestamp,
				optimizedText: t.optimizedText,
				rawText: t.rawText,
			})),
		);
	}, [transcripts, selectedDate, setVoiceTranscripts]);

	// 初始化时加载所有音频记录（用于日历显示）
	useEffect(() => {
		const loadAllAudioRecordings = async () => {
			if (!persistenceServiceRef.current) return;

			try {
				// 查询所有历史数据（从2020年开始到现在，用于日历显示）
				const endTime = new Date();
				const startTime = new Date("2020-01-01T00:00:00.000Z");

				const recordings =
					await persistenceServiceRef.current.queryAudioRecordings(
						startTime,
						endTime,
					);
				// 只统计完整音频
				const fullAudioRecordings = recordings.filter(
					(r: AudioRecording) => r.is_full_audio === true,
				);

				// 计算每个日期的音频数量
				const counts = new Map<string, number>();
				fullAudioRecordings.forEach((recording) => {
					const date = new Date(recording.start_time);
					const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
					counts.set(dateKey, (counts.get(dateKey) || 0) + 1);
				});

				setAllAudioRecordings(counts);
				console.log(
					"[VoiceModulePanel] ✅ 加载了所有音频记录用于日历显示:",
					counts.size,
					"个日期",
				);
			} catch (error) {
				console.error("[VoiceModulePanel] ❌ 加载所有音频记录失败:", error);
			}
		};

		loadAllAudioRecordings();
	}, []);

	// 不再需要枚举设备，直接使用系统默认麦克风

	// 处理文本优化完成
	const handleTextOptimized = useCallback(
		(segmentId: string, optimizedText: string, containsSchedule: boolean) => {
			// 检查优化文本中是否包含日程标记
			const hasScheduleInText = optimizedText.includes("[SCHEDULE:");
			const finalContainsSchedule = containsSchedule || hasScheduleInText;

			updateTranscript(segmentId, {
				optimizedText,
				isOptimized: true,
				containsSchedule: finalContainsSchedule,
			});

			const currentTranscripts = useAppStore.getState().transcripts;
			const segment = currentTranscripts.find((t) => t.id === segmentId);
			if (segment) {
				const updatedSegment = {
					...segment,
					optimizedText,
					isOptimized: true,
					containsSchedule: finalContainsSchedule,
				};

				// 如果包含日程标记，添加到日程提取队列
				if (finalContainsSchedule && scheduleExtractionServiceRef.current) {
					console.log(
						"[VoiceModulePanel] 📅 检测到日程标记，添加到提取队列:",
						segmentId,
					);
					scheduleExtractionServiceRef.current.enqueue(updatedSegment);
				}

				// 添加到待办提取队列
				if (todoExtractionServiceRef.current) {
					todoExtractionServiceRef.current.enqueue(updatedSegment);
				}
			}

			setTimeout(() => {
				const currentTranscripts = useAppStore.getState().transcripts;
				const segment = currentTranscripts.find((t) => t.id === segmentId);
				if (segment && persistenceServiceRef.current) {
					persistenceServiceRef.current
						.saveTranscripts([segment])
						.catch(() => {});
					updateTranscript(segmentId, { uploadStatus: "uploaded" });
				}
			}, 100);
		},
		[updateTranscript],
	);

	// 处理日程提取 - 先加入到待确认列表，不自动加入
	const handleScheduleExtracted = useCallback(
		async (schedule: ScheduleItem) => {
			// 先加入到待确认列表（智能提取区域）
			setPendingSchedules((prev) => {
				// 避免重复添加
				if (prev.find((s) => s.id === schedule.id)) {
					return prev;
				}
				return [...prev, schedule];
			});

			// 更新segment的containsSchedule标志
			const currentTranscripts = useAppStore.getState().transcripts;
			const segment = currentTranscripts.find(
				(t) => t.id === schedule.sourceSegmentId,
			);
			if (segment) {
				updateTranscript(schedule.sourceSegmentId, {
					containsSchedule: true,
				});
			}
		},
		[updateTranscript],
	);

	// 用户点击"加入日程"后调用
	const handleAddSchedule = useCallback(
		async (schedule: ScheduleItem) => {
			// 加入到全局状态（待办事项区域）
			addSchedule(schedule);

			// 保存日程到后端
			if (persistenceServiceRef.current) {
				try {
					await persistenceServiceRef.current.saveSchedules([schedule]);
				} catch (error) {
					console.warn("[handleAddSchedule] 保存日程到后端失败:", error);
				}
			}

			// 自动创建Todo（与系统待办列表、日历等联动）
			try {
				const userNotes = `VOICE_SOURCE_SEGMENT_ID:${schedule.sourceSegmentId}`;
				await createTodoMutation.mutateAsync({
					name: schedule.description,
					deadline: schedule.scheduleTime.toISOString(),
					startTime: schedule.scheduleTime.toISOString(),
					status: "active",
					priority: "medium",
					tags: ["语音提取", "日程"],
					userNotes: userNotes,
				});
			} catch (error) {
				console.warn("[handleAddSchedule] 自动创建 Todo 失败:", error);
			}
		},
		[addSchedule, createTodoMutation],
	);

	// 处理待办提取 - 先加入到待确认列表，不自动加入
	const handleTodoExtracted = useCallback(
		async (todo: ExtractedTodo) => {
			// 检查是否已经存在于extractedTodos中（避免重复添加）
			const currentTodos = useAppStore.getState().extractedTodos;
			const existingTodo = currentTodos.find((t) => t.id === todo.id);
			if (existingTodo) {
				console.log("[handleTodoExtracted] 待办已存在，跳过重复添加:", todo.id);
				return;
			}

			// 先加入到待确认列表（智能提取区域）
			setPendingTodos((prev) => {
				// 避免重复添加
				if (prev.find((t) => t.id === todo.id)) {
					return prev;
				}
				return [...prev, todo];
			});

			const currentTranscripts = useAppStore.getState().transcripts;
			const segment = currentTranscripts.find(
				(t) => t.id === todo.sourceSegmentId,
			);
			if (segment) {
				updateTranscript(todo.sourceSegmentId, {
					containsTodo: true,
				});
			}
		},
		[updateTranscript],
	);

	// 用户点击"加入待办"后调用
	const handleAddTodo = useCallback(
		async (todo: ExtractedTodo) => {
			// 检查是否已经创建过（通过userNotes中的VOICE_SOURCE_SEGMENT_ID判断）
			const userNotes = `VOICE_SOURCE_SEGMENT_ID:${todo.sourceSegmentId}`;

			// 检查是否已经存在于extractedTodos中（避免重复添加）
			const existingTodo = extractedTodos.find((t) => t.id === todo.id);
			if (existingTodo) {
				console.log("[handleAddTodo] 待办已存在，跳过重复添加:", todo.id);
				return;
			}

			// 加入到全局状态（待办事项区域）
			addExtractedTodo(todo);

			// 自动创建Todo（与系统待办列表、日历等联动）
			try {
				await createTodoMutation.mutateAsync({
					name: todo.title,
					description: todo.description,
					deadline: todo.deadline?.toISOString(),
					status: "active",
					priority:
						todo.priority === "high"
							? "high"
							: todo.priority === "low"
								? "low"
								: "medium",
					tags: ["语音提取", "待办事项"],
					userNotes: userNotes,
				});
			} catch (error) {
				console.warn("[handleAddTodo] 自动创建 Todo 失败:", error);
			}
		},
		[addExtractedTodo, createTodoMutation, extractedTodos],
	);

	// 处理识别结果（支持自动分段）
	const handleRecognitionResult = useCallback(
		(text: string, isFinal: boolean) => {
			console.log("[VoiceModulePanel] 📝 收到识别结果:", {
				text: text.substring(0, 50),
				isFinal,
			});

			// 处理所有结果（包括临时结果）
			if (!text.trim()) {
				return;
			}

			// 如果是临时结果，更新最后一个临时片段或创建新片段
			if (!isFinal) {
				// 查找最后一个临时片段
				const currentTranscripts = useAppStore.getState().transcripts;
				const lastInterim = currentTranscripts
					.filter((t) => t.isInterim)
					.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

				if (lastInterim) {
					// 更新临时片段
					updateTranscript(lastInterim.id, {
						rawText: text,
						interimText: text, // 同时更新 interimText，确保UI显示
						isInterim: true,
					});
				} else {
					// 创建新的临时片段
					const currentRecordingStartTime =
						useAppStore.getState().recordingStartTime;
					if (!currentRecordingStartTime) {
						return;
					}

					const now = Date.now();
					const relativeEndTime = now - currentRecordingStartTime.getTime();
					const relativeStartTime = Math.max(0, relativeEndTime - 2000);
					const absoluteEnd = new Date();
					const absoluteStart = new Date(
						absoluteEnd.getTime() -
							Math.max(500, relativeEndTime - relativeStartTime),
					);

					const currentAudioSegments = useAppStore.getState().audioSegments;
					const lastSegment =
						currentAudioSegments[currentAudioSegments.length - 1];
					const segmentId = lastSegment?.id;

					const segment: TranscriptSegment = {
						id: `transcript_interim_${Date.now()}`,
						timestamp: new Date(),
						absoluteStart,
						absoluteEnd,
						segmentId,
						rawText: text,
						interimText: text, // 设置 interimText，确保UI显示
						isOptimized: false,
						isInterim: true,
						containsSchedule: false,
						audioStart: relativeStartTime,
						audioEnd: relativeEndTime,
						uploadStatus: "pending",
					};

					addTranscript(segment);
				}
				return;
			}

			// 处理最终结果 - 支持自动分段
			const currentRecordingStartTime =
				useAppStore.getState().recordingStartTime;
			const currentAudioSegments = useAppStore.getState().audioSegments;
			if (!currentRecordingStartTime) {
				console.warn("[VoiceModulePanel] ⚠️ 录音开始时间为空，跳过识别结果");
				return;
			}

			// 检测句子结束标记（句号、问号、感叹号、分号、换行等），自动分段
			// 使用正则表达式匹配句子结束标记，保留标记
			const sentencePattern = /([^。！？；\n]+[。！？；\n])/g;
			const matches = text.match(sentencePattern);

			// 如果文本包含多个句子，需要分段处理
			if (matches && matches.length > 1) {
				const currentTranscripts = useAppStore.getState().transcripts;
				const lastInterim = currentTranscripts
					.filter((t) => t.isInterim)
					.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

				const now = Date.now();
				const relativeEndTime = now - currentRecordingStartTime.getTime();
				const relativeStartTime =
					lastInterim?.audioStart || Math.max(0, relativeEndTime - 2000);
				const totalDuration = relativeEndTime - relativeStartTime;
				const avgSentenceDuration = totalDuration / matches.length;

				matches.forEach((sentence, index) => {
					const sentenceStartTime =
						relativeStartTime + avgSentenceDuration * index;
					const sentenceEndTime =
						relativeStartTime + avgSentenceDuration * (index + 1);
					const absoluteEnd = new Date(
						currentRecordingStartTime.getTime() + sentenceEndTime,
					);
					const absoluteStart = new Date(
						currentRecordingStartTime.getTime() + sentenceStartTime,
					);

					const lastSegment =
						currentAudioSegments[currentAudioSegments.length - 1];
					const segmentId = lastSegment?.id;

					const segment: TranscriptSegment = {
						id: `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
						timestamp: new Date(),
						absoluteStart,
						absoluteEnd,
						segmentId,
						rawText: sentence.trim(),
						isOptimized: false,
						isInterim: false,
						containsSchedule: false,
						audioStart: sentenceStartTime,
						audioEnd: sentenceEndTime,
						uploadStatus: "pending",
					};

					console.log(
						"[VoiceModulePanel] ✅ 添加转录片段（自动分段）:",
						segment.id,
						sentence.trim().substring(0, 30),
					);
					addTranscript(segment);

					// 添加到优化队列
					if (optimizationServiceRef.current) {
						optimizationServiceRef.current.enqueue(segment);
					}
				});

				return;
			}

			// 单个句子或没有明确分段的情况
			const currentTranscripts = useAppStore.getState().transcripts;
			const lastInterim = currentTranscripts
				.filter((t) => t.isInterim)
				.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

			if (
				lastInterim?.rawText &&
				text.includes(
					lastInterim.rawText.substring(
						0,
						Math.min(10, lastInterim.rawText.length),
					),
				)
			) {
				// 更新临时片段为最终结果
				const now = Date.now();
				const relativeEndTime = now - currentRecordingStartTime.getTime();
				const absoluteEnd = new Date();
				updateTranscript(lastInterim.id, {
					rawText: text,
					isInterim: false,
					absoluteEnd,
					audioEnd: relativeEndTime,
				});

				// 添加到优化队列
				const updatedSegment: TranscriptSegment = {
					...lastInterim,
					rawText: text,
					isInterim: false,
					absoluteEnd,
					audioEnd: relativeEndTime,
				};
				if (optimizationServiceRef.current) {
					optimizationServiceRef.current.enqueue(updatedSegment);
				}
			} else {
				// 创建新的最终片段
				const now = Date.now();
				const relativeEndTime = now - currentRecordingStartTime.getTime();
				const relativeStartTime = Math.max(0, relativeEndTime - 2000);
				const absoluteEnd = new Date();
				const absoluteStart = new Date(
					absoluteEnd.getTime() -
						Math.max(500, relativeEndTime - relativeStartTime),
				);

				const lastSegment =
					currentAudioSegments[currentAudioSegments.length - 1];
				const segmentId = lastSegment?.id;

				const segment: TranscriptSegment = {
					id: `transcript_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
					timestamp: new Date(),
					absoluteStart,
					absoluteEnd,
					segmentId,
					rawText: text,
					isOptimized: false,
					isInterim: false,
					containsSchedule: false,
					audioStart: relativeStartTime,
					audioEnd: relativeEndTime,
					uploadStatus: "pending",
				};

				console.log("[VoiceModulePanel] ✅ 添加转录片段:", segment.id);
				addTranscript(segment);

				// 添加到优化队列
				if (optimizationServiceRef.current) {
					optimizationServiceRef.current.enqueue(segment);
				}
			}
		},
		[addTranscript, updateTranscript],
	);

	// 处理音频段就绪
	// 使用 ref 存储回调，避免闭包问题
	const handleAudioSegmentReadyRef = useRef<
		| ((
				blob: Blob,
				startTime: Date,
				endTime: Date,
				segmentId: string,
		  ) => Promise<void>)
		| null
	>(null);

	// 处理音频段就绪（10秒分段，用于转录）
	const handleAudioSegmentReady = useCallback(
		async (blob: Blob, startTime: Date, endTime: Date, segmentId: string) => {
			console.log("[VoiceModulePanel] 📦 收到10秒音频分段:", {
				segmentId,
				blobSize: blob.size,
				startTime: startTime.toISOString(),
				endTime: endTime.toISOString(),
			});

			// 只在录音模式下处理分段转录
			const currentIsRecording = useAppStore.getState().isRecording;
			if (!currentIsRecording) {
				console.log("[VoiceModulePanel] ⚠️ 不在录音模式，跳过分段转录");
				return;
			}

			// 1. 保存分段音频到后端（标记为分段音频，用于转录）
			if (persistenceServiceRef.current) {
				try {
					const audioFileId = await persistenceServiceRef.current.uploadAudio(
						blob,
						{
							startTime,
							endTime,
							segmentId,
							isSegmentAudio: true, // 标记为分段音频
						},
					);
					if (audioFileId) {
						console.log(
							"[VoiceModulePanel] ✅ 10秒分段音频已保存:",
							audioFileId,
						);
					}
				} catch (error) {
					console.error("[VoiceModulePanel] ❌ 保存分段音频失败:", error);
				}
			}

			// 2. 对10秒分段进行转录（录音模式下实时转录）
			try {
				console.log(
					"[VoiceModulePanel] 🎤 开始转录音频分段，segmentId:",
					segmentId,
					"blobSize:",
					blob.size,
				);
				const formData = new FormData();
				formData.append("file", blob, `${segmentId}.webm`);
				formData.append("optimize", "false"); // 录音模式不优化，只转录
				formData.append("extract_todos", "false"); // 录音模式不提取
				formData.append("extract_schedules", "false"); // 录音模式不提取

				console.log(
					"[VoiceModulePanel] 📤 发送转录请求到:",
					`${API_BASE_URL}/audio/transcribe-file`,
				);
				const response = await fetch(`${API_BASE_URL}/audio/transcribe-file`, {
					method: "POST",
					body: formData,
				});

				if (!response.ok) {
					throw new Error(`转录失败: ${response.statusText}`);
				}

				const result = await response.json();
				const transcriptText = result.transcript || "";

				if (transcriptText.trim()) {
					console.log(
						"[VoiceModulePanel] ✅ 分段转录完成:",
						transcriptText.substring(0, 50),
					);

					// 计算相对时间（相对于录音开始时间）
					const currentRecordingStartTime =
						useAppStore.getState().recordingStartTime;
					if (currentRecordingStartTime) {
						const audioStart =
							startTime.getTime() - currentRecordingStartTime.getTime();
						const audioEnd =
							endTime.getTime() - currentRecordingStartTime.getTime();

						// 创建转录片段（不保存到数据库，只在前端显示）
						const transcriptSegment: TranscriptSegment = {
							id: `transcript_${segmentId}_${Date.now()}`,
							timestamp: startTime, // 使用实际的开始时间，而不是当前时间
							absoluteStart: startTime,
							absoluteEnd: endTime,
							segmentId,
							audioFileId: segmentId, // 设置audioFileId，用于过滤
							rawText: transcriptText,
							isOptimized: false,
							isInterim: false,
							containsSchedule: false,
							audioStart,
							audioEnd,
							uploadStatus: "pending", // 录音模式不保存
						};

						addTranscript(transcriptSegment);
						console.log(
							"[VoiceModulePanel] ✅ 转录文本已添加到store，开始实时提取...",
						);

						// 录音模式：分段实时提取（不等待全部转录完成）
						// 每个分段转录完成后，立即进行提取
						if (
							scheduleExtractionServiceRef.current &&
							todoExtractionServiceRef.current
						) {
							console.log(
								"[VoiceModulePanel] 🔍 录音模式：开始实时提取分段转录文本，文本长度:",
								transcriptText.length,
							);

							// 确保设置回调，实时显示提取结果
							scheduleExtractionServiceRef.current.setCallbacks({
								onScheduleExtracted: (schedule) => {
									console.log("[VoiceModulePanel] ✅ 实时提取到日程:", {
										id: schedule.id,
										description: schedule.description?.substring(0, 50),
										scheduleTime: schedule.scheduleTime,
									});
									// 立即添加到store并显示
									handleScheduleExtracted(schedule);
								},
							});

							todoExtractionServiceRef.current.setCallbacks({
								onTodoExtracted: (todo) => {
									console.log("[VoiceModulePanel] ✅ 实时提取到待办:", {
										id: todo.id,
										title: todo.title,
										description: todo.description?.substring(0, 50),
									});
									// 立即添加到store并显示
									handleTodoExtracted(todo);
								},
							});

							// 立即添加到提取队列（实时提取）
							// 录音模式：使用原始文本直接提取，不等待优化
							const transcriptForExtraction: TranscriptSegment = {
								...transcriptSegment,
								optimizedText: transcriptSegment.rawText, // 录音模式使用原始文本
								isOptimized: true, // 标记为已优化，因为使用原始文本直接提取
							};

							console.log("[VoiceModulePanel] 📝 准备添加到提取队列:", {
								id: transcriptForExtraction.id,
								segmentId: transcriptForExtraction.segmentId,
								audioFileId: transcriptForExtraction.audioFileId,
								textLength: transcriptForExtraction.rawText?.length || 0,
								hasOptimizedText: !!transcriptForExtraction.optimizedText,
							});

							// 添加到日程提取队列
							scheduleExtractionServiceRef.current.enqueue(
								transcriptForExtraction,
							);
							// 添加到待办提取队列
							todoExtractionServiceRef.current.enqueue(transcriptForExtraction);

							console.log(
								"[VoiceModulePanel] ✅ 已添加分段转录文本到提取队列（实时提取）",
							);
						} else {
							console.warn(
								"[VoiceModulePanel] ⚠️ 提取服务未初始化，无法进行实时提取",
							);
						}

						// 实时更新智能提取和纪要（不保存）
						const currentTranscripts = useAppStore.getState().transcripts;
						const allText = currentTranscripts
							.filter((t) => !t.isInterim && t.rawText)
							.map((t) => t.rawText)
							.join("\n");

						if (allText.trim() && optimizationServiceRef.current) {
							// 实时优化文本（用于智能提取）
							try {
								const optimizationService = optimizationServiceRef.current;
								// 使用类型断言访问内部 AI 客户端（仅在必要时）
								const optimizationWithClient =
									optimizationService as unknown as {
										aiClient?: OpenAI | null;
										optimizeText?: (
											segmentId: string,
											text: string,
										) => Promise<void>;
									};
								const aiClient = optimizationWithClient.aiClient;

								if (optimizationWithClient.optimizeText) {
									// 异步优化，不阻塞
									optimizationWithClient
										.optimizeText(transcriptSegment.id, transcriptText)
										.catch((err: unknown) => {
											console.warn("[VoiceModulePanel] ⚠️ 实时优化失败:", err);
										});
								}

								// 实时生成纪要（基于所有已有文本）
								if (aiClient && allText.length > 100) {
									// 至少100字符才生成纪要
									aiClient.chat.completions
										.create({
											model: "deepseek-chat",
											messages: [
												{
													role: "system",
													content:
														"你是一个专业的智能会议纪要生成助手。根据录音转录文本，生成简洁的会议纪要。",
												},
												{
													role: "user",
													content: `请基于以下录音转录内容，生成会议纪要：\n\n${allText}`,
												},
											],
											temperature: 0.7,
											max_tokens: 1000,
										})
										.then((response) => {
											const content =
												response.choices?.[0]?.message?.content ?? undefined;
											if (content) {
												setMeetingSummary(content);
											}
										})
										.catch((err: unknown) => {
											console.warn(
												"[VoiceModulePanel] ⚠️ 实时生成纪要失败:",
												err,
											);
										});
								}
							} catch (error) {
								console.warn("[VoiceModulePanel] ⚠️ 实时处理失败:", error);
							}
						}
					}
				}
			} catch (error) {
				console.error("[VoiceModulePanel] ❌ 分段转录失败:", error);
			}
		},
		[addTranscript, handleScheduleExtracted, handleTodoExtracted],
	);

	// 更新 ref，确保总是使用最新的回调
	useEffect(() => {
		handleAudioSegmentReadyRef.current = handleAudioSegmentReady;
	}, [handleAudioSegmentReady]);

	// 初始化服务（只执行一次，完全不依赖任何状态）
	// biome-ignore lint/correctness/useExhaustiveDependencies: 服务初始化只在挂载时执行一次，回调通过 ref 与 store 保持最新，避免频繁重建和清理
	useEffect(() => {
		console.log("[VoiceModulePanel] 🔄 useEffect: 初始化服务");
		const recordingService = new RecordingService();
		// 初始设置回调（使用 ref，避免闭包问题）
		// 注意：真正的回调会在 handleStartRecording 中重新设置以确保使用最新引用
		recordingService.setCallbacks({
			onSegmentReady: (blob, startTime, endTime, segmentId) => {
				// 使用 ref 获取最新的回调
				if (handleAudioSegmentReadyRef.current) {
					handleAudioSegmentReadyRef.current(
						blob,
						startTime,
						endTime,
						segmentId,
					);
				} else {
					console.error(
						"[VoiceModulePanel] ❌ handleAudioSegmentReadyRef.current 为 null，回调未设置",
					);
				}
			},
			onError: (err) => {
				console.error("Recording error:", err);
				setErrorWithAutoHide(err.message);
				setProcessStatus("recording", "error");
			},
			onAudioData: (analyserNode) => {
				setAnalyser(analyserNode);
			},
		});
		recordingServiceRef.current = recordingService;

		// 检查 Web Speech API 是否支持
		const w = window as typeof window & {
			SpeechRecognition?: new (...args: unknown[]) => unknown;
			webkitSpeechRecognition?: new (...args: unknown[]) => unknown;
			require?: NodeRequire;
			electronAPI?: { [key: string]: unknown };
		};
		const SpeechRecognitionCtor =
			w.SpeechRecognition || w.webkitSpeechRecognition;
		const isElectron = !!w.require || !!w.electronAPI;

		if (!SpeechRecognitionCtor || isElectron) {
			// 不支持 Web Speech API 或在 Electron 环境中，使用 WebSocket + Faster-Whisper
			console.log(
				"[VoiceModulePanel] 🔄 使用 WebSocket + Faster-Whisper 识别服务",
			);
			const wsRecognitionService = new WebSocketRecognitionService();
			wsRecognitionService.setCallbacks({
				onResult: (text: string, isFinal: boolean) => {
					// WebSocket 服务的回调格式略有不同，需要适配
					handleRecognitionResult(text, isFinal);
				},
				onError: (err: Error) => {
					console.error("WebSocket Recognition error:", err);
					setErrorWithAutoHide(err.message);
					setProcessStatus("recognition", "error");
				},
				onStatusChange: (status) => {
					setProcessStatus("recognition", status);
				},
			});
			recognitionServiceRef.current = wsRecognitionService;
			setRecognitionServiceType("websocket");
		} else {
			// 支持 Web Speech API，使用浏览器原生识别
			console.log("[VoiceModulePanel] ✅ 使用 Web Speech API 识别服务");
			const recognitionService = new RecognitionService();
			recognitionService.setCallbacks({
				onResult: handleRecognitionResult,
				onError: (err: Error) => {
					console.error("Recognition error:", err);
					setErrorWithAutoHide(err.message);
					setProcessStatus("recognition", "error");
				},
				onStatusChange: (status: "idle" | "running" | "error") => {
					setProcessStatus("recognition", status);
				},
			});
			recognitionServiceRef.current = recognitionService;
			setRecognitionServiceType("web-speech");
		}

		const optimizationService = new OptimizationService();
		optimizationService.setCallbacks({
			onOptimized: handleTextOptimized,
			onError: (segmentId, err) => {
				console.error(`Optimization error for ${segmentId}:`, err);
				setProcessStatus("optimization", "error");
			},
			onStatusChange: (status) => {
				setProcessStatus("optimization", status);
			},
		});
		optimizationServiceRef.current = optimizationService;

		const scheduleExtractionService = new ScheduleExtractionService();
		scheduleExtractionService.setCallbacks({
			onScheduleExtracted: handleScheduleExtracted,
			onError: (err) => {
				console.error("Schedule extraction error:", err);
				setProcessStatus("scheduleExtraction", "error");
			},
			onStatusChange: (status) => {
				setProcessStatus("scheduleExtraction", status);
			},
		});
		scheduleExtractionServiceRef.current = scheduleExtractionService;

		const todoExtractionService = new TodoExtractionService();
		todoExtractionService.setCallbacks({
			onTodoExtracted: handleTodoExtracted,
			onError: (err) => {
				console.error("Todo extraction error:", err);
			},
			onStatusChange: () => {},
		});
		todoExtractionServiceRef.current = todoExtractionService;

		const persistenceService = new PersistenceService();
		persistenceService.setCallbacks({
			onError: (err) => {
				console.error("Persistence error:", err);
				setProcessStatus("persistence", "error");
			},
			onStatusChange: (status) => {
				setProcessStatus("persistence", status);
			},
		});
		persistenceServiceRef.current = persistenceService;

		const audio = new Audio();
		audioPlayerRef.current = audio;

		audio.onerror = () => {
			setErrorWithAutoHide("音频加载失败");
			if (playbackIntervalRef.current)
				clearInterval(playbackIntervalRef.current);
		};

		audio.onended = () => {
			setIsPlaying(false);
			if (playbackIntervalRef.current)
				clearInterval(playbackIntervalRef.current);
		};

		audio.onpause = () => {
			setIsPlaying(false);
			if (playbackIntervalRef.current)
				clearInterval(playbackIntervalRef.current);
		};

		audio.onplay = () => {
			setIsPlaying(true);
			if (playbackIntervalRef.current)
				clearInterval(playbackIntervalRef.current);
			playbackIntervalRef.current = window.setInterval(() => {
				if (audio.currentTime && audio.duration) {
					setCurrentTime(audio.currentTime);
					setDuration(audio.duration);
				}
			}, 100);
		};

		// 只在组件卸载时清理，不在依赖项变化时清理
		// 这样可以避免回调被反复清空和重新设置
		return () => {
			console.log(
				"[VoiceModulePanel] 🧹 useEffect cleanup: 组件卸载，清理服务",
			);
			// 组件卸载时才清理（不清空回调，只停止服务）
			if (recordingServiceRef.current) {
				recordingServiceRef.current.stop();
			}
			if (recognitionServiceRef.current) {
				recognitionServiceRef.current.stop();
			}
			if (playbackIntervalRef.current)
				clearInterval(playbackIntervalRef.current);
			audio.pause();
		};
		// 注意：完全移除依赖项，只在组件挂载时执行一次
		// 回调会在 handleStartRecording 中重新设置
	}, []);

	// 组件挂载时加载当天音频列表
	// biome-ignore lint/correctness/useExhaustiveDependencies: 只在挂载时加载一次当天音频列表，后续日期切换由显式的 handleDateChange 调用触发
	useEffect(() => {
		if (persistenceServiceRef.current) {
			console.log("[VoiceModulePanel] 📅 组件挂载，加载当天音频列表");
			handleDateChange(selectedDate).catch((err) => {
				console.error("[VoiceModulePanel] ❌ 加载当天音频列表失败:", err);
			});
		}
	}, []); // 只在挂载时执行一次

	// 更新当前时间
	useEffect(() => {
		const interval = setInterval(() => {
			storeSetCurrentTime(new Date());
		}, 1000);
		return () => clearInterval(interval);
	}, [storeSetCurrentTime]);

	// 录音时长计时器
	useEffect(() => {
		let interval: number | null = null;
		if (isRecording) {
			interval = window.setInterval(() => {
				setRecordingDuration((prev) => prev + 1);
			}, 1000);
		} else {
			setRecordingDuration(0);
		}
		return () => {
			if (interval) clearInterval(interval);
		};
	}, [isRecording]);

	// 处理录音开始
	// biome-ignore lint/correctness/useExhaustiveDependencies: 依赖列表包含关键的 store / service 依赖，省略稳定工具函数（handlePause）以避免循环依赖和不必要的重建
	const handleStartRecording = useCallback(async () => {
		console.log("[VoiceModulePanel] 🎤 handleStartRecording被调用");
		setError(null);

		try {
			// 如果正在播放，先停止播放
			if (isPlaying && audioPlayerRef.current) {
				console.log("[VoiceModulePanel] ⏸️ 停止播放");
				handlePause();
			}

			// 清空之前的转录内容（开始新的录音会话）
			console.log("[VoiceModulePanel] 🧹 清空之前的转录内容");
			useAppStore.getState().clearData();

			// 先切换到录音模式
			console.log("[VoiceModulePanel] 🔄 切换到录音模式");
			setViewMode("recording");

			// 检查录音服务是否初始化
			if (!recordingServiceRef.current) {
				console.error("[VoiceModulePanel] ❌ 录音服务未初始化！");
				throw new Error("录音服务未初始化，请刷新页面重试");
			}

			console.log("[VoiceModulePanel] 🎤 准备启动录音服务");

			// 确保回调已设置（在start之前，使用ref获取最新的回调）
			if (recordingServiceRef.current) {
				// 确保 ref 已更新
				handleAudioSegmentReadyRef.current = handleAudioSegmentReady;

				console.log("[VoiceModulePanel] 🔍 检查回调:", {
					hasCallback: typeof handleAudioSegmentReady === "function",
					hasRefCallback: handleAudioSegmentReadyRef.current !== null,
				});

				recordingServiceRef.current.setCallbacks({
					onSegmentReady: (blob, startTime, endTime, segmentId) => {
						// 使用 ref 获取最新的回调
						if (handleAudioSegmentReadyRef.current) {
							handleAudioSegmentReadyRef.current(
								blob,
								startTime,
								endTime,
								segmentId,
							);
						}
					},
					onError: (err) => {
						console.error("[VoiceModulePanel] Recording error:", err);
						setErrorWithAutoHide(err.message);
						setProcessStatus("recording", "error");
					},
					onAudioData: (analyserNode) => {
						setAnalyser(analyserNode);
					},
				});
				// 验证回调是否真的设置了
				const status = recordingServiceRef.current.getStatus();
				console.log("[VoiceModulePanel] ✅ 已设置录音服务回调，验证:", {
					hasOnSegmentReady: handleAudioSegmentReadyRef.current !== null,
					serviceStatus: status,
				});
			}

			// 启动录音服务（使用系统默认麦克风，与 Web Speech API 保持一致）
			console.log(
				"[VoiceModulePanel] 🚀 调用recordingService.start()（使用系统默认麦克风）",
			);
			await recordingServiceRef.current.start();
			console.log("[VoiceModulePanel] ✅ recordingService.start()完成");

			setProcessStatus("recording", "running");
			storeStartRecording();
			setRecordingDuration(0);
			console.log("[VoiceModulePanel] ✅ 录音状态已更新");

			// 启动识别服务
			if (recognitionServiceRef.current) {
				// 重新设置回调（因为可能在清理时被清空）
				if (recognitionServiceType === "websocket") {
					// WebSocket 服务需要传入 MediaStream
					const wsService =
						recognitionServiceRef.current as WebSocketRecognitionService;
					wsService.setCallbacks({
						onResult: (text: string, isFinal: boolean) => {
							handleRecognitionResult(text, isFinal);
						},
						onError: (err) => {
							console.error(
								"[VoiceModulePanel] WebSocket Recognition error:",
								err,
							);
							setErrorWithAutoHide(err.message);
							setProcessStatus("recognition", "error");
						},
						onStatusChange: (status) => {
							setProcessStatus("recognition", status);
						},
					});
					// WebSocket 服务需要传入录音服务的 MediaStream
					if (recordingServiceRef.current) {
						const stream = recordingServiceRef.current.getStream?.();
						if (stream) {
							setTimeout(() => {
								try {
									wsService.start(stream);
									console.log("[VoiceModulePanel] ✅ WebSocket 识别服务已启动");
								} catch (recognitionError) {
									console.error(
										"[VoiceModulePanel] ❌ WebSocket Recognition start error:",
										recognitionError,
									);
									setErrorWithAutoHide(
										"识别服务启动失败，请检查后端服务是否运行",
									);
								}
							}, 500);
						} else {
							console.error("[VoiceModulePanel] ❌ 无法获取音频流");
							setErrorWithAutoHide("无法获取音频流");
						}
					}
				} else {
					// Web Speech API 服务
					const webSpeechService =
						recognitionServiceRef.current as RecognitionService;
					webSpeechService.setCallbacks({
						onResult: handleRecognitionResult,
						onError: (err) => {
							console.error("[VoiceModulePanel] Recognition error:", err);
							setErrorWithAutoHide(err.message);
							setProcessStatus("recognition", "error");
						},
						onStatusChange: (status) => {
							setProcessStatus("recognition", status);
						},
					});
					// 延迟启动识别，确保录音服务已完全启动
					setTimeout(() => {
						try {
							webSpeechService.start();
							console.log(
								"[VoiceModulePanel] ✅ Web Speech API 识别服务已启动",
							);
						} catch (recognitionError) {
							console.error(
								"[VoiceModulePanel] ❌ Recognition start error:",
								recognitionError,
							);
							setErrorWithAutoHide(
								"识别服务启动失败，请检查浏览器是否支持语音识别",
							);
						}
					}, 500);
				}
			} else {
				console.error("[VoiceModulePanel] 识别服务未初始化");
				setErrorWithAutoHide("识别服务未初始化");
			}
		} catch (err) {
			const error =
				err instanceof Error ? err : new Error("Failed to start recording");
			console.error("Recording error:", error);
			setErrorWithAutoHide(error.message);
			setProcessStatus("recording", "error");
			storeStopRecording();
			setRecordingDuration(0);
			// 如果启动失败，切换回回看模式
			setViewMode("playback");
		}
	}, [
		storeStartRecording,
		storeStopRecording,
		setProcessStatus,
		handleRecognitionResult,
		isPlaying,
		handleAudioSegmentReady,
		recognitionServiceType,
		setErrorWithAutoHide,
	]);

	// 处理录音暂停
	const handlePauseRecording = useCallback(() => {
		if (!isRecording) {
			return;
		}

		// 暂停识别服务（停止转录）
		if (recognitionServiceRef.current) {
			if (recognitionServiceType === "websocket") {
				(recognitionServiceRef.current as WebSocketRecognitionService).stop();
			} else {
				(recognitionServiceRef.current as RecognitionService).stop();
			}
		}

		// 暂停录音服务（暂停MediaRecorder，保留音频流）
		if (recordingServiceRef.current) {
			recordingServiceRef.current.pause();
		}

		// 更新状态为暂停
		setProcessStatus("recording", "paused");
	}, [isRecording, setProcessStatus, recognitionServiceType]);

	// 处理录音恢复
	const handleResumeRecording = useCallback(() => {
		const currentStatus = useAppStore.getState().processStatus.recording;
		if (currentStatus !== "paused") {
			return;
		}

		// 恢复录音服务
		if (recordingServiceRef.current) {
			recordingServiceRef.current.resume();
		}

		// 恢复识别服务
		if (recognitionServiceRef.current) {
			if (recognitionServiceType === "websocket") {
				const stream = recordingServiceRef.current?.getStream();
				if (stream) {
					(recognitionServiceRef.current as WebSocketRecognitionService).start(
						stream,
					);
				}
			} else {
				(recognitionServiceRef.current as RecognitionService).start();
			}
		}

		// 更新状态为运行中
		setProcessStatus("recording", "running");
	}, [setProcessStatus, recognitionServiceType]);

	// 处理录音停止（弹出确认对话框）
	const handleStopRecording = useCallback(async () => {
		if (!recordingServiceRef.current) return;

		// 停止识别服务
		if (recognitionServiceRef.current) {
			if (recognitionServiceType === "websocket") {
				(recognitionServiceRef.current as WebSocketRecognitionService).stop();
			} else {
				(recognitionServiceRef.current as RecognitionService).stop();
			}
		}

		// 停止录音服务，获取完整音频
		const fullAudio = await recordingServiceRef.current.stop();
		setProcessStatus("recording", "idle");

		if (fullAudio && recordingStartTime) {
			const endTime = new Date();
			const status = recordingServiceRef.current.getStatus();
			const recordingId = status.fullRecordingId || `recording_${Date.now()}`;

			// 保存完整音频信息，显示确认对话框
			setPendingFullAudio({
				blob: fullAudio,
				startTime: recordingStartTime,
				endTime,
				recordingId,
			});
			setShowStopConfirmDialog(true);
			setStopConfirmTitle(meetingTitle || "");
		} else {
			// 如果没有完整音频，直接停止
			storeStopRecording();
			setViewMode("playback");
		}
	}, [
		recordingStartTime,
		meetingTitle,
		recognitionServiceType,
		storeStopRecording,
		setProcessStatus,
	]);

	// 确认保存录音
	// biome-ignore lint/correctness/useExhaustiveDependencies: 依赖包含 Zustand 的 action（setViewMode 等），这些 action 在运行时是稳定引用，当前列表已经足够安全
	const handleConfirmSaveRecording = useCallback(async () => {
		if (!pendingFullAudio || !persistenceServiceRef.current) {
			setShowStopConfirmDialog(false);
			setPendingFullAudio(null);
			storeStopRecording();
			setViewMode("playback");
			return;
		}

		try {
			// 保存完整音频
			const title = stopConfirmTitle.trim() || "未命名录音";
			const audioId = await persistenceServiceRef.current.uploadFullAudio(
				pendingFullAudio.blob,
				{
					startTime: pendingFullAudio.startTime,
					endTime: pendingFullAudio.endTime,
					recordingId: pendingFullAudio.recordingId,
					title,
					isFullAudio: true,
				},
			);

			console.log("[VoiceModulePanel] ✅ 完整音频已保存:", audioId);

			// 更新标题
			setMeetingTitle(title);

			// 关闭对话框
			setShowStopConfirmDialog(false);
			setPendingFullAudio(null);
			setStopConfirmTitle("");

			// 切换到回看模式
			storeStopRecording();
			setViewMode("playback");

			// 刷新音频列表
			if (selectedDate) {
				const startTime = new Date(selectedDate);
				startTime.setHours(0, 0, 0, 0);
				const endTime = new Date(selectedDate);
				endTime.setHours(23, 59, 59, 999);
				const recordings =
					await persistenceServiceRef.current.queryAudioRecordings(
						startTime,
						endTime,
					);
				// 更新dayAudioSegments
				setDayAudioSegments(
					recordings.map((r) => ({
						id: r.id,
						startTime: new Date(r.start_time),
						endTime: r.end_time ? new Date(r.end_time) : new Date(r.start_time),
						duration: (r.duration_seconds || 0) * 1000,
						fileSize: r.file_size || 0,
						fileUrl: r.file_url || undefined,
						audioSource: "microphone" as const,
						uploadStatus: "uploaded" as const,
						title: title,
					})),
				);
			}
		} catch (error) {
			console.error("[VoiceModulePanel] ❌ 保存完整音频失败:", error);
			setErrorWithAutoHide("保存录音失败，请重试");
		}
	}, [
		pendingFullAudio,
		stopConfirmTitle,
		selectedDate,
		storeStopRecording,
		setViewMode,
		setErrorWithAutoHide,
	]);

	// 取消保存录音
	// biome-ignore lint/correctness/useExhaustiveDependencies: 依赖只涉及稳定的 store action（setViewMode 等），当前列表已经足够安全
	const handleCancelSaveRecording = useCallback(() => {
		setShowStopConfirmDialog(false);
		setPendingFullAudio(null);
		setStopConfirmTitle("");
		storeStopRecording();
		setViewMode("playback");
	}, [storeStopRecording, setViewMode]);

	// 监听灵动岛的录音控制事件（完全同步录音功能）
	useEffect(() => {
		const handleDynamicIslandToggleRecording = (event: Event) => {
			const customEvent = event as CustomEvent<{
				action: "start" | "stop" | "pause" | "resume";
			}>;
			const { action } = customEvent.detail || {};

			if (!action) {
				console.warn(
					"[VoiceModulePanel] ⚠️ 收到灵动岛录音控制事件，但 action 为空",
				);
				return;
			}

			console.log("[VoiceModulePanel] 📱 收到灵动岛录音控制事件:", action);

			if (action === "start") {
				if (!isRecording) {
					console.log("[VoiceModulePanel] 🎤 灵动岛触发：开始录音");
					handleStartRecording().catch((err) => {
						console.error("[VoiceModulePanel] ❌ 灵动岛启动录音失败:", err);
					});
				} else {
					console.log("[VoiceModulePanel] ⚠️ 已在录音中，忽略开始请求");
				}
			} else if (action === "pause") {
				if (isRecording) {
					console.log("[VoiceModulePanel] ⏸️ 灵动岛触发：暂停录音");
					handlePauseRecording();
				} else {
					console.log("[VoiceModulePanel] ⚠️ 未在录音，忽略暂停请求");
				}
			} else if (action === "resume") {
				const currentStatus = useAppStore.getState().processStatus.recording;
				if (currentStatus === "paused") {
					console.log("[VoiceModulePanel] ▶️ 灵动岛触发：恢复录音");
					handleResumeRecording();
				} else {
					console.log("[VoiceModulePanel] ⚠️ 录音未暂停，忽略恢复请求");
				}
			} else if (action === "stop") {
				if (isRecording) {
					console.log("[VoiceModulePanel] ⏹️ 灵动岛触发：停止录音");
					handleStopRecording().catch((err) => {
						console.error("[VoiceModulePanel] ❌ 灵动岛停止录音失败:", err);
					});
				} else {
					console.log("[VoiceModulePanel] ⚠️ 未在录音，忽略停止请求");
				}
			}
		};

		// 在 window 和 document 上都注册监听器
		window.addEventListener(
			"dynamic-island-toggle-recording",
			handleDynamicIslandToggleRecording as EventListener,
		);
		document.addEventListener(
			"dynamic-island-toggle-recording",
			handleDynamicIslandToggleRecording as EventListener,
		);
		console.log(
			"[VoiceModulePanel] ✅ 已注册灵动岛录音控制事件监听器 (window & document)",
		);

		return () => {
			window.removeEventListener(
				"dynamic-island-toggle-recording",
				handleDynamicIslandToggleRecording as EventListener,
			);
			document.removeEventListener(
				"dynamic-island-toggle-recording",
				handleDynamicIslandToggleRecording as EventListener,
			);
			console.log("[VoiceModulePanel] 🧹 已移除灵动岛录音控制事件监听器");
		};
	}, [
		isRecording,
		handleStartRecording,
		handlePauseRecording,
		handleResumeRecording,
		handleStopRecording,
	]);

	// 获取录音状态（用于通知 DynamicIsland）
	const recordingStatus = useAppStore((state) => state.processStatus.recording);
	const isPausedStatus = recordingStatus === "paused";

	// 通知 DynamicIsland 录音状态变化（解耦：通过事件系统通信）
	useEffect(() => {
		if (typeof window !== "undefined") {
			const event = new CustomEvent("voice-module-recording-status", {
				detail: {
					isRecording,
					isPaused: isPausedStatus,
				},
				bubbles: true,
				cancelable: true,
			});

			window.dispatchEvent(event);
			document.dispatchEvent(event);
		}
	}, [isRecording, isPausedStatus]);

	// 处理日期切换 - 从后端加载该日期的数据
	const handleDateChange = useCallback(
		async (date: Date) => {
			console.log("[VoiceModulePanel] 📅 切换日期:", date.toDateString());
			setIsLoadingAudioList(true);
			setSelectedDate(date);

			// 清空所有之前的数据，避免残留
			setDayAudioSegments([]);
			setSelectedAudioId(undefined);
			setCurrentAudioUrl(null);
			setMeetingSummary("");
			setMeetingTitle("");
			setCurrentTime(0);
			setDuration(0);
			setIsPlaying(false);
			setPendingTodos([]); // 清空待确认的待办
			setPendingSchedules([]); // 清空待确认的日程

			// 停止播放
			if (audioPlayerRef.current) {
				audioPlayerRef.current.pause();
				audioPlayerRef.current.src = "";
				audioPlayerRef.current.load();
			}

			// 清空store中的数据（只保留当前日期的数据）
			useAppStore.getState().clearData();

			if (!persistenceServiceRef.current) {
				console.warn(
					"[VoiceModulePanel] PersistenceService未初始化，无法加载历史数据",
				);
				setIsLoadingAudioList(false);
				return;
			}

			try {
				// 计算该日期的开始和结束时间（使用本地时间，避免时区问题）
				const startTime = new Date(date);
				startTime.setHours(0, 0, 0, 0);
				const endTime = new Date(date);
				endTime.setHours(23, 59, 59, 999);

				console.log(
					`[VoiceModulePanel] 📅 加载日期数据: ${date.toDateString()}, 时间范围: ${startTime.toISOString()} - ${endTime.toISOString()}`,
				);
				console.log(
					`[VoiceModulePanel] 📅 本地时间范围: ${startTime.toLocaleString("zh-CN")} - ${endTime.toLocaleString("zh-CN")}`,
				);

				// 1. 加载转录文本
				const loadedTranscripts =
					await persistenceServiceRef.current.queryTranscripts(
						startTime,
						endTime,
					);
				console.log(
					`[VoiceModulePanel] ✅ 加载了 ${loadedTranscripts.length} 条转录文本`,
				);

				// 将加载的转录文本添加到 store
				loadedTranscripts.forEach((t) => {
					addTranscript(t);
				});

				// 2. 加载日程
				const loadedSchedules =
					await persistenceServiceRef.current.querySchedules(
						startTime,
						endTime,
					);
				console.log(
					`[VoiceModulePanel] ✅ 加载了 ${loadedSchedules.length} 条日程`,
				);

				// 将加载的日程添加到 store
				loadedSchedules.forEach((s) => {
					addSchedule(s);
				});

				// 3. 加载音频文件信息
				const recordings =
					await persistenceServiceRef.current.queryAudioRecordings(
						startTime,
						endTime,
					);
				// 优先加载完整音频（用于回放），如果没有完整音频，则加载所有音频
				const fullAudioRecordings = recordings.filter(
					(r: AudioRecording) => r.is_full_audio === true,
				);
				const audioRecordingsToLoad =
					fullAudioRecordings.length > 0 ? fullAudioRecordings : recordings;
				console.log(
					`[VoiceModulePanel] ✅ 加载了 ${recordings.length} 条音频录音记录，其中 ${fullAudioRecordings.length} 条完整音频，将加载 ${audioRecordingsToLoad.length} 条音频`,
				);

				// 将查询到的音频记录转换为 AudioSegment
				const loadedAudioSegments: AudioSegment[] = [];
				for (const recording of audioRecordingsToLoad) {
					// 获取音频文件URL - 优先使用getAudioUrl获取正确的URL
					// 注意：后端返回的id是segment_id，应该使用segment_id来获取音频URL
					let fileUrl: string | undefined;
					const audioId = recording.segment_id || recording.id;
					if (audioId) {
						// 优先通过 segment_id 获取正确的URL（后端会返回正确的URL格式）
						try {
							const url =
								await persistenceServiceRef.current.getAudioUrl(audioId);
							if (url) {
								fileUrl = url;
								console.log(
									`[VoiceModulePanel] 通过getAudioUrl获取URL:`,
									url,
									"for segment_id:",
									audioId,
								);
							} else {
								console.warn(
									`[VoiceModulePanel] getAudioUrl返回null for segment_id:`,
									audioId,
								);
							}
						} catch (error) {
							console.warn(
								`[VoiceModulePanel] getAudioUrl失败 for segment_id:`,
								audioId,
								error,
							);
						}
					}
					// 如果getAudioUrl失败，尝试使用file_url（从数据库查询结果中获取）
					if (!fileUrl && recording.file_url) {
						fileUrl = recording.file_url;
						console.log(`[VoiceModulePanel] 使用file_url:`, fileUrl);
					}
					// 如果还是没有URL，记录警告
					if (!fileUrl) {
						console.warn(`[VoiceModulePanel] 无法获取音频URL for recording:`, {
							id: recording.id,
							segment_id: recording.segment_id,
							filename: recording.filename,
						});
					}

					// 解析时间戳，确保正确转换
					let startTime: Date;
					let endTime: Date;

					try {
						// 尝试解析 ISO 字符串或时间戳
						// 注意：后端返回的时间字符串可能没有时区信息（如 '2025-12-30T07:30:06.201000'）
						// 这种情况下，JavaScript 会把它当作本地时间解析，这是正确的
						if (typeof recording.start_time === "string") {
							// 如果字符串没有时区信息（没有 Z 或 +/-），说明已经是本地时间
							const timeStr = recording.start_time.trim();
							if (
								timeStr.endsWith("Z") ||
								timeStr.includes("+") ||
								timeStr.includes("-", 10)
							) {
								// 有时区信息，按 UTC 或指定时区解析
								startTime = new Date(timeStr);
							} else {
								// 没有时区信息，当作本地时间解析（后端返回的已经是本地时间）
								// 直接解析，JavaScript 会把它当作本地时间
								startTime = new Date(timeStr);
							}
							// 验证时间是否有效
							if (Number.isNaN(startTime.getTime())) {
								console.warn(
									"[VoiceModulePanel] ⚠️ 时间解析失败，使用当前时间:",
									recording.start_time,
								);
								startTime = new Date();
							}
						} else if (typeof recording.start_time === "number") {
							// 如果是时间戳（毫秒），直接创建 Date 对象
							startTime = new Date(recording.start_time);
							if (Number.isNaN(startTime.getTime())) {
								console.warn(
									"[VoiceModulePanel] ⚠️ 时间戳无效，使用当前时间:",
									recording.start_time,
								);
								startTime = new Date();
							}
						} else {
							console.warn(
								"[VoiceModulePanel] ⚠️ start_time 格式未知，使用当前时间:",
								recording.start_time,
							);
							startTime = new Date();
						}

						if (recording.end_time) {
							if (typeof recording.end_time === "string") {
								const endTimeStr = recording.end_time.trim();
								if (
									endTimeStr.endsWith("Z") ||
									endTimeStr.includes("+") ||
									endTimeStr.includes("-", 10)
								) {
									endTime = new Date(endTimeStr);
								} else {
									endTime = new Date(endTimeStr);
								}
								if (Number.isNaN(endTime.getTime())) {
									endTime = new Date(
										startTime.getTime() +
											(recording.duration_seconds || 0) * 1000,
									);
								}
							} else if (typeof recording.end_time === "number") {
								endTime = new Date(recording.end_time);
								if (Number.isNaN(endTime.getTime())) {
									endTime = new Date(
										startTime.getTime() +
											(recording.duration_seconds || 0) * 1000,
									);
								}
							} else {
								endTime = new Date(
									startTime.getTime() +
										(recording.duration_seconds || 0) * 1000,
								);
							}
						} else {
							endTime = new Date(
								startTime.getTime() + (recording.duration_seconds || 0) * 1000,
							);
						}

						// 添加调试日志，确认时间解析正确
						console.log(`[VoiceModulePanel] 🕐 解析时间:`, {
							original: recording.start_time,
							parsed: startTime.toISOString(),
							local: startTime.toLocaleString("zh-CN"),
							hours: startTime.getHours(),
							minutes: startTime.getMinutes(),
							hasTimezone:
								typeof recording.start_time === "string"
									? recording.start_time.includes("Z") ||
										recording.start_time.includes("+") ||
										recording.start_time.includes("-", 10)
									: "N/A",
						});
					} catch (e) {
						console.error("[VoiceModulePanel] ❌ 时间解析失败:", e, recording);
						startTime = new Date();
						endTime = new Date();
					}

					const audioSegment: AudioSegment = {
						id: recording.segment_id || recording.id,
						startTime,
						endTime,
						duration: recording.duration_seconds
							? recording.duration_seconds * 1000
							: endTime.getTime() - startTime.getTime(),
						fileSize: recording.file_size || 0,
						fileUrl: fileUrl,
						audioSource: "microphone",
						uploadStatus: fileUrl ? "uploaded" : "failed",
						title: (recording as AudioRecording).title || undefined, // 添加标题字段
					};

					loadedAudioSegments.push(audioSegment);
					console.log(`[VoiceModulePanel] ✅ 加载音频段:`, {
						id: audioSegment.id,
						startTime: audioSegment.startTime.toISOString(),
						startTimeLocal: audioSegment.startTime.toLocaleString("zh-CN"),
						endTime: audioSegment.endTime.toISOString(),
						duration: audioSegment.duration,
						fileUrl: audioSegment.fileUrl,
					});
				}

				// 按开始时间排序
				loadedAudioSegments.sort(
					(a, b) => a.startTime.getTime() - b.startTime.getTime(),
				);

				// 过滤出真正属于当前日期的音频（考虑时区问题）
				// 使用本地时间的年月日来匹配，而不是UTC时间
				const filteredSegments = loadedAudioSegments.filter((segment) => {
					const segmentDate = new Date(segment.startTime);
					const selectedDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
					const segmentDateStr = `${segmentDate.getFullYear()}-${String(segmentDate.getMonth() + 1).padStart(2, "0")}-${String(segmentDate.getDate()).padStart(2, "0")}`;
					return segmentDateStr === selectedDateStr;
				});

				console.log(
					`[VoiceModulePanel] 📊 过滤后的音频段数量: ${filteredSegments.length} / ${loadedAudioSegments.length} (选择日期: ${date.toDateString()})`,
				);

				// 更新当前日期的音频列表（直接从后端查询）
				setDayAudioSegments(filteredSegments);
				setIsLoadingAudioList(false);

				// 更新当前日期的音频数量（用于日历显示）
				const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
				setAllAudioRecordings((prev) => {
					const updated = new Map(prev);
					updated.set(dateKey, filteredSegments.length);
					return updated;
				});

				// 重新加载所有日期的音频数量（确保日历显示正确）
				try {
					const endTime = new Date();
					const startTime = new Date("2020-01-01T00:00:00.000Z");
					const allRecordings =
						await persistenceServiceRef.current.queryAudioRecordings(
							startTime,
							endTime,
						);
					const fullAudioRecordings = allRecordings.filter(
						(r: AudioRecording) => r.is_full_audio === true,
					);
					const counts = new Map<string, number>();
					fullAudioRecordings.forEach((recording) => {
						const recDate = new Date(recording.start_time);
						const recDateKey = `${recDate.getFullYear()}-${String(recDate.getMonth() + 1).padStart(2, "0")}-${String(recDate.getDate()).padStart(2, "0")}`;
						counts.set(recDateKey, (counts.get(recDateKey) || 0) + 1);
					});
					setAllAudioRecordings(counts);
					console.log(
						"[VoiceModulePanel] ✅ 重新加载了所有日期的音频数量:",
						counts.size,
						"个日期",
					);
				} catch (error) {
					console.error(
						"[VoiceModulePanel] ❌ 重新加载所有日期音频数量失败:",
						error,
					);
				}

				// 如果有音频，自动选择第一个音频
				if (filteredSegments.length > 0) {
					const firstAudio = filteredSegments[0];
					setSelectedAudioId(firstAudio.id);
					console.log(
						"[VoiceModulePanel] 📅 切换日期，自动选择第一个音频:",
						firstAudio.id,
					);

					// 更新当前音频URL
					if (firstAudio.fileUrl) {
						const normalizedUrl = normalizeAudioUrl(firstAudio.fileUrl);
						setCurrentAudioUrl(normalizedUrl);
						if (audioPlayerRef.current && normalizedUrl) {
							// 先移除之前的监听器，避免重复
							const audio = audioPlayerRef.current;
							const handleLoadedMetadata = () => {
								if (
									audio?.duration &&
									Number.isFinite(audio.duration) &&
									audio.duration > 0
								) {
									console.log(
										"[VoiceModulePanel] 📊 音频元数据加载完成，duration:",
										audio.duration,
									);
									setDuration(audio.duration);
								}
							};
							audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
							audio.src = normalizedUrl;
							audio.load();
							audio.addEventListener("loadedmetadata", handleLoadedMetadata, {
								once: true,
							});
							// 如果音频已经加载了，立即获取duration
							if (
								audio.readyState >= 1 &&
								audio.duration &&
								Number.isFinite(audio.duration) &&
								audio.duration > 0
							) {
								console.log(
									"[VoiceModulePanel] 📊 音频已就绪，立即获取duration:",
									audio.duration,
								);
								setDuration(audio.duration);
							}
						}
					}

					// 注意：不在这里调用 handleSelectAudio，因为 useEffect 会自动选择第一个音频
					// 这样可以避免重复调用和竞态条件
				} else {
					setCurrentAudioUrl(null);
					setDuration(0);
					setSelectedAudioId(undefined);
				}
			} catch (error) {
				console.error("[VoiceModulePanel] ❌ 加载历史数据失败:", error);
				setErrorWithAutoHide("加载历史数据失败，请重试");
				setIsLoadingAudioList(false);
			}
		},
		[addTranscript, addSchedule, setErrorWithAutoHide],
	);

	// 处理导出
	const handleExport = useCallback(async () => {
		try {
			const dayTranscripts = transcripts.filter((t) => {
				const transcriptDate = new Date(t.timestamp);
				return transcriptDate.toDateString() === selectedDate.toDateString();
			});

			const exportData = {
				date: selectedDate.toISOString().split("T")[0],
				transcripts: dayTranscripts.map((t) => ({
					time: t.audioStart
						? `${Math.floor(t.audioStart / 1000 / 60)}:${String(Math.floor((t.audioStart / 1000) % 60)).padStart(2, "0")}`
						: "00:00",
					rawText: t.rawText,
					optimizedText: t.optimizedText || "",
				})),
				schedules: schedules.filter((s) => {
					const scheduleDate = new Date(s.scheduleTime);
					return scheduleDate.toDateString() === selectedDate.toDateString();
				}),
				todos: extractedTodos.filter((t) => {
					const todoDate = t.deadline ? new Date(t.deadline) : null;
					return (
						todoDate && todoDate.toDateString() === selectedDate.toDateString()
					);
				}),
			};

			// 生成JSON文件
			const blob = new Blob([JSON.stringify(exportData, null, 2)], {
				type: "application/json",
			});
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `录音记录_${selectedDate.toISOString().split("T")[0]}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error("导出失败:", error);
			setErrorWithAutoHide("导出失败，请重试");
		}
	}, [selectedDate, transcripts, schedules, extractedTodos, setErrorWithAutoHide]);

	// 处理编辑 - 打开编辑模式
	const handleEdit = useCallback(() => {
		// 切换视图到编辑模式（可以编辑转录文本）
		// 这里可以添加一个编辑状态，允许用户编辑转录文本
		console.log(
			"[VoiceModulePanel] 📝 编辑模式：可以编辑转录文本、日程、待办等",
		);
		// 暂时显示提示，后续可以实现编辑对话框
		setErrorWithAutoHide("编辑功能：可以点击转录文本进行编辑（功能开发中）");
	}, [setErrorWithAutoHide]);

	// 处理选择音频文件（回看模式检测逻辑）
	// biome-ignore lint/correctness/useExhaustiveDependencies: 该回调依赖大量 store 状态和服务引用，全部纳入依赖会导致频繁重建且收益有限，这里保持精简依赖并通过显式逻辑保证一致性
	const handleSelectAudio = useCallback(
		async (audio: AudioSegment) => {
			// 1. 先清空之前的内容（避免残留）
			console.log("[VoiceModulePanel] 🔄 切换音频，清空之前的内容");

			// 清空纪要（切换音频时清空，后续会根据新音频重新加载）
			setMeetingSummary("");

			// 清空待确认列表（切换音频时清空，后续会根据新音频重新提取）
			setPendingTodos([]);
			setPendingSchedules([]);

			// 清除 store 中不属于当前音频的数据
			// 清除转录文本
			transcripts.forEach((t) => {
				if (t.segmentId !== audio.id && t.audioFileId !== audio.id) {
					// 从 store 中移除（通过更新为空数组，然后重新添加）
				}
			});

			// 清除日程
			schedules.forEach((s) => {
				if (s.sourceSegmentId !== audio.id) {
					removeSchedule(s.id);
				}
			});

			// 清除待办
			extractedTodos.forEach((t) => {
				if (t.sourceSegmentId !== audio.id) {
					removeExtractedTodo(t.id);
				}
			});

			setSelectedAudioId(audio.id);

			// 只在回看模式处理
			if (viewMode !== "playback") return;

			// 加载该音频对应的转录、纪要、待办等数据
			if (audio.startTime && persistenceServiceRef.current) {
				try {
					// 1. 查询音频记录，检查标记
					const startTime = new Date(audio.startTime);
					startTime.setHours(0, 0, 0, 0);
					const endTime = new Date(audio.startTime);
					endTime.setHours(23, 59, 59, 999);

					const recordings =
						await persistenceServiceRef.current.queryAudioRecordings(
							startTime,
							endTime,
						);
					// 优先查找完整音频（is_full_audio=true），用于转录
					const fullAudioRecording = recordings.find(
						(r: AudioRecording) =>
							(r.id === audio.id || r.segment_id === audio.id) &&
							r.is_full_audio === true,
					);
					// 当前选中的音频记录（可能是分段音频，用于显示）
					const currentRecording =
						fullAudioRecording ||
						recordings.find(
							(r) => r.id === audio.id || r.segment_id === audio.id,
						);

					console.log("[VoiceModulePanel] 🔍 查询到的音频记录:", {
						audioId: audio.id,
						totalRecordings: recordings.length,
						fullAudioRecording: fullAudioRecording
							? {
									id: fullAudioRecording.id,
									segment_id: fullAudioRecording.segment_id,
									is_full_audio: fullAudioRecording.is_full_audio,
									is_transcribed: fullAudioRecording.is_transcribed,
									is_extracted: fullAudioRecording.is_extracted,
									is_summarized: fullAudioRecording.is_summarized,
								}
							: null,
						currentRecording: currentRecording
							? {
									id: currentRecording.id,
									segment_id: currentRecording.segment_id,
									is_full_audio: currentRecording.is_full_audio,
								}
							: null,
					});

					// 如果有纪要标记，从数据库加载纪要内容
					if (fullAudioRecording?.is_summarized) {
						try {
							const audioInfoResponse = await fetch(
								`${API_BASE_URL}/audio/${audio.id}`,
							);
							if (audioInfoResponse.ok) {
								const audioInfo = await audioInfoResponse.json();
								if (audioInfo.summary_text) {
									console.log(
										"[VoiceModulePanel] ✅ 已加载纪要内容，长度:",
										audioInfo.summary_text.length,
									);
									setMeetingSummary(audioInfo.summary_text);
								}
							}
						} catch (error) {
							console.error("[VoiceModulePanel] ❌ 加载纪要内容失败:", error);
						}
					}

					// 如果有提取标记，从数据库加载待办和日程，并检查是否为空
					if (fullAudioRecording?.is_extracted) {
						console.log(
							"[VoiceModulePanel] 🔍 检测到已提取标记，从数据库加载待办和日程",
						);

						// 加载日程（已有 querySchedules 方法支持 audioFileId）
						try {
							const loadedSchedules =
								await persistenceServiceRef.current.querySchedules(
									undefined,
									undefined,
									audio.id,
								);
							console.log(
								"[VoiceModulePanel] 📅 从数据库加载的日程数量:",
								loadedSchedules.length,
							);

							// 清除不属于当前音频的日程，然后添加当前音频的日程
							schedules.forEach((s) => {
								if (s.sourceSegmentId !== audio.id) {
									removeSchedule(s.id);
								}
							});

							loadedSchedules.forEach((s) => {
								const exists = schedules.find((sch) => sch.id === s.id);
								if (!exists) {
									addSchedule(s);
									console.log(
										"[VoiceModulePanel] ✅ 添加日程:",
										s.id,
										"sourceSegmentId:",
										s.sourceSegmentId,
										"description:",
										s.description?.substring(0, 50),
									);
								}
							});

							// 调试：打印所有日程的 sourceSegmentId
							console.log(
								"[VoiceModulePanel] 📅 当前所有日程:",
								schedules.map((s) => ({
									id: s.id,
									sourceSegmentId: s.sourceSegmentId,
									description: s.description?.substring(0, 30),
								})),
							);
							console.log(
								"[VoiceModulePanel] 📅 过滤后的日程数量:",
								schedules.filter((s) => s.sourceSegmentId === audio.id).length,
								"（选中音频:",
								audio.id,
								"）",
							);

							// 如果加载的日程为空，标记为未提取，强制重新提取
							if (loadedSchedules.length === 0) {
								console.log(
									"[VoiceModulePanel] ⚠️ 检测到已提取标记，但数据库中没有日程数据，强制重新提取",
								);
								// 不在这里处理，会在后续的 processExtractionAndSummary 中处理
							}
						} catch (error) {
							console.error("[VoiceModulePanel] ❌ 加载日程失败:", error);
						}

						// 注意：待办事项的加载会在后续的查询逻辑中处理
						// 因为待办可能已经通过 handleAddTodo 保存到 Todo 表中
					}

					// 2. 检查是否需要转录完整音频（检查标记，没有标记就转录）
					// 必须找到完整音频记录，然后检查其 is_transcribed 标记
					const needsTranscription =
						!fullAudioRecording || !fullAudioRecording.is_transcribed;

					// 定义后续处理函数（在转录完成后执行）
					const processExtractionAndSummary = async () => {
						if (!persistenceServiceRef.current) {
							console.warn(
								"[VoiceModulePanel] ⚠️ PersistenceService 未初始化，跳过提取和纪要",
							);
							return;
						}

						// 重新查询音频记录，获取最新的标记状态
						const updatedRecordings =
							await persistenceServiceRef.current.queryAudioRecordings(
								startTime,
								endTime,
							);
							const updatedFullAudioRecording = updatedRecordings.find(
								(r: AudioRecording) =>
									(r.id === audio.id || r.segment_id === audio.id) &&
									r.is_full_audio === true,
							);

						if (!updatedFullAudioRecording) {
							console.log(
								"[VoiceModulePanel] ⚠️ 无法找到完整音频记录，跳过提取和纪要",
							);
							return;
						}

						// 3. 检查是否需要智能提取（使用完整音频记录的标记）
						// 必须已经转录过，才能进行提取
						if (!updatedFullAudioRecording.is_transcribed) {
							console.log(
								"[VoiceModulePanel] ⚠️ 音频尚未转录，无法进行提取和纪要生成",
							);
							return;
						}

						// 先获取转录文本，检查长度
						const fullAudioId =
							updatedFullAudioRecording.id ||
							updatedFullAudioRecording.segment_id ||
							audio.id;
						console.log(
							"[VoiceModulePanel] 📝 查询转录文本用于提取，音频ID:",
							fullAudioId,
							"（选中音频:",
							audio.id,
							"）",
						);
						const loadedTranscripts =
							await persistenceServiceRef.current.queryTranscripts(
								undefined,
								undefined,
								fullAudioId,
							);
						console.log(
							"[VoiceModulePanel] 📝 查询到的转录文本数量:",
							loadedTranscripts.length,
						);

						// 检查转录文本是否为空
						const hasValidTranscripts =
							loadedTranscripts.length > 0 &&
							loadedTranscripts.some((t) => {
								const text = t.optimizedText || t.rawText;
								return text && text.trim().length > 0;
							});

						if (!hasValidTranscripts) {
							console.warn(
								"[VoiceModulePanel] ⚠️ 转录文本为空或长度为0，无法进行提取",
							);
							setIsExtracting(false);
							await processSummary();
							return;
						}

						// 检查提取结果是否为空
						const loadedSchedulesForCheck =
							await persistenceServiceRef.current.querySchedules(
								undefined,
								undefined,
								audio.id,
							);
						const hasExtractedSchedules = loadedSchedulesForCheck.length > 0;

						// 如果提取结果为空，强制重新提取（无论标记如何）
						const needsExtraction =
							!hasExtractedSchedules ||
							!updatedFullAudioRecording.is_extracted;

						if (needsExtraction) {
							if (
								hasExtractedSchedules &&
								updatedFullAudioRecording.is_extracted
							) {
								console.log(
									"[VoiceModulePanel] ⚠️ 检测到已提取标记，但提取结果为空，强制重新提取",
								);
							}
							console.log(
								"[VoiceModulePanel] 🔍 检测到未提取的转录文本，开始智能提取...",
							);
							setIsExtracting(true);

							try {
								if (
									loadedTranscripts.length > 0 &&
									scheduleExtractionServiceRef.current &&
									todoExtractionServiceRef.current
								) {
									// 收集所有提取的日程和待办
									const extractedSchedules: ScheduleItem[] = [];
									const extractedTodos: ExtractedTodo[] = [];

									// 设置临时回调，收集提取结果
									scheduleExtractionServiceRef.current.setCallbacks({
										onScheduleExtracted: (schedule) => {
											extractedSchedules.push(schedule);
											// 调用原有的回调（如果存在）
											handleScheduleExtracted(schedule);
										},
									});

									todoExtractionServiceRef.current.setCallbacks({
										onTodoExtracted: (todo) => {
											extractedTodos.push(todo);
											// 调用原有的回调（如果存在）
											handleTodoExtracted(todo);
										},
									});

									// 为每个转录片段创建TranscriptSegment并加入提取队列
									// 确保使用正确的音频ID作为sourceSegmentId
									loadedTranscripts.forEach((transcript) => {
										// 如果没有优化文本，使用原始文本
										const textToUse =
											transcript.optimizedText || transcript.rawText;
										if (textToUse?.trim()) {
											// 创建一个临时的优化转录片段用于提取
											// 确保 segmentId 和 audioFileId 都设置为音频ID
											const transcriptForExtraction = {
												...transcript,
												segmentId: audio.id, // 确保使用音频ID
												audioFileId: audio.id, // 确保使用音频ID
												optimizedText:
													transcript.optimizedText || transcript.rawText,
												isOptimized: !!transcript.optimizedText || true, // 如果没有优化文本，使用原始文本
											};
											console.log(
												"[VoiceModulePanel] 📝 添加转录文本到提取队列:",
												{
													id: transcriptForExtraction.id,
													segmentId: transcriptForExtraction.segmentId,
													audioFileId: transcriptForExtraction.audioFileId,
													textLength: textToUse.length,
												},
											);
											// 添加到日程提取队列
											scheduleExtractionServiceRef.current?.enqueue(
												transcriptForExtraction,
											);
											// 添加到待办提取队列
											todoExtractionServiceRef.current?.enqueue(
												transcriptForExtraction,
											);
										}
									});

									console.log(
										"[VoiceModulePanel] ✅ 已将所有转录文本加入提取队列",
									);

									// 等待提取完成并保存到数据库
									const waitForExtraction = async () => {
										console.log(
											"[VoiceModulePanel] ⏳ 等待提取服务处理完成...",
										);

										// 等待提取服务处理完成（最多等待30秒，因为LLM调用可能需要更长时间）
										let waitTime = 0;
										const maxWaitTime = 30000; // 30秒
										const checkInterval = 1000; // 每1秒检查一次

										while (waitTime < maxWaitTime) {
											await new Promise((resolve) =>
												setTimeout(resolve, checkInterval),
											);
											waitTime += checkInterval;

											// 检查提取服务是否处理完成
											const scheduleService =
												scheduleExtractionServiceRef.current;
											const todoService = todoExtractionServiceRef.current;

											const scheduleStatus =
												scheduleService?.getQueueStatus() ?? {
													queueLength: 0,
													isProcessing: false,
												};
											const todoStatus = todoService?.getQueueStatus?.() ?? {
												queueLength: 0,
												isProcessing: false,
											};

											const isScheduleIdle =
												!scheduleStatus.isProcessing &&
												scheduleStatus.queueLength === 0;
											const isTodoIdle =
												!todoStatus.isProcessing &&
												todoStatus.queueLength === 0;

											console.log("[VoiceModulePanel] 📊 提取状态检查:", {
												waitTime,
												scheduleProcessing: scheduleStatus.isProcessing,
												scheduleQueueLength: scheduleStatus.queueLength,
												todoProcessing: todoStatus.isProcessing,
												todoQueueLength: todoStatus.queueLength,
												extractedSchedules: extractedSchedules.length,
												extractedTodos: extractedTodos.length,
											});

											if (isScheduleIdle && isTodoIdle) {
												console.log("[VoiceModulePanel] ✅ 提取服务处理完成");
												break;
											}
										}

										if (waitTime >= maxWaitTime) {
											console.warn(
												"[VoiceModulePanel] ⚠️ 提取超时，但继续保存已提取的结果",
											);
										}

										// 保存提取的日程和待办到数据库
										try {
											let schedulesSaved = false;
											let todosSaved = false;

											// 1. 保存日程到数据库
											if (
												extractedSchedules.length > 0 &&
												persistenceServiceRef.current
											) {
												await persistenceServiceRef.current.saveSchedules(
													extractedSchedules,
												);
												console.log(
													"[VoiceModulePanel] ✅ 已保存",
													extractedSchedules.length,
													"个日程到数据库",
												);
												schedulesSaved = true;

												// 保存后，立即加载并显示到store
												const loadedSchedules =
													await persistenceServiceRef.current.querySchedules(
														undefined,
														undefined,
														audio.id,
													);
												console.log(
													"[VoiceModulePanel] 📅 重新加载日程，数量:",
													loadedSchedules.length,
												);

												// 清除不属于当前音频的日程，然后添加当前音频的日程
												schedules.forEach((s) => {
													if (s.sourceSegmentId !== audio.id) {
														removeSchedule(s.id);
													}
												});

												loadedSchedules.forEach((s) => {
													const exists = schedules.find(
														(sch) => sch.id === s.id,
													);
													if (!exists) {
														addSchedule(s);
														console.log(
															"[VoiceModulePanel] ✅ 添加日程到store:",
															s.id,
															"description:",
															s.description?.substring(0, 50),
														);
													}
												});
											} else if (extractedSchedules.length === 0) {
												schedulesSaved = true; // 没有日程需要保存，视为成功
											}

											// 2. 保存待办到数据库（保存到 AudioRecording 的 extracted_todos 字段）
											if (extractedTodos.length > 0) {
												const recordingIdToSave =
													updatedFullAudioRecording.id ||
													updatedFullAudioRecording.segment_id ||
													audio.id;
												console.log(
													"[VoiceModulePanel] 💾 保存待办到数据库，音频ID:",
													recordingIdToSave,
													"待办数量:",
													extractedTodos.length,
												);

												// 将待办转换为JSON格式保存
												const todosData = extractedTodos.map((todo) => ({
													id: todo.id,
													title: todo.title,
													description: todo.description,
													deadline: todo.deadline?.toISOString(),
													priority: todo.priority,
													sourceSegmentId: todo.sourceSegmentId,
													extractedAt: todo.extractedAt.toISOString(),
												}));

												const saveTodosResponse = await fetch(
													`${API_BASE_URL}/audio/${recordingIdToSave}/extracted-todos`,
													{
														method: "POST",
														headers: {
															"Content-Type": "application/json",
														},
														body: JSON.stringify({ todos: todosData }),
													},
												);

												if (!saveTodosResponse.ok) {
													console.error(
														"[VoiceModulePanel] ❌ 保存待办到数据库失败:",
														saveTodosResponse.statusText,
													);
													throw new Error("保存待办失败");
												}

												console.log(
													"[VoiceModulePanel] ✅ 已保存",
													extractedTodos.length,
													"个待办到数据库",
												);
												todosSaved = true;
											} else {
												todosSaved = true; // 没有待办需要保存，视为成功
											}

											// 3. 只有日程和待办都保存成功后才更新提取标记
											if (schedulesSaved && todosSaved) {
												const recordingIdToMark =
													updatedFullAudioRecording.id ||
													updatedFullAudioRecording.segment_id ||
													audio.id;
												console.log(
													"[VoiceModulePanel] 🔖 更新提取标记，音频ID:",
													recordingIdToMark,
												);
												const markResponse = await fetch(
													`${API_BASE_URL}/audio/${recordingIdToMark}/mark-extracted`,
													{
														method: "POST",
													},
												);
												if (!markResponse.ok) {
													console.error(
														"[VoiceModulePanel] ❌ 更新提取标记失败:",
														markResponse.statusText,
													);
													throw new Error("更新提取标记失败");
												} else {
													console.log("[VoiceModulePanel] ✅ 提取标记已更新");
												}
											} else {
												console.warn(
													"[VoiceModulePanel] ⚠️ 日程或待办保存未完成，不更新提取标记",
												);
											}
										} catch (saveError) {
											console.error(
												"[VoiceModulePanel] ❌ 保存提取结果失败:",
												saveError,
											);
											// 不更新标记，因为保存失败
										}

										setIsExtracting(false);

										// 提取完成后，检查是否需要生成纪要
										await processSummary();
									};

									// 立即开始处理队列（不需要延迟）
									console.log("[VoiceModulePanel] 🚀 开始处理提取队列...");
									// 等待一小段时间确保队列已添加，然后开始处理
									setTimeout(() => {
										waitForExtraction();
									}, 100);
								} else {
									console.warn(
										"[VoiceModulePanel] ⚠️ 没有找到转录文本或提取服务未初始化，跳过提取",
									);
									setIsExtracting(false);
									// 如果没有转录文本，直接检查纪要
									await processSummary();
								}
							} catch (error) {
								console.error("[VoiceModulePanel] ❌ 智能提取失败:", error);
								setIsExtracting(false);
								// 提取失败后，仍然尝试生成纪要
								await processSummary();
							}
						} else {
							// 如果已经提取过，直接检查纪要
							console.log("[VoiceModulePanel] ✅ 音频已提取，直接检查纪要");
							await processSummary();
						}

						// 4. 检查是否需要生成纪要（使用完整音频记录的标记）
						async function processSummary() {
							if (!persistenceServiceRef.current) {
								console.warn(
									"[VoiceModulePanel] ⚠️ PersistenceService 未初始化，跳过纪要生成",
								);
								return;
							}

							const finalRecordings =
								await persistenceServiceRef.current.queryAudioRecordings(
									startTime,
									endTime,
								);
							const finalFullAudioRecording = finalRecordings.find(
								(r: AudioRecording) =>
									(r.id === audio.id || r.segment_id === audio.id) &&
									r.is_full_audio === true,
							);

							if (!finalFullAudioRecording) {
								console.warn(
									"[VoiceModulePanel] ⚠️ 无法找到完整音频记录，跳过纪要生成",
								);
								return;
							}

							if (!finalFullAudioRecording.is_transcribed) {
								console.warn("[VoiceModulePanel] ⚠️ 音频尚未转录，无法生成纪要");
								return;
							}

							// 先获取转录文本，检查长度
							const fullAudioIdForSummary =
								finalFullAudioRecording.id ||
								finalFullAudioRecording.segment_id ||
								audio.id;
							console.log(
								"[VoiceModulePanel] 📝 查询转录文本用于生成纪要，音频ID:",
								fullAudioIdForSummary,
							);
							const loadedTranscriptsForSummary =
								await persistenceServiceRef.current.queryTranscripts(
									undefined,
									undefined,
									fullAudioIdForSummary,
								);
							console.log(
								"[VoiceModulePanel] 📝 查询到的转录文本数量:",
								loadedTranscriptsForSummary.length,
							);

							// 检查转录文本是否为空
							const hasValidTranscriptsForSummary =
								loadedTranscriptsForSummary.length > 0 &&
								loadedTranscriptsForSummary.some((t) => {
									const text = t.optimizedText || t.rawText;
									return text && text.trim().length > 0;
								});

							if (!hasValidTranscriptsForSummary) {
								console.warn(
									"[VoiceModulePanel] ⚠️ 转录文本为空或长度为0，无法生成纪要",
								);
								setIsSummarizing(false);
								return;
							}

							// 检查纪要是否为空
							let existingSummary = "";
							try {
								const audioInfoResponse = await fetch(
									`${API_BASE_URL}/audio/${audio.id}`,
								);
								if (audioInfoResponse.ok) {
									const audioInfo = await audioInfoResponse.json();
									existingSummary = audioInfo.summary_text || "";
								}
							} catch (error) {
								console.error("[VoiceModulePanel] ❌ 查询纪要失败:", error);
							}

							// 如果纪要为空或长度为0，强制重新生成（无论标记如何）
							const needsSummary =
								!existingSummary ||
								existingSummary.trim().length === 0 ||
								!finalFullAudioRecording.is_summarized;

							if (needsSummary) {
								if (
									existingSummary &&
									finalFullAudioRecording.is_summarized
								) {
									console.log(
										"[VoiceModulePanel] ⚠️ 检测到已生成标记，但纪要内容为空，强制重新生成",
									);
								}
								console.log(
									"[VoiceModulePanel] 🔍 检测到未生成纪要，开始生成...",
								);
								setIsSummarizing(true);

								try {
									if (loadedTranscriptsForSummary.length > 0) {
										const allText = loadedTranscriptsForSummary
											.map(
												(t: TranscriptSegment) => t.optimizedText || t.rawText,
											)
											.filter((t: string | undefined) => t?.trim())
											.join("\n");

										console.log(
											"[VoiceModulePanel] 📝 合并后的文本长度:",
											allText.length,
										);

										if (allText.trim() && optimizationServiceRef.current) {
											const optimizationService = optimizationServiceRef.current;
											// 使用类型断言访问内部 AI 客户端（仅在必要时）
											const optimizationWithClient =
												optimizationService as unknown as {
													aiClient?: OpenAI | null;
												};
											const aiClient = optimizationWithClient.aiClient;

											if (aiClient) {
												console.log(
													"[VoiceModulePanel] 🤖 开始调用LLM生成纪要...",
												);
												const response = await aiClient.chat.completions.create(
													{
														model: "deepseek-chat",
														messages: [
															{
																role: "system",
																content:
																	"你是一个专业的智能会议纪要生成助手。根据录音转录文本，生成简洁的会议纪要。",
															},
															{
																role: "user",
																content: `请基于以下录音转录内容，生成会议纪要：\n\n${allText}`,
															},
														],
														temperature: 0.7,
														max_tokens: 2000,
													},
												);

												if (response.choices?.[0]?.message?.content) {
													const summary = response.choices[0].message.content;
													setMeetingSummary(summary);
													console.log(
														"[VoiceModulePanel] ✅ 纪要生成成功，长度:",
														summary.length,
													);

													// 保存纪要到数据库（通过更新 AudioRecording 的 summary_text 字段）
													try {
														const recordingIdToMark =
															finalFullAudioRecording.id ||
															finalFullAudioRecording.segment_id ||
															audio.id;
														const saveSummaryResponse = await fetch(
															`${API_BASE_URL}/audio/${recordingIdToMark}/summary`,
															{
																method: "POST",
																headers: {
																	"Content-Type": "application/json",
																},
																body: JSON.stringify({ summary: summary }),
															},
														);

														if (!saveSummaryResponse.ok) {
															console.error(
																"[VoiceModulePanel] ❌ 保存纪要到数据库失败:",
																saveSummaryResponse.statusText,
															);
															throw new Error("保存纪要失败");
														}

														console.log(
															"[VoiceModulePanel] ✅ 纪要已保存到数据库",
														);

														// 只有保存成功后才更新标记
														console.log(
															"[VoiceModulePanel] 🔖 更新纪要标记，音频ID:",
															recordingIdToMark,
														);
														const markResponse = await fetch(
															`${API_BASE_URL}/audio/${recordingIdToMark}/mark-summarized`,
															{
																method: "POST",
															},
														);
														if (!markResponse.ok) {
															console.error(
																"[VoiceModulePanel] ❌ 更新纪要标记失败:",
																markResponse.statusText,
															);
														} else {
															console.log(
																"[VoiceModulePanel] ✅ 纪要标记已更新",
															);
														}
														setIsSummarizing(false);
													} catch (saveError) {
														console.error(
															"[VoiceModulePanel] ❌ 保存纪要失败:",
															saveError,
														);
														setIsSummarizing(false);
														// 不更新标记，因为保存失败
													}
												} else {
													console.warn("[VoiceModulePanel] ⚠️ LLM返回空内容");
													setIsSummarizing(false);
												}
											} else {
												console.warn("[VoiceModulePanel] ⚠️ AI客户端未初始化");
												setIsSummarizing(false);
											}
										} else {
											console.warn(
												"[VoiceModulePanel] ⚠️ 文本为空或优化服务未初始化",
											);
											setIsSummarizing(false);
										}
									} else {
										console.warn(
											"[VoiceModulePanel] ⚠️ 没有找到转录文本，无法生成纪要",
										);
										setIsSummarizing(false);
									}
								} catch (error) {
									console.error("[VoiceModulePanel] ❌ 生成纪要失败:", error);
									setIsSummarizing(false);
								}
							} else {
								console.log(
									"[VoiceModulePanel] ✅ 音频已生成纪要，无需重新生成",
								);
								setIsSummarizing(false);
							}
						}
					};

					if (needsTranscription && audio.fileUrl) {
						console.log(
							"[VoiceModulePanel] 🔍 检测到需要转录的完整音频（标记检查：",
							fullAudioRecording
								? fullAudioRecording.is_transcribed
								: "无完整音频记录",
							"），开始转录...",
						);
						setIsTranscribing(true);

						try {
							// 获取完整音频文件
							const normalizedUrl = normalizeAudioUrl(audio.fileUrl);
							if (normalizedUrl) {
								const response = await fetch(normalizedUrl);
								if (response.ok) {
									const blob = await response.blob();

									// 转录音频
									const formData = new FormData();
									formData.append("file", blob, `${audio.id}.webm`);
									formData.append("optimize", "true");
									formData.append("extract_todos", "false"); // 先不提取，等转录完成后再提取
									formData.append("extract_schedules", "false");

									const transcribeResponse = await fetch(
										`${API_BASE_URL}/audio/transcribe-file`,
										{
											method: "POST",
											body: formData,
										},
									);

									if (transcribeResponse.ok) {
										const result = await transcribeResponse.json();
										const transcriptText = result.transcript || "";
										const optimizedText = result.optimized_text || "";

										if (transcriptText.trim()) {
											// 将转录文本按段落分割（类似测试音频的处理逻辑）
											const paragraphRegex = /([。！？\n]+)/g;
											const paragraphs: string[] = [];
											let lastIndex = 0;
											let match: RegExpExecArray | null;

											while (true) {
												match = paragraphRegex.exec(transcriptText);
												if (!match) break;
												const paragraphText = transcriptText
													.substring(lastIndex, match.index)
													.trim();
												if (paragraphText) {
													paragraphs.push(paragraphText);
												}
												lastIndex = match.index + match[0].length;
											}

											if (lastIndex < transcriptText.length) {
												const remainingText = transcriptText
													.substring(lastIndex)
													.trim();
												if (remainingText) {
													paragraphs.push(remainingText);
												}
											}

											// 如果没有找到段落分隔符，按固定长度分段（每50个字符一段）
											if (paragraphs.length === 0) {
												const chunkSize = 50;
												for (
													let i = 0;
													i < transcriptText.length;
													i += chunkSize
												) {
													const chunk = transcriptText
														.substring(i, i + chunkSize)
														.trim();
													if (chunk) {
														paragraphs.push(chunk);
													}
												}
												if (paragraphs.length === 0) {
													paragraphs.push(transcriptText);
												}
											}

											// 处理优化文本
											const optimizedParagraphs: string[] = [];
											if (optimizedText) {
												const optimizedLines = optimizedText
													.split(/\n+/)
													.filter((line: string) => line.trim());
												if (optimizedLines.length > 0) {
													if (optimizedLines.length === paragraphs.length) {
														optimizedParagraphs.push(
															...optimizedLines.map((line: string) =>
																line.trim(),
															),
														);
													} else if (
														optimizedLines.length === 1 &&
														paragraphs.length > 1
													) {
														optimizedParagraphs.push(
															...Array(paragraphs.length).fill(
																optimizedLines[0].trim(),
															),
														);
													} else {
														const mergedOptimizedText = optimizedLines
															.join(" ")
															.trim();
														optimizedParagraphs.push(
															...Array(paragraphs.length).fill(
																mergedOptimizedText,
															),
														);
													}
												}
											}

											// 创建转录片段
											const audioDuration =
												audio.duration ||
												audio.endTime.getTime() - audio.startTime.getTime();
											const totalTextLength = paragraphs.reduce(
												(sum, p) => sum + p.length,
												0,
											);
											let currentTimeOffset = 0;

											const transcriptSegments: TranscriptSegment[] =
												paragraphs.map((paragraph, index) => {
													const segmentId = `transcript_${audio.id}_${index}_${Date.now()}`;
													const optimizedPara = optimizedParagraphs[index];

													const textRatio =
														totalTextLength > 0
															? paragraph.length / totalTextLength
															: 1 / paragraphs.length;
													const segmentDuration = audioDuration * textRatio;
													const segmentStart = currentTimeOffset;
													const segmentEnd =
														currentTimeOffset + segmentDuration;

													// 使用音频的实际开始时间 + 相对偏移量
													const absoluteTimestamp = new Date(
														audio.startTime.getTime() + segmentStart,
													);

													currentTimeOffset = segmentEnd;

													const absoluteEndTime = new Date(
														audio.startTime.getTime() + segmentEnd,
													);

													return {
														id: segmentId,
														timestamp: absoluteTimestamp, // 使用实际时间戳
														absoluteStart: absoluteTimestamp,
														absoluteEnd: absoluteEndTime,
														segmentId: audio.id, // 用于前端过滤
														audioFileId: audio.id, // 用于后端查询和关联
														rawText: paragraph,
														optimizedText: optimizedPara?.trim()
															? optimizedPara
															: undefined,
														isOptimized: !!(
															optimizedText &&
															optimizedPara &&
															optimizedPara.trim()
														),
														isInterim: false,
														containsSchedule: false,
														audioStart: segmentStart,
														audioEnd: segmentEnd,
														uploadStatus: "uploaded" as const,
													};
												});

											// 保存转录文本到数据库
											try {
												await persistenceServiceRef.current.saveTranscripts(
													transcriptSegments,
												);
												console.log(
													"[VoiceModulePanel] ✅ 转录文本已保存到数据库",
												);

												// 只有保存成功后才更新标记
												const recordingIdToMark = fullAudioRecording
													? fullAudioRecording.id ||
														fullAudioRecording.segment_id
													: audio.id;
												console.log(
													"[VoiceModulePanel] 🔖 更新转录标记，音频ID:",
													recordingIdToMark,
												);
												const markResponse = await fetch(
													`${API_BASE_URL}/audio/${recordingIdToMark}/mark-transcribed`,
													{
														method: "POST",
													},
												);
												if (!markResponse.ok) {
													console.error(
														"[VoiceModulePanel] ❌ 更新转录标记失败:",
														markResponse.statusText,
													);
												} else {
													console.log("[VoiceModulePanel] ✅ 转录标记已更新");
												}
											} catch (saveError) {
												console.error(
													"[VoiceModulePanel] ❌ 保存转录文本失败:",
													saveError,
												);
												throw saveError; // 重新抛出错误，不更新标记
											}

											// 添加到store
											for (const t of transcriptSegments) {
												addTranscript(t);
											}

											console.log(
												"[VoiceModulePanel] ✅ 完整音频转录完成并已保存，共",
												paragraphs.length,
												"个片段",
											);

											// 转录完成后，开始检查提取和纪要
											await processExtractionAndSummary();
										}
									}
								}
							}
						} catch (error) {
							console.error("[VoiceModulePanel] ❌ 转录失败:", error);
							setErrorWithAutoHide("转录失败，请重试");
						} finally {
							setIsTranscribing(false);
						}
					} else {
						// 如果不需要转录（已经转录过），直接检查提取和纪要
						await processExtractionAndSummary();
					}

					// 5. 根据音频ID加载已有的转录文本（用于显示）
					console.log(
						"[VoiceModulePanel] 📝 根据音频ID查询数据: audioId=",
						audio.id,
					);

					// 根据音频ID查询转录文本（用于显示，不是用于判断是否需要生成）
					const loadedTranscriptsForDisplay =
						await persistenceServiceRef.current.queryTranscripts(
							undefined,
							undefined,
							audio.id,
						);
					console.log(
						"[VoiceModulePanel] 📝 根据音频ID查询到的转录文本数量:",
						loadedTranscriptsForDisplay.length,
					);

					// 调试：打印转录文本的 segmentId 和 audioFileId
					if (loadedTranscriptsForDisplay.length > 0) {
						console.log(
							"[VoiceModulePanel] 📝 转录文本详情:",
							loadedTranscriptsForDisplay.map((t) => ({
								id: t.id,
								segmentId: t.segmentId,
								audioFileId: t.audioFileId,
								rawText: t.rawText?.substring(0, 30),
							})),
						);
					}

					// 添加当前音频的转录文本到store（用于显示）
					loadedTranscriptsForDisplay.forEach((t) => {
						const exists = transcripts.find((tr) => tr.id === t.id);
						if (!exists) {
							addTranscript(t);
							console.log(
								"[VoiceModulePanel] ✅ 添加转录文本:",
								t.id,
								"segmentId:",
								t.segmentId,
								"audioFileId:",
								t.audioFileId,
								"rawText:",
								t.rawText?.substring(0, 50),
							);
						}
					});

					if (loadedTranscriptsForDisplay.length > 0) {
						console.log("[VoiceModulePanel] ✅ 已加载转录文本用于显示");
					}

					// 如果已经有提取标记，数据已在上面加载，这里不需要重复加载
					// 如果没有提取标记，这里也不需要加载（会在提取完成后自动添加）

					// 设置音频URL
					if (audio.fileUrl) {
						const normalizedUrl = normalizeAudioUrl(audio.fileUrl);
						setCurrentAudioUrl(normalizedUrl);
						if (audioPlayerRef.current && normalizedUrl) {
							const audioEl = audioPlayerRef.current;
							// 先移除之前的监听器，避免重复
							const handleLoadedMetadata = () => {
								if (
									audioEl?.duration &&
									Number.isFinite(audioEl.duration) &&
									audioEl.duration > 0
								) {
									console.log(
										"[VoiceModulePanel] 📊 音频元数据加载完成，duration:",
										audioEl.duration,
									);
									setDuration(audioEl.duration);
								}
							};
							audioEl.removeEventListener(
								"loadedmetadata",
								handleLoadedMetadata,
							);
							audioEl.src = normalizedUrl;
							audioEl.load();
							audioEl.addEventListener("loadedmetadata", handleLoadedMetadata, {
								once: true,
							});
							// 如果音频已经加载了，立即获取duration
							if (
								audioEl.readyState >= 1 &&
								audioEl.duration &&
								Number.isFinite(audioEl.duration) &&
								audioEl.duration > 0
							) {
								console.log(
									"[VoiceModulePanel] 📊 音频已就绪，立即获取duration:",
									audioEl.duration,
								);
								setDuration(audioEl.duration);
							}
						}
					} else {
						setCurrentAudioUrl(null);
						setDuration(0);
					}
				} catch (error) {
					console.error("[VoiceModulePanel] ❌ 加载音频数据失败:", error);
					setErrorWithAutoHide("加载音频数据失败，请重试");
				}
			}
		},
		[
			viewMode,
			addTranscript,
			addSchedule,
			transcripts,
			schedules,
			setError,
			setIsTranscribing,
			setIsExtracting,
			setMeetingSummary,
			setCurrentAudioUrl,
			optimizationServiceRef,
			scheduleExtractionServiceRef,
			todoExtractionServiceRef,
			audioPlayerRef,
		],
	);

	// 处理视图切换（原文/智能优化版）
	const handleViewChange = useCallback((view: "original" | "optimized") => {
		setCurrentView(view);
	}, []);

	// 处理播放器操作（先声明，供handleModeChange使用）
	const handlePause = useCallback(() => {
		if (audioPlayerRef.current) {
			audioPlayerRef.current.pause();
		}
	}, []);

	// 处理模式切换
	const handleModeChange = useCallback(
		(mode: ViewMode) => {
			// 切换到录音模式时，清空回看模式的内容（避免残留）
			if (mode === "recording") {
				console.log("[VoiceModulePanel] 🔄 切换到录音模式，清空回看模式的内容");
				// 停止播放
				if (isPlaying) {
					handlePause();
					setIsPlaying(false);
				}
				// 清空选中的音频
				setSelectedAudioId(undefined);
				setCurrentAudioUrl(null);
				// 清空纪要
				setMeetingSummary("");
				// 清空待确认列表
				setPendingTodos([]);
				setPendingSchedules([]);
				// 清空当前播放时间
				setCurrentTime(0);
				if (audioPlayerRef.current) {
					audioPlayerRef.current.pause();
					audioPlayerRef.current.src = "";
					audioPlayerRef.current.load();
				}
			}
			// 切换到回看模式时，如果正在录音则停止录音
			if (mode === "playback" && isRecording) {
				handleStopRecording();
			}
			setViewMode(mode);
		},
		[isPlaying, isRecording, handlePause, handleStopRecording],
	);

	// 监听全屏模式切换，停止播放并加载当天音频列表
	useEffect(() => {
		const {
			useDynamicIslandStore,
		} = require("@/lib/store/dynamic-island-store");
		const { IslandMode } = require("@/components/DynamicIsland/types");

		let previousMode = useDynamicIslandStore.getState().mode;

		// 检查当前模式并停止播放（如果不在全屏模式）
		const checkAndStop = () => {
			const currentMode = useDynamicIslandStore.getState().mode;

			// 如果切换到全屏模式，加载当天音频列表
			if (
				currentMode === IslandMode.FULLSCREEN &&
				previousMode !== IslandMode.FULLSCREEN
			) {
				console.log("[VoiceModulePanel] 📱 切换到全屏模式，加载当天音频列表");
				handleDateChange(selectedDate).catch((err) => {
					console.error("[VoiceModulePanel] ❌ 加载当天音频列表失败:", err);
				});
			}

			// 如果不在全屏模式，停止播放
			if (
				currentMode !== IslandMode.FULLSCREEN &&
				isPlaying &&
				audioPlayerRef.current
			) {
				audioPlayerRef.current.pause();
				setIsPlaying(false);
			}

			previousMode = currentMode;
		};

		// 立即检查一次
		checkAndStop();

		// 使用定时器定期检查模式变化（因为 zustand 没有直接的 subscribe 方法）
		const interval = setInterval(checkAndStop, 500);
		return () => clearInterval(interval);
	}, [isPlaying, selectedDate, handleDateChange]);

	// 处理片段点击（协同功能）- 参考代码实现
	// biome-ignore lint/correctness/useExhaustiveDependencies: 回调依赖 dayAudioSegments 的多种遍历和排序操作，完整列出将导致依赖数组过于复杂，这里依赖核心状态（录音状态、音频列表等）并通过内部逻辑保证一致性
	const handleSegmentClick = useCallback(
		(segment: TranscriptSegment) => {
			console.log("[VoiceModulePanel] 点击文本片段:", segment.id, segment);
			console.log("[VoiceModulePanel] segment.segmentId:", segment.segmentId);
			console.log(
				"[VoiceModulePanel] dayAudioSegments:",
				dayAudioSegments.map((s) => ({ id: s.id, startTime: s.startTime })),
			);
			console.log(
				"[VoiceModulePanel] audioSegments:",
				audioSegments.map((s) => ({ id: s.id, startTime: s.startTime })),
			);
			setHighlightedSegmentId(segment.id);

			// 如果正在录音，不允许跳转
			if (isRecording) {
				console.log("[VoiceModulePanel] 正在录音，不允许跳转");
				return;
			}

			// 优先在dayAudioSegments中查找（当前日期的音频列表）
			let targetSegment: AudioSegment | undefined;

			// 1. 优先使用segmentId匹配（先在dayAudioSegments中查找）
			if (segment.segmentId) {
				targetSegment = dayAudioSegments.find(
					(s) => s.id === segment.segmentId,
				);
				if (!targetSegment) {
					// 如果dayAudioSegments中没找到，再在全局audioSegments中查找
					targetSegment = audioSegments.find((s) => s.id === segment.segmentId);
				}
				console.log(
					"[VoiceModulePanel] 通过segmentId查找:",
					segment.segmentId,
					targetSegment ? "找到" : "未找到",
				);
			}

			// 2. 如果没有segmentId，使用绝对时间匹配（先在dayAudioSegments中查找）
			if (!targetSegment && segment.absoluteStart) {
				const abs = segment.absoluteStart.getTime();
				targetSegment = dayAudioSegments.find(
					(s) => s.startTime.getTime() <= abs && s.endTime.getTime() >= abs,
				);
				if (!targetSegment) {
					// 如果dayAudioSegments中没找到，再在全局audioSegments中查找
					targetSegment = audioSegments.find(
						(s) => s.startTime.getTime() <= abs && s.endTime.getTime() >= abs,
					);
				}
				console.log(
					"[VoiceModulePanel] 通过绝对时间查找:",
					abs,
					targetSegment ? "找到" : "未找到",
				);
			}

			// 3. 如果仍未找到，使用timestamp匹配（先在dayAudioSegments中查找）
			if (!targetSegment && segment.timestamp) {
				const timestamp = segment.timestamp.getTime();
				targetSegment = dayAudioSegments.find(
					(s) =>
						s.startTime.getTime() <= timestamp &&
						s.endTime.getTime() >= timestamp,
				);
				if (!targetSegment) {
					// 如果dayAudioSegments中没找到，再在全局audioSegments中查找
					targetSegment = audioSegments.find(
						(s) =>
							s.startTime.getTime() <= timestamp &&
							s.endTime.getTime() >= timestamp,
					);
				}
				console.log(
					"[VoiceModulePanel] 通过timestamp查找:",
					timestamp,
					targetSegment ? "找到" : "未找到",
				);
			}

			// 4. 如果仍未找到，使用录音开始时间计算
			if (
				!targetSegment &&
				segment.audioStart !== undefined &&
				recordingStartTime
			) {
				const startTime = new Date(
					recordingStartTime.getTime() + segment.audioStart,
				);
				targetSegment = dayAudioSegments.find(
					(s) =>
						s.startTime.getTime() <= startTime.getTime() &&
						s.endTime.getTime() >= startTime.getTime(),
				);
				if (!targetSegment) {
					targetSegment = audioSegments.find(
						(s) =>
							s.startTime.getTime() <= startTime.getTime() &&
							s.endTime.getTime() >= startTime.getTime(),
					);
				}
				console.log(
					"[VoiceModulePanel] 通过录音开始时间查找:",
					startTime.getTime(),
					targetSegment ? "找到" : "未找到",
				);
			}

			// 5. 如果仍未找到，尝试使用当前日期的音频文件
			if (!targetSegment && dayAudioSegments.length > 0) {
				// 使用当前日期最新的音频文件
				targetSegment = dayAudioSegments.sort(
					(a, b) => b.endTime.getTime() - a.endTime.getTime(),
				)[0];
				console.log(
					"[VoiceModulePanel] 使用当前日期最新的音频文件:",
					targetSegment.id,
				);
			} else if (!targetSegment && audioSegments.length > 0) {
				// 否则使用所有音频中最新的
				targetSegment = audioSegments.sort(
					(a, b) => b.endTime.getTime() - a.endTime.getTime(),
				)[0];
				console.log(
					"[VoiceModulePanel] 使用全局最新的音频文件:",
					targetSegment.id,
				);
			}

			if (!targetSegment) {
				console.warn("[VoiceModulePanel] 未找到对应的音频文件", {
					segmentId: segment.segmentId,
					absoluteStart: segment.absoluteStart,
					timestamp: segment.timestamp,
					audioStart: segment.audioStart,
					dayAudioSegmentsCount: dayAudioSegments.length,
					audioSegmentsCount: audioSegments.length,
				});
				return;
			}

			console.log("[VoiceModulePanel] 找到音频文件:", targetSegment.fileUrl);

			if (!audioPlayerRef.current) {
				console.warn("[VoiceModulePanel] 音频播放器未初始化");
				return;
			}

			// 计算在该分段内的偏移（秒）
			let seekSeconds = 0;
			if (segment.absoluteStart && targetSegment.startTime) {
				// 优先使用绝对时间
				seekSeconds = Math.max(
					0,
					(segment.absoluteStart.getTime() -
						targetSegment.startTime.getTime()) /
						1000,
				);
			} else if (segment.audioStart !== undefined) {
				// 如果没有绝对时间，直接使用audioStart（相对于录音开始的时间，单位：毫秒）
				// 如果targetSegment有startTime，需要计算偏移
				if (targetSegment.startTime && recordingStartTime) {
					// 计算segment的绝对时间
					const segmentAbsoluteTime =
						recordingStartTime.getTime() + segment.audioStart;
					seekSeconds = Math.max(
						0,
						(segmentAbsoluteTime - targetSegment.startTime.getTime()) / 1000,
					);
				} else {
					// 如果没有recordingStartTime，直接使用audioStart（假设它是相对于音频文件开始的时间）
					seekSeconds = Math.max(0, segment.audioStart / 1000);
				}
			} else if (segment.timestamp && targetSegment.startTime) {
				// 最后兜底：使用timestamp
				seekSeconds = Math.max(
					0,
					(segment.timestamp.getTime() - targetSegment.startTime.getTime()) /
						1000,
				);
			}

			console.log("[VoiceModulePanel] 跳转到时间:", seekSeconds, "秒");

			// 设置当前音频URL
			if (targetSegment.fileUrl) {
				setCurrentAudioUrl(targetSegment.fileUrl);

				// 确保音频已加载
				if (audioPlayerRef.current.src !== targetSegment.fileUrl) {
					console.log(
						"[VoiceModulePanel] 加载新音频文件:",
						targetSegment.fileUrl,
					);
					audioPlayerRef.current.src = targetSegment.fileUrl;
					audioPlayerRef.current.load();
					audioPlayerRef.current.addEventListener(
						"loadedmetadata",
						() => {
							if (audioPlayerRef.current) {
								const targetTime = Math.min(
									seekSeconds,
									audioPlayerRef.current.duration || 0,
								);
								console.log("[VoiceModulePanel] 设置播放时间:", targetTime);
								audioPlayerRef.current.currentTime = targetTime;
								setCurrentTime(targetTime);
								audioPlayerRef.current.play().catch((error) => {
									console.warn("[VoiceModulePanel] 播放失败:", error);
								});
							}
						},
						{ once: true },
					);
				} else {
					// 如果URL相同，直接设置时间并播放
					console.log(
						"[VoiceModulePanel] 使用现有音频文件，跳转到:",
						seekSeconds,
					);
					audioPlayerRef.current.pause();
					const targetTime = Math.min(
						seekSeconds,
						audioPlayerRef.current.duration || 0,
					);
					audioPlayerRef.current.currentTime = targetTime;
					setCurrentTime(targetTime);
					Promise.resolve().then(() => {
						if (audioPlayerRef.current) {
							audioPlayerRef.current.play().catch((error) => {
								console.warn("[VoiceModulePanel] 播放失败:", error);
							});
						}
					});
				}
			}
		},
		[
			isRecording,
			recordingStartTime,
			audioSegments,
			setCurrentTime,
			selectedDate,
			setCurrentAudioUrl,
		],
	);

	const handlePlay = useCallback(() => {
		if (audioPlayerRef.current && currentAudioUrl) {
			audioPlayerRef.current.play();
		}
	}, [currentAudioUrl]);

	const handleSeek = useCallback(
		(time: number) => {
			if (audioPlayerRef.current) {
				// 确保time不超过duration
				const maxTime =
					audioPlayerRef.current.duration &&
					Number.isFinite(audioPlayerRef.current.duration)
						? audioPlayerRef.current.duration
						: duration || Infinity;
				const clampedTime = Math.max(0, Math.min(time, maxTime));
				audioPlayerRef.current.currentTime = clampedTime;
				setCurrentTime(clampedTime);
				console.log(
					"[VoiceModulePanel] 跳转到时间:",
					clampedTime,
					"秒 (duration:",
					maxTime,
					")",
				);
			}
		},
		[duration],
	);

	const handleSkip = useCallback(
		(seconds: number) => {
			if (audioPlayerRef.current) {
				const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
				handleSeek(newTime);
			}
		},
		[currentTime, duration, handleSeek],
	);

	// 格式化时间显示
	const formatTime = useCallback((seconds: number): string => {
		const hours = Math.floor(seconds / 3600);
		const mins = Math.floor((seconds % 3600) / 60);
		const secs = Math.floor(seconds % 60);

		if (hours > 0) {
			return `${hours}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
		}
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	}, []);

	// 过滤转录片段：根据选中音频ID过滤，不是通过时间过滤
	const filteredTranscripts = useMemo(() => {
		const filtered = transcripts.filter((t) => {
			// 如果选中了音频，只显示该音频的片段（通过segmentId或audioFileId匹配）
			if (selectedAudioId && viewMode === "playback") {
				// 优先通过segmentId匹配
				if (
					t.segmentId === selectedAudioId ||
					t.audioFileId === selectedAudioId
				) {
					return true;
				}
				// 如果都没有，不显示
				return false;
			}

			// 如果没有选中音频，且是回看模式，不显示任何文本（等待选择音频）
			if (viewMode === "playback" && !selectedAudioId) {
				return false;
			}

			// 录音模式：显示当前日期的所有转录文本
			const transcriptDate = new Date(t.timestamp);
			return transcriptDate.toDateString() === selectedDate.toDateString();
		});

		// 只在值变化时打印日志（避免重复打印）
		if (filtered.length !== transcripts.length || selectedAudioId) {
			console.log(
				"[VoiceModulePanel] 📊 过滤后的转录文本数量:",
				filtered.length,
				"（总数量:",
				transcripts.length,
				"，选中音频:",
				selectedAudioId,
				"）",
			);
		}

		return filtered;
	}, [transcripts, selectedAudioId, selectedDate, viewMode]);

	// 过滤待办和日程：根据选中音频ID过滤
	const filteredTodos = useMemo(() => {
		if (selectedAudioId && viewMode === "playback") {
			return extractedTodos.filter(
				(t) => t.sourceSegmentId === selectedAudioId,
			);
		}
		// 如果没有选中音频，显示当前日期的所有待办
		return extractedTodos.filter((t) => {
			const todoDate = t.deadline ? new Date(t.deadline) : null;
			return todoDate
				? todoDate.toDateString() === selectedDate.toDateString()
				: false;
		});
	}, [extractedTodos, selectedAudioId, selectedDate, viewMode]);

	const filteredSchedules = useMemo(() => {
		if (selectedAudioId && viewMode === "playback") {
			return schedules.filter((s) => s.sourceSegmentId === selectedAudioId);
		}
		// 如果没有选中音频，显示当前日期的所有日程
		return schedules.filter((s) => {
			const scheduleDate = new Date(s.scheduleTime);
			return scheduleDate.toDateString() === selectedDate.toDateString();
		});
	}, [schedules, selectedAudioId, selectedDate, viewMode]);

	// 获取当前播放位置对应的小节信息
	const getCurrentSegmentInfo = useCallback(() => {
		if (!currentTime || !currentAudioUrl) return null;

		// 如果当前有选中的音频文件，需要计算相对于该音频文件的偏移
		let baseTimeOffset = 0;
		if (selectedAudioId && dayAudioSegments.length > 0) {
			const selectedAudio = dayAudioSegments.find(
				(s) => s.id === selectedAudioId,
			);
			if (selectedAudio && recordingStartTime) {
				// 计算音频文件开始时间相对于录音开始时间的偏移
				baseTimeOffset =
					selectedAudio.startTime.getTime() - recordingStartTime.getTime();
			}
		}

		const timeInMs = currentTime * 1000 + baseTimeOffset;
		const segment = filteredTranscripts.find((s) => {
			const start = s.audioStart || 0;
			const end = s.audioEnd || start + 5000;
			return timeInMs >= start && timeInMs <= end;
		});
		if (segment) {
			const timeInSeconds = segment.audioStart ? segment.audioStart / 1000 : 0;
			return {
				time: formatTime(timeInSeconds),
				text: (segment.optimizedText || segment.rawText || "").substring(0, 80),
			};
		}
		return null;
	}, [
		currentTime,
		currentAudioUrl,
		filteredTranscripts,
		formatTime,
		selectedAudioId,
		dayAudioSegments,
		recordingStartTime,
	]);

	// 根据时间获取对应的小节信息（用于悬停显示）
	const getSegmentAtTime = useCallback(
		(time: number) => {
			// time 是播放时间（秒），需要转换为毫秒
			const timeInMs = time * 1000;

			// 如果当前有选中的音频文件，需要计算相对于该音频文件的偏移
			let baseTimeOffset = 0;
			if (selectedAudioId && dayAudioSegments.length > 0) {
				const selectedAudio = dayAudioSegments.find(
					(s) => s.id === selectedAudioId,
				);
				if (selectedAudio && recordingStartTime) {
					// 计算音频文件开始时间相对于录音开始时间的偏移
					// time是相对于音频文件开始的时间，需要加上音频文件的偏移
					baseTimeOffset =
						selectedAudio.startTime.getTime() - recordingStartTime.getTime();
				}
			}

			// 找到包含该时间点的转录片段
			// 需要找到 audioStart <= timeInMs <= audioEnd 的片段
			const adjustedTime = timeInMs + baseTimeOffset;
			const segment = filteredTranscripts.find((s) => {
				const start = s.audioStart || 0;
				const end = s.audioEnd || start + 5000; // 如果没有结束时间，默认5秒
				return adjustedTime >= start && adjustedTime <= end;
			});

			if (segment) {
				// 返回该片段的时间（相对于录音开始）和文本
				const segmentTimeInSeconds = (segment.audioStart || 0) / 1000;
				return {
					time: formatTime(segmentTimeInSeconds),
					text: (segment.optimizedText || segment.rawText || "").substring(
						0,
						80,
					),
				};
			}

			// 如果没有找到精确匹配，返回最接近的片段
			if (filteredTranscripts.length > 0) {
				// 找到最接近的片段（按开始时间）
				const closestSegment = filteredTranscripts.reduce((prev, curr) => {
					const prevDist = Math.abs((prev.audioStart || 0) - adjustedTime);
					const currDist = Math.abs((curr.audioStart || 0) - adjustedTime);
					return currDist < prevDist ? curr : prev;
				});

				const segmentTimeInSeconds = (closestSegment.audioStart || 0) / 1000;
				return {
					time: formatTime(segmentTimeInSeconds),
					text: (
						closestSegment.optimizedText ||
						closestSegment.rawText ||
						""
					).substring(0, 80),
				};
			}

			return null;
		},
		[
			filteredTranscripts,
			formatTime,
			selectedAudioId,
			dayAudioSegments,
			recordingStartTime,
		],
	);

	// 同步音频播放时间（从audio元素获取实际currentTime和duration）
	useEffect(() => {
		if (!audioPlayerRef.current || !currentAudioUrl) {
			// 如果没有音频URL，重置时间和duration
			setCurrentTime(0);
			setDuration(0);
			return;
		}

		const audio = audioPlayerRef.current;

		// 定期检查并同步duration（因为useMemo可能不会及时更新）
		const syncDuration = () => {
			if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
				const currentDuration = duration;
				if (Math.abs(audio.duration - currentDuration) > 0.1) {
					console.log(
						"[VoiceModulePanel] 同步duration:",
						audio.duration,
						"秒 (之前:",
						currentDuration,
						")",
					);
					setDuration(audio.duration);
				}
			}
		};

		// 监听timeupdate事件，同步currentTime
		const handleTimeUpdate = () => {
			if (audio && Number.isFinite(audio.currentTime) && audio.currentTime >= 0) {
				// 确保currentTime不超过duration
				const audioDuration =
					audio.duration &&
					Number.isFinite(audio.duration) &&
					audio.duration > 0
						? audio.duration
						: duration || Infinity;

				// 如果currentTime达到或超过duration，停止播放
				if (audio.currentTime >= audioDuration - 0.1) {
					console.log("[VoiceModulePanel] 音频播放完成，停止播放:", {
						currentTime: audio.currentTime,
						duration: audioDuration,
					});
					audio.pause();
					audio.currentTime = audioDuration;
					setCurrentTime(audioDuration);
					setIsPlaying(false);
					// 触发ended事件
					audio.dispatchEvent(new Event("ended"));
				} else {
					const clampedTime = Math.min(audio.currentTime, audioDuration);
					setCurrentTime(clampedTime);
				}

				// 同时同步duration
				syncDuration();
			}
		};

		// 监听loadedmetadata事件，同步duration
		const handleLoadedMetadata = () => {
			if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
				console.log(
					"[VoiceModulePanel] 从audio元素获取duration:",
					audio.duration,
					"秒",
				);
				setDuration(audio.duration);
				// 如果currentTime超过了duration，重置为0
				if (audio.currentTime > audio.duration) {
					audio.currentTime = 0;
					setCurrentTime(0);
				}
			}
		};

		// 监听canplay事件，确保音频可以播放
		const handleCanPlay = () => {
			if (audio && Number.isFinite(audio.duration) && audio.duration > 0) {
				console.log(
					"[VoiceModulePanel] 音频可以播放，duration:",
					audio.duration,
					"秒",
				);
				setDuration(audio.duration);
			}
		};

		// 监听播放状态变化
		const handlePlay = () => {
			// 检查是否已经播放完成
			if (
				audio?.duration &&
				audio.currentTime >= audio.duration - 0.1
			) {
				console.log("[VoiceModulePanel] 尝试播放已完成的音频，重置到开始");
				audio.currentTime = 0;
				setCurrentTime(0);
			}
			setIsPlaying(true);
		};
		const handlePause = () => setIsPlaying(false);
		const handleEnded = () => {
			console.log("[VoiceModulePanel] 音频播放结束");
			setIsPlaying(false);
			// 不重置currentTime，保持在最后位置
			if (audio?.duration) {
				setCurrentTime(audio.duration);
			}
		};

		audio.addEventListener("timeupdate", handleTimeUpdate);
		audio.addEventListener("loadedmetadata", handleLoadedMetadata);
		audio.addEventListener("canplay", handleCanPlay);
		audio.addEventListener("play", handlePlay);
		audio.addEventListener("pause", handlePause);
		audio.addEventListener("ended", handleEnded);

		// 如果音频已经加载了metadata，立即获取duration
		if (audio.readyState >= 1) {
			if (Number.isFinite(audio.duration) && audio.duration > 0) {
				console.log(
					"[VoiceModulePanel] 音频已加载，立即获取duration:",
					audio.duration,
					"秒",
				);
				setDuration(audio.duration);
			} else {
				console.log(
					"[VoiceModulePanel] 音频readyState:",
					audio.readyState,
					"但duration未就绪，等待loadedmetadata事件",
				);
			}
		}

		// 定期同步duration（每500ms检查一次）
		const durationSyncInterval = setInterval(syncDuration, 500);

		return () => {
			audio.removeEventListener("timeupdate", handleTimeUpdate);
			audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
			audio.removeEventListener("canplay", handleCanPlay);
			audio.removeEventListener("play", handlePlay);
			audio.removeEventListener("pause", handlePause);
			audio.removeEventListener("ended", handleEnded);
			clearInterval(durationSyncInterval);
		};
	}, [currentAudioUrl, duration]);

	// 获取当前日期的音频URL（使用从后端查询的音频列表）
	// 切换日期时，自动选择并加载第一个音频
	useEffect(() => {
		// 只在回看模式且音频列表加载完成后处理
		if (viewMode !== "playback" || isLoadingAudioList) return;

		if (dayAudioSegments.length > 0) {
			// 如果还没有选中，或者选中的不在当前日期的列表中，选择第一个并自动加载
			const currentSelected = dayAudioSegments.find(
				(s) => s.id === selectedAudioId,
			);
			if (!currentSelected) {
				// 自动选择第一个音频并加载
				const firstAudio = dayAudioSegments[0];
				console.log(
					"[VoiceModulePanel] 切换日期，自动选择第一个音频:",
					firstAudio.id,
				);
				handleSelectAudio(firstAudio).catch((err) => {
					console.error("[VoiceModulePanel] 自动加载第一个音频失败:", err);
				});
			}
		} else {
			// 清空当前选中的音频和URL
			setCurrentAudioUrl(null);
			setSelectedAudioId(undefined);
			// 清空转录文本（只显示当前选中音频的文本）
			// 注意：这里不清空store中的transcripts，只是不显示
		}
	}, [dayAudioSegments, selectedAudioId, handleSelectAudio, viewMode, isLoadingAudioList]); // 添加viewMode和isLoadingAudioList依赖

	// 计算总时长：优先使用音频实际时长，否则使用转录文本计算的总时长
	const totalDuration = useMemo(() => {
		// 优先从audio元素获取实际duration（实时检查）
		if (audioPlayerRef.current) {
			const audioDuration = audioPlayerRef.current.duration;
			if (
				audioDuration &&
				Number.isFinite(audioDuration) &&
				audioDuration > 0
			) {
				return audioDuration;
			}
		}
		// 其次使用state中的duration
		if (duration > 0) {
			return duration;
		}
		// 最后使用转录文本计算的总时长
		if (filteredTranscripts.length > 0) {
			const maxEnd = Math.max(
				...filteredTranscripts.map((s) => (s.audioEnd || 0) / 1000),
			);
			if (maxEnd > 0) {
				return maxEnd;
			}
		}
		return 0;
	}, [duration, filteredTranscripts]);

	// 更新当前时间（仅在客户端）
	useEffect(() => {
		// 立即设置一次，避免初始渲染时显示 null
		setNowTime(new Date());
		const timer = setInterval(() => {
			setNowTime(new Date());
		}, 1000);
		return () => clearInterval(timer);
	}, []);

	// 更新标题（切换日期时自动更新，或当有转录内容时更新）
	useEffect(() => {
		const newTitle = `${selectedDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} 录音`;
		// 如果标题为空，或者标题不匹配当前日期，则更新
		if (
			!meetingTitle ||
			!meetingTitle.includes(
				selectedDate.toLocaleDateString("zh-CN", {
					month: "long",
					day: "numeric",
				}),
			)
		) {
			setMeetingTitle(newTitle);
		}
	}, [selectedDate, meetingTitle]);

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部：左右分栏（区域1和区域2） */}
			<div className="shrink-0 border-b border-border/50 bg-background/95 backdrop-blur-sm relative z-50">
				<div className="flex overflow-hidden">
					{/* 区域1：顶部左侧 */}
					<div className="flex-[2] border-r border-border/50">
						<div className="flex items-center gap-4 px-6 py-3">
							{/* 日期、时间和标题 */}
							<div className="flex items-center gap-4 flex-1">
								{/* 日期选择器 */}
								<DateSelector
									selectedDate={selectedDate}
									onDateChange={handleDateChange}
									onExport={handleExport}
									onEdit={handleEdit}
									availableDates={useMemo(() => {
										// 从所有音频记录计算所有有音频的日期
										const dates: Date[] = [];
										allAudioRecordings.forEach((count, dateKey) => {
											if (count > 0) {
												const [year, month, day] = dateKey
													.split("-")
													.map(Number);
												dates.push(new Date(year, month - 1, day));
											}
										});
										return dates;
									}, [allAudioRecordings])}
									audioCounts={allAudioRecordings}
								/>

								{/* 当前时间（仅在客户端渲染，避免 SSR 不一致） */}
								{nowTime && (
									<div
										className="text-sm text-muted-foreground font-mono"
										suppressHydrationWarning
									>
										{nowTime.toLocaleTimeString("zh-CN", {
											hour: "2-digit",
											minute: "2-digit",
											second: "2-digit",
										})}
									</div>
								)}

								{/* 标题输入框 - 支持点击编辑和右键菜单 */}
								{isEditingTitle ? (
									<input
										ref={titleInputRef}
										type="text"
										value={editTitleValue}
										onChange={(e) => setEditTitleValue(e.target.value)}
										onBlur={() => {
											const trimmed = editTitleValue.trim();
											if (trimmed && trimmed !== meetingTitle) {
												setMeetingTitle(trimmed);
											} else {
												setEditTitleValue(
													meetingTitle ||
														`${selectedDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} 录音`,
												);
											}
											setIsEditingTitle(false);
										}}
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												e.preventDefault();
												const trimmed = editTitleValue.trim();
												if (trimmed && trimmed !== meetingTitle) {
													setMeetingTitle(trimmed);
												}
												setIsEditingTitle(false);
											} else if (e.key === "Escape") {
												setEditTitleValue(
													meetingTitle ||
														`${selectedDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} 录音`,
												);
												setIsEditingTitle(false);
											}
										}}
										placeholder="输入标题..."
										className="flex-1 px-3 py-1.5 text-sm font-medium bg-transparent border-b-2 border-primary focus:outline-none"

									/>
								) : (
									<button
										type="button"
										onClick={() => {
											setEditTitleValue(
												meetingTitle ||
													`${selectedDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} 录音`,
											);
											setIsEditingTitle(true);
										}}
										onContextMenu={(e) => {
											e.preventDefault();
											setEditTitleValue(
												meetingTitle ||
													`${selectedDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} 录音`,
											);
											setIsEditingTitle(true);
										}}
										className="flex-1 px-3 py-1.5 text-sm font-medium bg-transparent border-b border-border/50 hover:border-primary focus:outline-none text-left cursor-pointer transition-colors"
										title="点击或右键编辑标题"
									>
										{meetingTitle ||
											`${selectedDate.toLocaleDateString("zh-CN", { month: "long", day: "numeric" })} 录音`}
									</button>
								)}
							</div>

							{/* 录音模式时显示设备选择器 */}

							{/* 功能图标切换（回看模式时显示） */}
							{viewMode === "playback" && (
								<div className="flex items-center gap-1 ml-auto">
									<button
										type="button"
										onClick={() => handleViewChange("original")}
										className={cn(
											"px-4 py-2 text-sm font-medium rounded-md transition-all",
											currentView === "original"
												? "bg-primary text-primary-foreground shadow-sm"
												: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
										)}
										title="原文"
									>
										原文
									</button>
									<button
										type="button"
										onClick={() => handleViewChange("optimized")}
										className={cn(
											"px-4 py-2 text-sm font-medium rounded-md transition-all",
											currentView === "optimized"
												? "bg-primary text-primary-foreground shadow-sm"
												: "text-muted-foreground hover:text-foreground hover:bg-muted/50",
										)}
										title="智能优化"
									>
										智能优化
									</button>
								</div>
							)}
						</div>
					</div>

					{/* 区域2：顶部右侧 */}
					<div className="flex-1">
						<div className="flex items-center justify-end gap-2 px-6 py-3">
							{viewMode === "playback" ? (
								<>
									{/* 测试模式：上传音频文件 */}
									<label
										className={cn(
											"px-4 py-2.5 rounded-lg transition-all duration-200",
											"bg-muted hover:bg-muted/80 text-foreground",
											"border border-border/50",
											"flex items-center gap-2 text-sm font-medium cursor-pointer",
											"hover:shadow-md active:scale-95",
										)}
									>
										<Upload className="w-4 h-4" />
										<span>测试音频</span>
										<input
											type="file"
											accept="audio/*,video/*"
											className="hidden"
											onChange={async (e) => {
												const file = e.target.files?.[0];
												if (file && recordingServiceRef.current) {
													try {
														setError(null);
														setIsLoadingAudioList(true);
														// 导入音频后进入回看模式
														setViewMode("playback");

														// 创建音频URL用于播放
														const audioUrl = URL.createObjectURL(file);

														// 使用文件上传API进行转录测试
														const formData = new FormData();
														formData.append("file", file);
														formData.append("optimize", "true");
														formData.append("extract_todos", "true");
														formData.append("extract_schedules", "true");

														const apiUrl =
															process.env.NEXT_PUBLIC_API_BASE_URL ||
															"http://localhost:8000/api";
														const response = await fetch(
															`${apiUrl}/audio/transcribe-file`,
															{
																method: "POST",
																body: formData,
															},
														);

														if (response.ok) {
															const result = await response.json();
															console.log(
																"[测试音频] 完整API响应:",
																JSON.stringify(result, null, 2),
															);
															// 获取音频时长
															const audio = new Audio();
															audio.src = audioUrl;
															const duration = await new Promise<number>(
																(resolve) => {
																	audio.onloadedmetadata = () => {
																		resolve(audio.duration * 1000); // 转换为毫秒
																	};
																	audio.onerror = () => {
																		// 如果无法加载元数据，使用默认时长
																		console.warn(
																			"无法获取音频时长，使用默认值",
																		);
																		resolve(60000); // 默认1分钟
																	};
																	// 超时保护
																	setTimeout(() => {
																		if (
																			!audio.duration ||
																			Number.isNaN(audio.duration)
																		) {
																			resolve(60000); // 默认1分钟
																		}
																	}, 3000);
																},
															);

															// 创建音频片段
															const audioSegment: AudioSegment = {
																id: `test_audio_${Date.now()}`,
																startTime: new Date(),
																endTime: new Date(Date.now() + duration),
																duration: duration,
																fileSize: file.size,
																fileUrl: audioUrl,
																audioSource: "microphone",
																uploadStatus: "uploaded",
															};
															addAudioSegment(audioSegment);
															// 添加到dayAudioSegments，以便在列表中显示
															setDayAudioSegments((prev) => [
																...prev,
																audioSegment,
															]);
															setIsLoadingAudioList(false);

															// 创建转录片段（按段落分割成多个独立的segment）
															if (result.transcript) {
																const text = result.transcript;
																const optimizedText =
																	result.optimized_text || undefined;

																// 按句号、问号、感叹号、换行符分段
																// 如果没有这些标点，按时间点（如"7点"、"7:40"等）或长空格分段
																const paragraphRegex = /([。！？\n]+)/g;
																const paragraphs: string[] = [];
																let lastIndex = 0;
																let match: RegExpExecArray | null;

																while (true) {
																	match = paragraphRegex.exec(text);
																	if (!match) break;
																	const paragraphText = text
																		.substring(lastIndex, match.index)
																		.trim();
																	if (paragraphText) {
																		paragraphs.push(paragraphText);
																	}
																	lastIndex = match.index + match[0].length;
																}

																// 添加最后一段（如果没有以标点结尾）
																if (lastIndex < text.length) {
																	const remainingText = text
																		.substring(lastIndex)
																		.trim();
																	if (remainingText) {
																		paragraphs.push(remainingText);
																	}
																}

																// 如果没有找到段落分隔符，按时间点或长空格分段
																if (
																	paragraphs.length === 0 ||
																	(paragraphs.length === 1 &&
																		paragraphs[0] === text)
																) {
																	// 按时间点分段（如"早上7点"、"7点40分"、"11点30分"、"7:40"等）
																	const timePointRegex =
																		/(早上|上午|中午|下午|晚上|凌晨)?\s*(\d{1,2})[点:](\d{0,2})[分]?|(\d{1,2})点(\d{0,2})分?/g;
																	const timeMatches: Array<{
																		index: number;
																		text: string;
																	}> = [];
																	let timeMatch: RegExpExecArray | null;

																	while (true) {
																		timeMatch = timePointRegex.exec(text);
																		if (!timeMatch) break;
																		timeMatches.push({
																			index: timeMatch.index,
																			text: timeMatch[0],
																		});
																	}

																	if (timeMatches.length > 1) {
																		// 按时间点分段
																		paragraphs.length = 0; // 清空
																		for (
																			let i = 0;
																			i < timeMatches.length;
																			i++
																		) {
																			const startIndex =
																				i === 0 ? 0 : timeMatches[i].index;
																			const endIndex =
																				i < timeMatches.length - 1
																					? timeMatches[i + 1].index
																					: text.length;
																			const paragraphText = text
																				.substring(startIndex, endIndex)
																				.trim();
																			if (paragraphText) {
																				paragraphs.push(paragraphText);
																			}
																		}
																	} else {
																		// 如果没有时间点，按长空格（2个以上空格）分段
																		const longSpaceRegex = /\s{2,}/g;
																		const spaceMatches: number[] = [0];
																		let spaceMatch: RegExpExecArray | null;

																		while (true) {
																			spaceMatch = longSpaceRegex.exec(text);
																			if (!spaceMatch) break;
																			spaceMatches.push(spaceMatch.index);
																		}
																		spaceMatches.push(text.length);

																		if (spaceMatches.length > 2) {
																			paragraphs.length = 0; // 清空
																			for (
																				let i = 0;
																				i < spaceMatches.length - 1;
																				i++
																			) {
																				const paragraphText = text
																					.substring(
																						spaceMatches[i],
																						spaceMatches[i + 1],
																					)
																					.trim();
																				if (paragraphText) {
																					paragraphs.push(paragraphText);
																				}
																			}
																		} else {
																			// 如果都没有，按单个空格或固定长度分段（每50个字符一段）
																			paragraphs.length = 0;
																			const chunkSize = 50;
																			for (
																				let i = 0;
																				i < text.length;
																				i += chunkSize
																			) {
																				const chunk = text
																					.substring(i, i + chunkSize)
																					.trim();
																				if (chunk) {
																					paragraphs.push(chunk);
																				}
																			}
																			if (paragraphs.length === 0) {
																				paragraphs.push(text);
																			}
																		}
																	}
																}

																console.log(
																	"[测试音频] 原文分段结果:",
																	paragraphs.length,
																	"个段落",
																);
																paragraphs.forEach((para, idx) => {
																	console.log(
																		`  段落${idx + 1}:`,
																		`${para.substring(0, 30)}...`,
																	);
																});

																// 同样处理优化文本（按换行符或句号分段）
																const optimizedParagraphs: string[] = [];
																if (optimizedText) {
																	// 优化文本通常有换行符，先按换行符分段
																	const optimizedLines = optimizedText
																		.split(/\n+/)
																		.filter((line: string) => line.trim());
																	if (optimizedLines.length > 0) {
																		optimizedParagraphs.push(
																			...optimizedLines.map((line: string) =>
																				line.trim(),
																			),
																		);
																	} else {
																		// 如果没有换行符，按句号分段
																		let optLastIndex = 0;
																		paragraphRegex.lastIndex = 0; // 重置正则
																		let match: RegExpExecArray | null;
																		while (true) {
																			match =
																				paragraphRegex.exec(optimizedText);
																			if (match === null) {
																				break;
																			}
																			const paragraphText = optimizedText
																				.substring(optLastIndex, match.index)
																				.trim();
																			if (paragraphText) {
																				optimizedParagraphs.push(paragraphText);
																			}
																			optLastIndex =
																				match.index + match[0].length;
																		}
																		if (optLastIndex < optimizedText.length) {
																			const remainingText = optimizedText
																				.substring(optLastIndex)
																				.trim();
																			if (remainingText) {
																				optimizedParagraphs.push(remainingText);
																			}
																		}
																		if (optimizedParagraphs.length === 0) {
																			optimizedParagraphs.push(optimizedText);
																		}
																	}
																}

																console.log(
																	"[测试音频] 优化文本分段结果:",
																	optimizedParagraphs.length,
																	"个段落",
																);
																optimizedParagraphs.forEach((para, idx) => {
																	console.log(
																		`  优化段落${idx + 1}:`,
																		`${para.substring(0, 30)}...`,
																	);
																});

																// 为每个段落创建独立的segment
																const baseTimestamp = new Date();
																const segmentDuration =
																	duration / paragraphs.length; // 平均分配时长
																const createdSegments: TranscriptSegment[] = [];

																paragraphs.forEach((paragraph, index) => {
																	const segmentId = `test_${Date.now()}_${index}`;
																	// 如果优化文本有对应的段落，使用它；否则为undefined
																	const optimizedPara =
																		optimizedParagraphs[index];
																	const segment: TranscriptSegment = {
																		id: segmentId,
																		timestamp: new Date(
																			baseTimestamp.getTime() +
																				index * segmentDuration,
																		),
																		rawText: paragraph,
																		optimizedText: optimizedPara?.trim()
																			? optimizedPara
																			: undefined,
																		isOptimized: !!(
																			optimizedText &&
																			optimizedPara &&
																			optimizedPara.trim()
																		),
																		isInterim: false,
																		containsSchedule: false, // 先设为false，提取后再更新
																		containsTodo: false, // 先设为false，提取后再更新
																		audioStart: index * segmentDuration,
																		audioEnd: (index + 1) * segmentDuration,
																		audioFileId: audioSegment.id,
																		uploadStatus: "uploaded",
																	};
																	addTranscript(segment);
																	createdSegments.push(segment);
																});

																// 转录完成后，立即触发智能提取（对所有段落）
																console.log(
																	"[测试音频] 转录完成，开始智能提取",
																);

																// 触发待办提取（对所有段落）
																if (todoExtractionServiceRef.current) {
																	console.log("[测试音频] 触发待办提取服务");
																	if (todoExtractionServiceRef.current) {
																		todoExtractionServiceRef.current.extractedTodosWithoutCallback =
																			[];
																	}
																	todoExtractionServiceRef.current.setCallbacks(
																		{
																			onError: (err) => {
																				console.error(
																					"Todo extraction error:",
																					err,
																				);
																			},
																			onStatusChange: () => {},
																		},
																	);
																	// 为所有段落触发提取
																	createdSegments.forEach((seg) => {
																		const textForExtraction =
																			seg.optimizedText || seg.rawText;
																		if (textForExtraction) {
																			const segmentForExtraction =
																				textForExtraction === seg.optimizedText
																					? seg
																					: {
																							...seg,
																							optimizedText: seg.rawText,
																							isOptimized: true,
																						};
																			todoExtractionServiceRef.current?.enqueue(
																				segmentForExtraction,
																			);
																		}
																	});

																	setTimeout(() => {
																		const storedTodos =
																			todoExtractionServiceRef.current
																				?.extractedTodosWithoutCallback || [];
																		if (storedTodos.length > 0) {
																			console.log(
																				"[测试音频] 发现",
																				storedTodos.length,
																				"个待确认的待办",
																			);
																			setPendingTodos(storedTodos);
																			if (todoExtractionServiceRef.current) {
																				todoExtractionServiceRef.current.extractedTodosWithoutCallback =
																					[];
																			}
																		}
																	}, 2000);
																}

																// 触发日程提取（对所有段落）
																if (scheduleExtractionServiceRef.current) {
																	console.log("[测试音频] 触发日程提取服务");
																	const service =
																		scheduleExtractionServiceRef.current;
																	// 不设置onScheduleExtracted回调，让提取结果存储到待确认列表
																	service.setCallbacks({
																		onError: (err) => {
																			console.error(
																				"Schedule extraction error:",
																				err,
																			);
																			setProcessStatus(
																				"scheduleExtraction",
																				"error",
																			);
																		},
																		onStatusChange: (status) => {
																			setProcessStatus(
																				"scheduleExtraction",
																				status,
																			);
																		},
																	});
																	service.extractedSchedulesWithoutCallback =
																		[];

																	// 为所有段落触发提取
																	createdSegments.forEach((seg) => {
																		const textForExtraction =
																			seg.optimizedText || seg.rawText;
																		if (textForExtraction) {
																			const segmentForExtraction =
																				textForExtraction === seg.optimizedText
																					? seg
																					: {
																							...seg,
																							optimizedText: seg.rawText,
																							isOptimized: true,
																						};
																			service.enqueue(segmentForExtraction);
																		}
																	});

																	setTimeout(() => {
																		const storedSchedules =
																			service.extractedSchedulesWithoutCallback;
																		if (storedSchedules.length > 0) {
																			console.log(
																				"[测试音频] 发现",
																				storedSchedules.length,
																				"个待确认的日程",
																			);
																			setPendingSchedules(storedSchedules);
																			service.extractedSchedulesWithoutCallback =
																				[];
																		}
																	}, 2000);
																}

																// 如果后端也返回了提取结果，添加到待确认列表（不自动加入）
																const firstSegmentId =
																	createdSegments[0]?.id || "";
																if (result.todos && result.todos.length > 0) {
																	console.log(
																		"[测试音频] 后端也返回了",
																		result.todos.length,
																		"个待办事项，添加到待确认列表",
																	);
																type BackendTodo = {
																	title?: string;
																	name?: string;
																	description?: string;
																	deadline?: string;
																	priority?: string;
																	source_text?: string;
																	text_start_index?: number;
																	text_end_index?: number;
																};
																const backendTodos: ExtractedTodo[] =
																	result.todos.map((todo: BackendTodo, index: number) => ({
																				id: `todo_backend_${Date.now()}_${index}_${Math.random()}`,
																				sourceSegmentId: firstSegmentId,
																				extractedAt: new Date(),
																				title:
																					todo.title || todo.name || "待办事项",
																				description: todo.description || "",
																				deadline: todo.deadline
																					? new Date(todo.deadline)
																					: undefined,
																				priority: todo.priority || "medium",
																				sourceText:
																					todo.source_text || todo.description,
																				textStartIndex: todo.text_start_index,
																				textEndIndex: todo.text_end_index,
																			}),
																		);
																	setPendingTodos((prev) => [
																		...prev,
																		...backendTodos,
																	]);
																}

																if (
																	result.schedules &&
																	result.schedules.length > 0
																) {
																	console.log(
																		"[测试音频] 后端也返回了",
																		result.schedules.length,
																		"个日程，添加到待确认列表",
																	);
																type BackendSchedule = {
																	schedule_time?: string;
																	scheduleTime?: string;
																	description?: string;
																	content?: string;
																	source_text?: string;
																	text_start_index?: number;
																	text_end_index?: number;
																};
																const backendSchedules: ScheduleItem[] =
																	result.schedules.map(
																		(schedule: BackendSchedule, index: number) => ({
																				id: `schedule_backend_${Date.now()}_${index}_${Math.random()}`,
																				sourceSegmentId: firstSegmentId,
																				extractedAt: new Date(),
																				scheduleTime: new Date(
																					schedule.schedule_time ||
																						schedule.scheduleTime ||
																						Date.now(),
																				),
																				description:
																					schedule.description ||
																					schedule.content ||
																					"",
																				status: "pending",
																				sourceText:
																					schedule.source_text ||
																					schedule.description,
																				textStartIndex:
																					schedule.text_start_index,
																				textEndIndex: schedule.text_end_index,
																			}),
																		);
																	setPendingSchedules((prev) => [
																		...prev,
																		...backendSchedules,
																	]);
																}

																// 等待提取处理完成后再验证
																setTimeout(() => {
																	const updatedSegments = useAppStore
																		.getState()
																		.transcripts.filter((t) =>
																			createdSegments.some(
																				(s) => s.id === t.id,
																			),
																		);
																	console.log("[测试音频] 验证segment更新:", {
																		count: updatedSegments.length,
																		withTodo: updatedSegments.filter(
																			(s) => s.containsTodo,
																		).length,
																		withSchedule: updatedSegments.filter(
																			(s) => s.containsSchedule,
																		).length,
																	});

																	// 如果提取成功，触发UI更新
																	if (
																		updatedSegments.some(
																			(s) =>
																				s.containsTodo || s.containsSchedule,
																		)
																	) {
																		// 触发重新渲染
																		setHighlightedSegmentId(firstSegmentId);
																		setTimeout(
																			() => setHighlightedSegmentId(undefined),
																			100,
																		);
																	}
																}, 1000);

																// 设置当前音频URL，使播放器可以播放
																setCurrentAudioUrl(audioUrl);

																// 初始化播放器
																if (audioPlayerRef.current) {
																	audioPlayerRef.current.src = audioUrl;
																	audioPlayerRef.current.load();
																	setDuration(duration / 1000); // 转换为秒
																}
															}

															setViewMode("playback");
														} else {
															const errorText = await response.text();
															throw new Error(`转录失败: ${errorText}`);
														}
													} catch (err) {
														const error =
															err instanceof Error
																? err
																: new Error("测试失败");
														console.error("Test recording error:", error);
														setErrorWithAutoHide(error.message);
														setIsLoadingAudioList(false);
														setViewMode("playback");
													}
												}
												// 重置 input
												e.target.value = "";
											}}
										/>
									</label>

									{/* 开始录音按钮 */}
									<button
										type="button"
										onClick={handleStartRecording}
										className={cn(
											"px-6 py-3 rounded-xl transition-all duration-300",
											"bg-gradient-to-r from-primary to-primary/90 text-primary-foreground",
											"hover:from-primary/90 hover:to-primary/80",
											"shadow-lg hover:shadow-xl",
											"flex items-center gap-2.5 text-sm font-semibold",
											"active:scale-95 hover:scale-105",
											"border border-primary/20",
										)}
										title="开始录音"
									>
										<Mic className="w-4 h-4" />
										开始录音
									</button>
								</>
							) : isRecording ? (
								useAppStore.getState().processStatus.recording === "paused" ? (
									<div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30">
										<div className="relative w-2 h-2">
											<div className="absolute inset-0 bg-amber-500 rounded-full" />
										</div>
										<span className="text-xs font-medium text-amber-600 dark:text-amber-400">
											暂停中
										</span>
									</div>
								) : (
									<div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/30">
										<div className="relative w-2 h-2">
											<div className="absolute inset-0 bg-red-500 rounded-full animate-ping" />
											<div className="absolute inset-0 bg-red-500 rounded-full" />
										</div>
										<span className="text-xs font-medium text-red-600 dark:text-red-400">
											录音中
										</span>
									</div>
								)
							) : (
								<button
									type="button"
									onClick={() => handleModeChange("playback")}
									className={cn(
										"px-5 py-2.5 rounded-lg transition-all",
										"bg-muted text-foreground",
										"hover:bg-muted/80 shadow-md hover:shadow-lg",
										"flex items-center gap-2",
										"border border-border/50 text-sm font-medium",
										"active:scale-95",
									)}
									title="切换到回看模式"
								>
									<Play className="w-4 h-4 ml-0.5" />
									回看
								</button>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* 主内容区域：左右分栏（区域3和区域4） */}
			<div className="flex-1 flex overflow-hidden">
				{/* 区域3：下方左侧 */}
				<div className="flex-[2] flex flex-col overflow-hidden border-r border-border/50">
					{/* 录音模式：显示录音视图 */}
					{viewMode === "recording" ? (
						<RecordingView
							isRecording={isRecording}
							isPaused={
								useAppStore.getState().processStatus.recording === "paused"
							}
							recordingDuration={recordingDuration}
							segments={filteredTranscripts}
							currentSpeaker={currentSpeaker}
							onSpeakerChange={setCurrentSpeaker}
							onSegmentClick={handleSegmentClick}
							highlightedSegmentId={highlightedSegmentId}
							warningMessage={undefined}
							onPause={handlePauseRecording}
							onResume={handleResumeRecording}
							onStop={handleStopRecording}
							audioLevel={0}
							analyser={analyser}
							schedules={schedules.filter((s) => {
								const scheduleDate = new Date(s.scheduleTime);
								return (
									scheduleDate.toDateString() === selectedDate.toDateString()
								);
							})}
							todos={extractedTodos.filter((t) => {
								const todoDate = t.deadline ? new Date(t.deadline) : null;
								return todoDate
									? todoDate.toDateString() === selectedDate.toDateString()
									: false;
							})}
						/>
					) : (
						<>
							{/* 左侧中间：内容视图（回看模式） */}
							<div className="flex-1 flex flex-col overflow-hidden min-h-0 relative">
								{/* 加载状态提示（不显示提取动效，提取动效在右侧智能提取区域显示） */}
								{(isTranscribing || isLoadingAudio) && (
									<div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
										<div className="flex flex-col items-center gap-4">
											{isTranscribing && (
												<div className="flex flex-col items-center gap-2">
													<div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
													<p className="text-sm text-muted-foreground">
														正在转录音频...
													</p>
												</div>
											)}
											{isLoadingAudio && !isTranscribing && (
												<div className="flex flex-col items-center gap-2">
													<div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
													<p className="text-sm text-muted-foreground">
														正在加载音频...
													</p>
												</div>
											)}
										</div>
									</div>
								)}
								{currentView === "original" && (
									<OriginalTextView
										segments={filteredTranscripts}
										onSegmentClick={handleSegmentClick}
										onSegmentUpdate={updateTranscript}
										highlightedSegmentId={highlightedSegmentId}
										schedules={schedules.filter((s) => {
											const scheduleDate = new Date(s.scheduleTime);
											return (
												scheduleDate.toDateString() ===
												selectedDate.toDateString()
											);
										})}
										todos={extractedTodos.filter((t) => {
											const todoDate = t.deadline ? new Date(t.deadline) : null;
											return todoDate
												? todoDate.toDateString() ===
														selectedDate.toDateString()
												: false;
										})}
									/>
								)}
								{currentView === "optimized" && (
									<OptimizedTextView
										segments={filteredTranscripts}
										onSegmentClick={handleSegmentClick}
										onSegmentUpdate={updateTranscript}
										highlightedSegmentId={highlightedSegmentId}
										schedules={schedules.filter((s) => {
											const scheduleDate = new Date(s.scheduleTime);
											return (
												scheduleDate.toDateString() ===
												selectedDate.toDateString()
											);
										})}
										todos={extractedTodos.filter((t) => {
											const todoDate = t.deadline ? new Date(t.deadline) : null;
											return todoDate
												? todoDate.toDateString() ===
														selectedDate.toDateString()
												: false;
										})}
									/>
								)}
							</div>

							{/* 左侧底部：播放器（回看模式时显示） */}
							<div className="shrink-0 border-t border-border/50">
								<CompactPlayer
									title={meetingTitle}
									date={selectedDate}
									duration={totalDuration}
									currentTime={currentTime}
									isPlaying={isPlaying}
									audioUrl={currentAudioUrl || undefined}
									playbackSpeed={playbackSpeed}
									audioSegments={audioSegments.filter((s) => {
										const segmentDate = new Date(s.startTime);
										return (
											segmentDate.toDateString() === selectedDate.toDateString()
										);
									})}
									selectedAudioId={selectedAudioId}
									onSelectAudio={handleSelectAudio}
									hoveredSegment={(() => {
										// 优先使用当前播放时间对应的文本
										const currentSegment = getCurrentSegmentInfo();
										if (currentSegment) {
											return currentSegment;
										}
										// 如果没有，使用悬停的片段
										if (hoveredSegment) {
											return {
												time: hoveredSegment.audioStart
													? formatTime(hoveredSegment.audioStart / 1000)
													: "00:00",
												text: (
													hoveredSegment.optimizedText ||
													hoveredSegment.rawText ||
													""
												).substring(0, 80),
											};
										}
										return null;
									})()}
									onPlay={handlePlay}
									onPause={handlePause}
									onSeek={handleSeek}
									onSkip={handleSkip}
									getSegmentAtTime={getSegmentAtTime}
									onSpeedChange={(speed) => {
										setPlaybackSpeed(speed);
										if (audioPlayerRef.current) {
											audioPlayerRef.current.playbackRate = speed;
										}
									}}
								/>
							</div>
						</>
					)}
				</div>

				{/* 右侧：辅助内容区域（1/3） */}
				<div className="flex-1 flex flex-col overflow-hidden bg-muted/20">
					{/* 右侧内容：音频列表、智能提取和智能纪要上下排列 */}
					<div className="flex-1 overflow-y-auto p-4 space-y-4">
						{/* 音频列表面板 - 回看模式显示 */}
						{viewMode === "playback" && (
							<>
								<AudioListPanel
									audioSegments={dayAudioSegments}
									selectedAudioId={selectedAudioId}
									onSelectAudio={handleSelectAudio}
									onEditTitle={(_audioId) => {
										// 这个回调现在由AudioListPanel内部处理
									}}
									onUpdateAudio={(audioId, updates) => {
										// 更新音频标题
										updateAudioSegment(audioId, updates);
										// 同时更新dayAudioSegments中的对应项
										setDayAudioSegments((prev) =>
											prev.map((a) =>
												a.id === audioId ? { ...a, ...updates } : a,
											),
										);
									}}
									onDeleteAudio={async (audioId) => {
										// 删除音频
										if (persistenceServiceRef.current) {
											const success =
												await persistenceServiceRef.current.deleteAudio(
													audioId,
												);
											if (success) {
												// 如果删除的是当前选中的音频，先清空选择
												if (selectedAudioId === audioId) {
													setSelectedAudioId(undefined);
													setCurrentAudioUrl(null);
													if (audioPlayerRef.current) {
														audioPlayerRef.current.pause();
														audioPlayerRef.current.src = "";
														audioPlayerRef.current.load();
													}
												}
												// 重新加载当天的音频列表（这会自动更新 dayAudioSegments）
												await handleDateChange(selectedDate);
												console.log(
													"[VoiceModulePanel] ✅ 音频删除成功，列表已刷新",
												);
											} else {
												console.error("[VoiceModulePanel] ❌ 音频删除失败");
												setErrorWithAutoHide("删除音频失败，请重试");
											}
										}
									}}
								/>
								{dayAudioSegments.length > 0 && (
									<div className="border-t border-border/50 my-2" />
								)}
							</>
						)}

						{/* 智能提取面板 - 始终显示（录音模式和回看模式都显示） */}
						{(() => {
							// 过滤出当前日期的待办和日程
							const filteredPendingTodos = pendingTodos.filter((todo) => {
								// 如果待办有截止时间，检查是否匹配当前日期
								if (todo.deadline) {
									const todoDate = new Date(todo.deadline);
									return (
										todoDate.toDateString() === selectedDate.toDateString()
									);
								}
								// 如果没有截止时间，检查sourceSegmentId是否属于当前日期的转录
								if (todo.sourceSegmentId) {
									const segment = filteredTranscripts.find(
										(s) => s.id === todo.sourceSegmentId,
									);
									return !!segment;
								}
								return true; // 如果没有关联信息，默认显示
							});

							// 根据选中音频ID过滤日程
							const filteredPendingSchedules = (
								selectedAudioId && viewMode === "playback"
									? pendingSchedules.filter(
											(schedule) =>
												schedule.sourceSegmentId === selectedAudioId,
										)
									: pendingSchedules
							).filter((schedule) => {
								const scheduleDate = new Date(schedule.scheduleTime);
								return (
									scheduleDate.toDateString() === selectedDate.toDateString()
								);
							});

							// 使用已定义的filteredTodos和filteredSchedules（根据选中音频ID过滤）
							// 始终显示，即使为空
							return (
								<>
									<ExtractedItemsPanel
										todos={[...filteredPendingTodos, ...filteredTodos]}
										schedules={[
											...filteredPendingSchedules,
											...filteredSchedules,
										]}
										segments={filteredTranscripts}
										isExtracting={isExtracting}
										onAddTodo={async (todo) => {
											// 用户选择加入待办
											await handleAddTodo(todo);
											// 从待确认列表中移除
											setPendingTodos((prev) =>
												prev.filter((t) => t.id !== todo.id),
											);
										}}
										onAddSchedule={async (schedule) => {
											// 用户选择加入日程
											await handleAddSchedule(schedule);
											// 从待确认列表中移除
											setPendingSchedules((prev) =>
												prev.filter((s) => s.id !== schedule.id),
											);
										}}
										onDismissTodo={(todoId) => {
											// 用户选择忽略待办
											setPendingTodos((prev) =>
												prev.filter((t) => t.id !== todoId),
											);
										}}
										onDismissSchedule={(scheduleId) => {
											// 用户选择忽略日程
											setPendingSchedules((prev) =>
												prev.filter((s) => s.id !== scheduleId),
											);
										}}
										onSegmentClick={handleSegmentClick}
									/>
									{/* 分割线 */}
									<div className="border-t border-border/50 my-2" />
								</>
							);
						})()}

						{/* 智能纪要 - 始终显示（录音模式和回看模式都显示） */}
						<div className="flex-1 min-h-0">
							<MeetingSummary
								segments={filteredTranscripts}
								schedules={(() => {
									if (selectedAudioId && viewMode === "playback") {
										return schedules.filter((s) => {
											if (s.sourceSegmentId) {
												const segment = filteredTranscripts.find(
													(ts) => ts.id === s.sourceSegmentId,
												);
												return !!segment;
											}
											return false;
										});
									}
									return schedules.filter((s) => {
										const scheduleDate = new Date(s.scheduleTime);
										return (
											scheduleDate.toDateString() ===
											selectedDate.toDateString()
										);
									});
								})()}
								todos={(() => {
									if (selectedAudioId && viewMode === "playback") {
										return extractedTodos.filter((t) => {
											if (t.sourceSegmentId) {
												const segment = filteredTranscripts.find(
													(s) => s.id === t.sourceSegmentId,
												);
												return !!segment;
											}
											return false;
										});
									}
									return extractedTodos.filter((t) => {
										const todoDate = t.deadline ? new Date(t.deadline) : null;
										return todoDate
											? todoDate.toDateString() === selectedDate.toDateString()
											: false;
									});
								})()}
								onSegmentClick={handleSegmentClick}
								summaryText={meetingSummary}
								isSummarizing={isSummarizing}
							/>
						</div>
					</div>
				</div>
			</div>

			{/* 录音停止确认对话框 */}
			{showStopConfirmDialog && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
					<div className="bg-background border border-border rounded-lg shadow-lg p-6 w-full max-w-md">
						<h2 className="text-lg font-semibold mb-4">保存录音</h2>
						<div className="space-y-4">
							<div>
								<label
									className="block text-sm font-medium mb-2"
									htmlFor="stop-confirm-title"
								>
									录音标题
								</label>
								<input
									type="text"
									id="stop-confirm-title"
									value={stopConfirmTitle}
									onChange={(e) => setStopConfirmTitle(e.target.value)}
									placeholder="请输入录音标题"
									className="w-full px-3 py-2 border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleConfirmSaveRecording();
										} else if (e.key === "Escape") {
											handleCancelSaveRecording();
										}
									}}
								/>
							</div>
							{pendingFullAudio && (
								<div className="text-sm text-muted-foreground">
									<p>
										录音时长:{" "}
										{Math.round(
											(pendingFullAudio.endTime.getTime() -
												pendingFullAudio.startTime.getTime()) /
												1000,
										)}{" "}
										秒
									</p>
									<p>
										文件大小:{" "}
										{(pendingFullAudio.blob.size / 1024 / 1024).toFixed(2)} MB
									</p>
								</div>
							)}
						</div>
						<div className="flex justify-end gap-2 mt-6">
							<button
								type="button"
								onClick={handleCancelSaveRecording}
								className="px-4 py-2 rounded-md border border-input bg-background hover:bg-muted text-sm font-medium transition-colors"
							>
								取消
							</button>
							<button
								type="button"
								onClick={handleConfirmSaveRecording}
								className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90"
							>
								保存
							</button>
						</div>
					</div>
				</div>
			)}

			{/* 错误提示 - 3秒后自动消失 */}
			{error && (
				<div className="shrink-0 px-6 py-2 bg-red-500/10 text-red-600 dark:text-red-400 text-sm border-t border-red-500/20">
					{error}
				</div>
			)}
		</div>
	);
}
