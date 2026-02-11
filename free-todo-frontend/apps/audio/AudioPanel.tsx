"use client";

import { AlertCircle, Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { FEATURE_ICON_MAP } from "@/lib/config/panel-config";
import { useTestAsrConfigApiTestAsrConfigPost } from "@/lib/generated/config/config";
import { useOpenSettings } from "@/lib/hooks/useOpenSettings";
import { useConfig } from "@/lib/query";
import { useAudioRecordingStore } from "@/lib/store/audio-recording-store";
import { AudioExtractionPanel } from "./components/AudioExtractionPanel";
import { AudioHeader } from "./components/AudioHeader";
import { AudioPlayer } from "./components/AudioPlayer";
import { RecordingStatus } from "./components/RecordingStatus";
import { StopRecordingConfirm } from "./components/StopRecordingConfirm";
import { TranscriptionView } from "./components/TranscriptionView";
import { useAudioData } from "./hooks/useAudioData";
import { useAudioDateSwitching } from "./hooks/useAudioDateSwitching";
import { useAudioPlayback } from "./hooks/useAudioPlayback";
import { useAudioRecording } from "./hooks/useAudioRecording";
import { useSegmentSync } from "./hooks/useSegmentSync";
import { useStopRecordingConfirm } from "./hooks/useStopRecordingConfirm";
import { getAudioApiBaseUrl } from "./utils/getAudioApiBaseUrl";
import { parseTimeToIsoWithDate as parseTimeToIsoWithDateUtil } from "./utils/parseTimeToIsoWithDate";
import { formatDateTime, formatTime, getSegmentDate } from "./utils/timeUtils";

export function AudioPanel() {
	const t = useTranslations("page");
	const [selectedDate, setSelectedDate] = useState(new Date());

	// 获取录音状态和控制函数（从全局 store）
	const { isRecording, startRecording, stopRecording } = useAudioRecording();

	// 从全局 store 获取实时录音数据（用于面板切换时保持状态）
	const storeTranscriptionText = useAudioRecordingStore((state) => state.transcriptionText);
	const storePartialText = useAudioRecordingStore((state) => state.partialText);
	const storeSegmentTimesSec = useAudioRecordingStore((state) => state.segmentTimesSec);
	const storeSegmentTimeLabels = useAudioRecordingStore((state) => state.segmentTimeLabels);
	const storeSegmentRecordingIds = useAudioRecordingStore((state) => state.segmentRecordingIds);
	const storeSegmentOffsetsSec = useAudioRecordingStore((state) => state.segmentOffsetsSec);
	const storeLiveTodos = useAudioRecordingStore((state) => state.liveTodos);
	const storeRecordingStartedAt = useAudioRecordingStore((state) => state.recordingStartedAt);

	// 从全局 store 获取更新方法
	const updateLastFinalEnd = useAudioRecordingStore((state) => state.updateLastFinalEnd);
	const appendTranscriptionText = useAudioRecordingStore((state) => state.appendTranscriptionText);
	const setStorePartialText = useAudioRecordingStore((state) => state.setPartialText);
	const appendSegmentData = useAudioRecordingStore((state) => state.appendSegmentData);
	const setStoreLiveTodos = useAudioRecordingStore((state) => state.setLiveTodos);
	const clearSessionData = useAudioRecordingStore((state) => state.clearSessionData);

	// 本地状态：用于回看模式（从后端加载的历史数据）
	const [localTranscriptionText, setLocalTranscriptionText] = useState("");
	const [panelNotice, setPanelNotice] = useState<{
		message: string;
		source: "asr" | "recording";
	} | null>(null);

	// 根据录音状态选择数据源：录音中使用 store 数据，回看使用本地数据
	const transcriptionText = isRecording ? storeTranscriptionText : localTranscriptionText;
	const partialText = isRecording ? storePartialText : "";

	const {
		selectedRecordingId,
		setSelectedRecordingId,
		selectedRecordingDurationSec,
		setSelectedRecordingDurationSec,
		recordingDurations,
		segmentOffsetsSec: dataSegmentOffsetsSec,
		setSegmentOffsetsSec: setDataSegmentOffsetsSec,
		segmentRecordingIds: dataSegmentRecordingIds,
		setSegmentRecordingIds: setDataSegmentRecordingIds,
		segmentTimeLabels: dataSegmentTimeLabels,
		setSegmentTimeLabels: setDataSegmentTimeLabels,
		segmentTimesSec: dataSegmentTimesSec,
		setSegmentTimesSec: setDataSegmentTimesSec,
		extractionsByRecordingId,
		setExtractionsByRecordingId,
		loadRecordings,
		loadTimeline,
	} = useAudioData(selectedDate, setLocalTranscriptionText);

	// 根据录音状态选择段落数据源
	const segmentTimesSec = isRecording ? storeSegmentTimesSec : dataSegmentTimesSec;
	const segmentTimeLabels = isRecording ? storeSegmentTimeLabels : dataSegmentTimeLabels;
	const segmentRecordingIds = isRecording ? storeSegmentRecordingIds : dataSegmentRecordingIds;
	const segmentOffsetsSec = isRecording ? storeSegmentOffsetsSec : dataSegmentOffsetsSec;
	const liveTodos = isRecording ? storeLiveTodos : [];

	// 停止录音确认弹窗和后续轮询逻辑
	const {
		showStopConfirm,
		isExtracting,
		isLoadingTimeline,
		setIsLoadingTimeline,
		openStopConfirm,
		cancelStopConfirm,
		confirmStop,
	} = useStopRecordingConfirm({ selectedDate, stopRecording, loadRecordings, loadTimeline });

	const {
		audioRef, isPlaying, currentTime, duration, playbackRate,
		ensureAudio, playPause, seekByRatio, setPlaybackRate,
	} = useAudioPlayback();

	// 段落选择同步
	const { selectedSegmentIndex, setSelectedSegmentIndex, currentSegmentText } = useSegmentSync({
		isRecording, selectedRecordingId, currentTime, segmentRecordingIds,
		segmentOffsetsSec, transcriptionText,
	});

	// 辅助函数：获取本地日期字符串（用于日期比较）
	const getLocalDateStringForCompare = useCallback((date: Date) => {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, "0");
		const day = String(date.getDate()).padStart(2, "0");
		return `${year}-${month}-${day}`;
	}, []);

	// 用于存储实时录音的完整状态（持久化，不被清空）
	const liveRecordingStateRef = useRef<{
		text: string;
		partialText: string;
		segmentTimesSec: number[];
		segmentOffsetsSec: number[];
		segmentRecordingIds: number[];
		segmentTimeLabels: string[];
		todos: Array<{ title: string; description?: string; deadline?: string; source_text?: string }>;
	}>({
		text: "",
		partialText: "",
		segmentTimesSec: [],
		segmentOffsetsSec: [],
		segmentRecordingIds: [],
		segmentTimeLabels: [],
		todos: [],
	});

	// 用于手动启动录音的 ref（防止重复启动）
	const isStartingRef = useRef(false);

	const formatAudioError = useCallback((rawMessage: string) => {
		const normalized = rawMessage.trim();
		const lower = normalized.toLowerCase();
		if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("api key")) {
			return "ASR API Key 未配置或无效，请在设置中填写后再开始录音。";
		}
		return normalized || "录音过程中发生错误";
	}, []);

	const showRecordingNotice = useCallback((message: string) => {
		setPanelNotice({ message, source: "recording" });
	}, []);

	const setAsrNotice = useCallback((message: string) => {
		setPanelNotice({ message, source: "asr" });
	}, []);

	const clearAsrNotice = useCallback(() => {
		setPanelNotice((prev) => (prev?.source === "asr" ? null : prev));
	}, []);

	const { openSettings } = useOpenSettings();
	const openAudioAsrSettings = useCallback(() => {
		openSettings();
		setTimeout(() => {
			window.dispatchEvent(
				new CustomEvent("settings:set-category", {
					detail: { category: "developer" },
				}),
			);
			const apiKeyInput = document.getElementById("asr-api-key");
			if (apiKeyInput) {
				apiKeyInput.scrollIntoView({ behavior: "smooth", block: "center" });
			} else {
				const settingsContent = document.querySelector('[data-tour="settings-content"]');
				settingsContent?.scrollTo({ top: 0, behavior: "smooth" });
			}
		}, 200);
	}, [openSettings]);

	const { data: config, isLoading: configLoading } = useConfig();
	const testAsrMutation = useTestAsrConfigApiTestAsrConfigPost();
	const is24x7Enabled = (config?.audioIs24x7 as boolean | undefined) ?? false;

	const asrApiKey = (config?.audioAsrApiKey as string | undefined) ?? "";
	const asrBaseUrl = (config?.audioAsrBaseUrl as string | undefined) ?? "";
	const asrModel = (config?.audioAsrModel as string | undefined) ?? "fun-asr-realtime";
	const asrSampleRate = (config?.audioAsrSampleRate as number | undefined) ?? 16000;
	const asrFormat = (config?.audioAsrFormat as string | undefined) ?? "pcm";
	const asrSemanticPunc =
		(config?.audioAsrSemanticPunctuationEnabled as boolean | undefined) ?? false;
	const asrMaxSilence = (config?.audioAsrMaxSentenceSilence as number | undefined) ?? 1300;
	const asrHeartbeat = (config?.audioAsrHeartbeat as boolean | undefined) ?? false;

	const lastAsrCheckRef = useRef<string | null>(null);
	const asrCheckInFlightRef = useRef(false);

	useEffect(() => {
		if (configLoading) return;

		const trimmedKey = asrApiKey.trim();
		const trimmedBaseUrl = asrBaseUrl.trim();
		const invalidKeys = new Set(["", "YOUR_ASR_KEY_HERE", "YOUR_API_KEY_HERE", "xxx"]);

		if (invalidKeys.has(trimmedKey) || !trimmedBaseUrl) {
			setAsrNotice("音频识别未配置或无效，请先填写 ASR 配置。");
			lastAsrCheckRef.current = JSON.stringify({
				key: trimmedKey,
				baseUrl: trimmedBaseUrl,
				model: asrModel,
				sampleRate: asrSampleRate,
				format: asrFormat,
				semanticPunc: asrSemanticPunc,
				maxSilence: asrMaxSilence,
				heartbeat: asrHeartbeat,
			});
			return;
		}

		const signature = JSON.stringify({
			key: trimmedKey,
			baseUrl: trimmedBaseUrl,
			model: asrModel,
			sampleRate: asrSampleRate,
			format: asrFormat,
			semanticPunc: asrSemanticPunc,
			maxSilence: asrMaxSilence,
			heartbeat: asrHeartbeat,
		});

		if (lastAsrCheckRef.current === signature || asrCheckInFlightRef.current) {
			return;
		}

		lastAsrCheckRef.current = signature;
		asrCheckInFlightRef.current = true;

		testAsrMutation
			.mutateAsync({
				data: {
					audioAsrApiKey: trimmedKey,
					audioAsrBaseUrl: trimmedBaseUrl,
					audioAsrModel: asrModel,
					audioAsrSampleRate: asrSampleRate,
					audioAsrFormat: asrFormat,
					audioAsrSemanticPunctuationEnabled: asrSemanticPunc,
					audioAsrMaxSentenceSilence: asrMaxSilence,
					audioAsrHeartbeat: asrHeartbeat,
				},
			})
			.then((response) => {
				const result = response as { success?: boolean; error?: string };
				if (result.success) {
					clearAsrNotice();
					return;
				}
				setAsrNotice(result.error || "音频识别配置不可用，请检查 ASR 配置。");
			})
			.catch((error) => {
				const errorMsg = error instanceof Error ? error.message : String(error);
				setAsrNotice(`音频识别配置不可用：${errorMsg}`);
			})
			.finally(() => {
				asrCheckInFlightRef.current = false;
			});

		return;
	}, [
		configLoading,
		asrApiKey,
		asrBaseUrl,
		asrModel,
		asrSampleRate,
		asrFormat,
		asrSemanticPunc,
		asrMaxSilence,
		asrHeartbeat,
		clearAsrNotice,
		setAsrNotice,
		testAsrMutation,
	]);

	// 计算是否正在查看当前日期
	const isViewingCurrentDate = useMemo(() => {
		const now = new Date();
		return getLocalDateStringForCompare(selectedDate) === getLocalDateStringForCompare(now);
	}, [selectedDate, getLocalDateStringForCompare]);

	// 跳转到当前日期
	const handleJumpToCurrentDate = useCallback(() => setSelectedDate(new Date()), []);

	// 手动开始录音
	const handleStartRecording = useCallback(async () => {
		if (isRecording || isStartingRef.current) return;
		isStartingRef.current = true;
		try {
			clearSessionData();
			setSelectedSegmentIndex(null);
			await startRecording(
				(text, isFinal) => {
					if (isFinal && text.startsWith("__SEGMENT_SAVED__")) return;
					if (isFinal) {
						const storeState = useAudioRecordingStore.getState();
						const currentRecordingStartedAt = storeState.recordingStartedAt ?? Date.now();
						const segmentStartMs = storeState.lastFinalEndMs ?? currentRecordingStartedAt;
						const elapsedSec = (segmentStartMs - currentRecordingStartedAt) / 1000;
						updateLastFinalEnd(Date.now());
						appendTranscriptionText(text);
						const start = storeState.recordingStartedDate ?? new Date();
						const segmentDate = getSegmentDate(start, elapsedSec, selectedDate);
						appendSegmentData({
							timeSec: elapsedSec,
							timeLabel: formatDateTime(segmentDate),
							recordingId: 0,
							offsetSec: elapsedSec,
						});
						setStorePartialText("");
					} else {
						setStorePartialText(text);
					}
				},
				(data) => {
					if (Array.isArray(data.todos)) setStoreLiveTodos(data.todos);
				},
				(error) => {
					const errorMessage = error instanceof Error ? error.message : "录音过程中发生错误";
					showRecordingNotice(formatAudioError(errorMessage));
				},
				is24x7Enabled
			);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "启动录音失败";
			showRecordingNotice(formatAudioError(errorMessage));
		} finally {
			isStartingRef.current = false;
		}
	}, [
		isRecording, clearSessionData, startRecording, updateLastFinalEnd,
		appendTranscriptionText, appendSegmentData, setStorePartialText,
		setStoreLiveTodos, selectedDate, setSelectedSegmentIndex,
		showRecordingNotice, formatAudioError, is24x7Enabled,
	]);

	// 手动停止录音（显示确认弹窗）
	const handleStopRecording = useCallback(() => {
		if (!isRecording) return;
		openStopConfirm();
	}, [isRecording, openStopConfirm]);

	// 用于防止数据加载错乱：记录当前加载请求的日期
	const currentLoadingDateRef = useRef<string | null>(null);

	// 创建适配器函数，让 useAudioDateSwitching 能够操作本地状态（用于回看模式）
	const setTranscriptionTextAdapter = useCallback((text: string | ((prev: string) => string)) => {
		if (typeof text === "function") {
			setLocalTranscriptionText((prev) => text(prev));
		} else {
			setLocalTranscriptionText(text);
		}
	}, []);

	// 使用日期切换 hook（操作本地状态用于回看模式）
	useAudioDateSwitching({
		selectedDate, isRecording, isViewingCurrentDate, liveRecordingStateRef, currentLoadingDateRef,
		setTranscriptionText: setTranscriptionTextAdapter,
		setPartialText: setStorePartialText, setSegmentTimesSec: setDataSegmentTimesSec,
		setSegmentOffsetsSec: setDataSegmentOffsetsSec, setSegmentRecordingIds: setDataSegmentRecordingIds,
		setSegmentTimeLabels: setDataSegmentTimeLabels, setLiveTodos: setStoreLiveTodos,
		setIsLoadingTimeline, loadTimeline,
	});

	const formatDate = (date: Date) => `${date.toLocaleDateString("zh-CN", {
		year: "numeric", month: "long", day: "numeric",
	})} 录音`;

	const Icon = FEATURE_ICON_MAP.audio;
	const apiBaseUrl = getAudioApiBaseUrl();

	const handlePlayFromTranscription = useCallback(() => {
		if (!selectedRecordingId) return;
		playPause(`${apiBaseUrl}/api/audio/recording/${selectedRecordingId}/file`);
	}, [apiBaseUrl, selectedRecordingId, playPause]);

	const handleSeekToSegment = useCallback((index: number) => {
		const recId = segmentRecordingIds[index] ?? selectedRecordingId;
		if (!recId) return;
		const audioUrl = `${apiBaseUrl}/api/audio/recording/${recId}/file`;
		ensureAudio(audioUrl);
		const audio = audioRef.current;
		if (!audio) return;

		const direct = segmentOffsetsSec[index];
		const segmentsCount = Math.max(1, segmentOffsetsSec.length);
		const dur = recordingDurations[recId] ?? selectedRecordingDurationSec;
		const fallback = dur > 0 ? (index / segmentsCount) * dur : 0;
		const target = (Number.isFinite(direct) ? direct : fallback) + 1;

		try {
			audio.currentTime = Math.max(0, target);
			audio.play().catch(() => {});
			setSelectedRecordingId(recId);
			setSelectedSegmentIndex(index);
			if (dur) setSelectedRecordingDurationSec(dur);
		} catch (e) {
			console.error("Failed to seek audio:", e);
		}
	}, [
		apiBaseUrl, ensureAudio, selectedRecordingId, segmentRecordingIds, segmentOffsetsSec,
		selectedRecordingDurationSec, recordingDurations, audioRef, setSelectedRecordingId, setSelectedRecordingDurationSec, setSelectedSegmentIndex,
	]);

	const handlePlayPause = useCallback(() => {
		if (!audioRef.current) handlePlayFromTranscription();
		else playPause();
	}, [handlePlayFromTranscription, playPause, audioRef]);

	const handleSeekInPlayer = useCallback((ratio: number) => seekByRatio(ratio), [seekByRatio]);

	// 每一条文本段对应的高亮数据
	const segmentTodos = useMemo(() => segmentRecordingIds.map((recId) => {
		if (recId === 0) return liveTodos;
		const ext = recId != null ? extractionsByRecordingId[recId] : undefined;
		return ext?.todos ?? [];
	}), [segmentRecordingIds, liveTodos, extractionsByRecordingId]);

	const dateKey = useMemo(() => selectedDate.toISOString().split("T")[0], [selectedDate]);
	const parseTimeToIsoWithDate = useCallback(
		(raw?: string | null) => parseTimeToIsoWithDateUtil(raw, selectedDate),
		[selectedDate],
	);

	// 自动轮询：查看当天且未录音时，每秒刷新一次（支持硬件设备实时推送）
	useEffect(() => {
		// 只在查看当天且未录音时轮询
		if (!isViewingCurrentDate || isRecording) {
			console.log("[AudioPanel] 轮询已停止 -", { isViewingCurrentDate, isRecording });
			return;
		}

		let isFetching = false;
		const pollTimelineSilently = async () => {
			if (isFetching) return;
			isFetching = true;
			try {
				// 后台轮询不应反复触发“获取中”提示，避免停录后闪烁
				await loadTimeline(undefined, true);
			} finally {
				isFetching = false;
			}
		};

		console.log("[AudioPanel] 启动自动轮询（每秒）");
		// 轮询开始前清理一次 loading，避免沿用停录流程中的旧状态
		setIsLoadingTimeline(false);
		// 立即静默加载一次
		void pollTimelineSilently();

		// 每秒轮询
		const interval = setInterval(() => {
			console.log("[AudioPanel] 轮询：加载时间线");
			void pollTimelineSilently();
		}, 1000);

		return () => {
			console.log("[AudioPanel] 停止轮询");
			clearInterval(interval);
		};
	}, [isViewingCurrentDate, isRecording, loadTimeline, setIsLoadingTimeline]);

	return (
		<div className="flex h-full flex-col bg-[oklch(var(--background))] overflow-hidden">
			<PanelHeader icon={Icon} title={t("audioLabel")} />

			{panelNotice && (
				<div className="px-4 pt-3" role="alert">
					<button
						type="button"
						onClick={openAudioAsrSettings}
						className="flex w-full items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-left text-sm text-red-800 shadow-sm transition hover:border-red-300 hover:bg-red-100"
					>
						<AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
						<span className="flex-1 leading-5">{panelNotice.message}</span>
						<span className="inline-flex items-center gap-1 text-xs font-semibold uppercase text-red-700">
							<Settings className="h-3.5 w-3.5" />
							设置
						</span>
					</button>
				</div>
			)}

			<AudioHeader
				isRecording={isRecording}
				selectedDate={selectedDate}
				onDateChange={setSelectedDate}
				onJumpToCurrentDate={handleJumpToCurrentDate}
				onStartRecording={handleStartRecording}
				onStopRecording={handleStopRecording}
			/>

			<AudioExtractionPanel
				dateKey={dateKey}
				segmentRecordingIds={segmentRecordingIds}
				extractionsByRecordingId={extractionsByRecordingId}
				setExtractionsByRecordingId={setExtractionsByRecordingId}
				parseTimeToIsoWithDate={parseTimeToIsoWithDate}
				liveTodos={liveTodos}
				isRecording={isRecording}
				isExtracting={isExtracting}
			/>

			<TranscriptionView
				text={transcriptionText}
				partialText={isRecording && isViewingCurrentDate ? partialText : ""}
				isRecording={isRecording && isViewingCurrentDate}
				segmentTodos={segmentTodos}
				segmentTimesSec={segmentTimesSec}
				segmentTimeLabels={segmentTimeLabels}
				selectedSegmentIndex={selectedSegmentIndex}
				onSegmentClick={(index) => {
					const recordingId = segmentRecordingIds[index];
					if (recordingId && recordingId > 0) handleSeekToSegment(index);
				}}
				isLoadingTimeline={isLoadingTimeline}
			/>

			{isRecording && isViewingCurrentDate ? (
				<RecordingStatus isRecording={isRecording} recordingStartedAt={storeRecordingStartedAt || undefined} />
			) : (
				selectedRecordingId && (
					<AudioPlayer
						title={formatDate(selectedDate)}
						date=""
						currentTime={formatTime(currentTime)}
						totalTime={formatTime(duration)}
						isPlaying={isPlaying}
						onPlay={handlePlayPause}
						progress={duration > 0 ? currentTime / duration : 0}
						onSeek={handleSeekInPlayer}
						currentSegmentText={currentSegmentText}
						playbackRate={playbackRate}
						onPlaybackRateChange={setPlaybackRate}
					/>
				)
			)}

			<StopRecordingConfirm isOpen={showStopConfirm} onCancel={cancelStopConfirm} onConfirm={confirmStop} />
		</div>
	);
}
