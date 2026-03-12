/**
 * 全局音频录音状态管理
 *
 * 将录音状态和资源提升到全局层面，使录音在面板切换时不会中断。
 * 核心思路：
 * - 使用模块级变量存储不可序列化的资源（WebSocket、AudioContext、MediaStream）
 * - 使用 Zustand store 存储可序列化的状态（isRecording、transcriptionText 等）
 * - 组件卸载时不清理录音资源，只有显式调用 stopRecording 才会停止
 */

import { create } from "zustand";

// ========== 类型定义 ==========

interface TodoItem {
	title: string;
	description?: string;
	deadline?: string;
	source_text?: string;
}

type TranscriptionCallback = (text: string, isFinal: boolean) => void

type RealtimeNlpCallback = (data: {
		todos?: TodoItem[];
	}) => void

type ErrorCallback = (error: Error) => void

interface AudioRecordingState {
	/** 是否正在录音 */
	isRecording: boolean;
	/** 录音开始时间（毫秒时间戳） */
	recordingStartedAt: number | null;
	/** 录音开始的 Date 对象（用于时间标签） */
	recordingStartedDate: Date | null;
	/** 上一个 final 文本的时间戳（用于计算段落时间） */
	lastFinalEndMs: number | null;

	// ===== 转录数据（在面板切换时保持） =====
	/** 原始转录文本 */
	transcriptionText: string;
	/** 正在识别的部分文本（未确认） */
	partialText: string;
	/** 段落时间（秒） */
	segmentTimesSec: number[];
	/** 段落时间标签 */
	segmentTimeLabels: string[];
	/** 段落录音 ID */
	segmentRecordingIds: number[];
	/** 段落偏移（秒） */
	segmentOffsetsSec: number[];
	/** 实时提取的待办 */
	liveTodos: TodoItem[];
}

interface AudioRecordingActions {
	/** 开始录音 */
	startRecording: (
		onTranscription: TranscriptionCallback,
		onRealtimeNlp?: RealtimeNlpCallback,
		onError?: ErrorCallback,
		is24x7?: boolean,
	) => Promise<void>;
	/** 停止录音 */
	stopRecording: (segmentTimestamps?: number[]) => void;
	/** 重置时间戳引用（用于新段落） */
	resetLastFinalEnd: () => void;
	/** 更新 lastFinalEndMs */
	updateLastFinalEnd: (ms: number) => void;

	// ===== 转录数据更新方法 =====
	/** 追加转录文本 */
	appendTranscriptionText: (text: string) => void;
	/** 设置部分文本 */
	setPartialText: (text: string) => void;
	/** 追加段落数据 */
	appendSegmentData: (data: {
		timeSec: number;
		timeLabel: string;
		recordingId: number;
		offsetSec: number;
	}) => void;
	/** 设置实时待办 */
	setLiveTodos: (todos: TodoItem[]) => void;
	/** 清空录音会话数据（开始新录音时调用） */
	clearSessionData: () => void;
}

type AudioRecordingStore = AudioRecordingState & AudioRecordingActions;

// ========== 模块级资源存储（不可序列化） ==========

const TARGET_SAMPLE_RATE = 16000;
const MAX_BUFFERED_SECONDS = 10;
const MAX_BUFFERED_PCM_BYTES = TARGET_SAMPLE_RATE * 2 * MAX_BUFFERED_SECONDS; // PCM16 mono
const WORKLET_MODULE_PATH = "/audio/pcm16-capture-worklet.js";
const WORKLET_PROCESSOR_NAME = "pcm16-capture";
const WORKLET_CHUNK_SAMPLES = 1024;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;
const DIAGNOSTIC_LOG_INTERVAL_MS = 5000;
const AUDIO_DIAGNOSTICS_ENABLED = process.env.NEXT_PUBLIC_AUDIO_DIAGNOSTICS === "1";

let wsRef: WebSocket | null = null;
let audioContextRef: AudioContext | null = null;
let processorRef: ScriptProcessorNode | null = null;
let sourceNodeRef: MediaStreamAudioSourceNode | null = null;
let silentGainNodeRef: GainNode | null = null;
let workletNodeRef: AudioWorkletNode | null = null;
let mediaStreamRef: MediaStream | null = null;
let bufferedPcmQueue: ArrayBuffer[] = [];
let bufferedPcmBytes = 0;
let diagnosticsIntervalRef: ReturnType<typeof setInterval> | null = null;

interface AudioTransportMetrics {
	capturedBytes: number;
	sentBytes: number;
	droppedBytes: number;
	chunksCaptured: number;
	chunksSent: number;
	queuedBytesPeak: number;
	wsBufferedAmountPeak: number;
	startedAtMs: number;
	lastCaptureAtMs: number;
	lastSendAtMs: number;
	usedWorklet: boolean;
}

let transportMetricsRef: AudioTransportMetrics | null = null;

// 回调函数引用（用于在 WebSocket 消息中调用）
let currentOnTranscription: TranscriptionCallback | null = null;
let currentOnRealtimeNlp: RealtimeNlpCallback | null = null;
let currentOnError: ErrorCallback | null = null;

// ========== 7×24 自动重连相关变量 ==========
let reconnectTimeoutRef: ReturnType<typeof setTimeout> | null = null;
let reconnectAttemptsRef = 0;
const maxReconnectAttempts = 5;
const reconnectDelayMs = 3000; // 3秒后重连
let shouldReconnectRef = false; // 标记是否应该重连
let currentIs24x7 = false; // 当前是否为 7×24 模式
let isReconnectingInternally = false; // 标记是否正在内部重连（绕过 isRecording 检查）

// ========== 内部辅助函数 ==========

/**
 * 获取 API 基础 URL
 */
function getApiBaseUrl(): string {
	return (
		process.env.NEXT_PUBLIC_API_URL ||
		(typeof window !== "undefined" &&
			(window as Window & { __BACKEND_URL__?: string }).__BACKEND_URL__) ||
		"http://127.0.0.1:8100"
	);
}

function resetTransportMetrics(usedWorklet: boolean): void {
	const now = Date.now();
	transportMetricsRef = {
		capturedBytes: 0,
		sentBytes: 0,
		droppedBytes: 0,
		chunksCaptured: 0,
		chunksSent: 0,
		queuedBytesPeak: 0,
		wsBufferedAmountPeak: 0,
		startedAtMs: now,
		lastCaptureAtMs: now,
		lastSendAtMs: now,
		usedWorklet,
	};
}

function stopDiagnosticsLoop(): void {
	if (diagnosticsIntervalRef) {
		clearInterval(diagnosticsIntervalRef);
		diagnosticsIntervalRef = null;
	}
}

function startDiagnosticsLoop(): void {
	stopDiagnosticsLoop();
	if (!AUDIO_DIAGNOSTICS_ENABLED) return;

	diagnosticsIntervalRef = setInterval(() => {
		const metrics = transportMetricsRef;
		if (!metrics) return;
		const ws = wsRef;
		const elapsedMs = Math.max(1, Date.now() - metrics.startedAtMs);
		const capturedKbps = (metrics.capturedBytes * 8) / elapsedMs;
		const sentKbps = (metrics.sentBytes * 8) / elapsedMs;
		console.info("[AudioRecordingStore] capture diagnostics", {
			usedWorklet: metrics.usedWorklet,
			wsState: ws?.readyState,
			capturedBytes: metrics.capturedBytes,
			sentBytes: metrics.sentBytes,
			droppedBytes: metrics.droppedBytes,
			bufferedQueueBytes: bufferedPcmBytes,
			queuedBytesPeak: metrics.queuedBytesPeak,
			wsBufferedAmount: ws?.bufferedAmount ?? 0,
			wsBufferedAmountPeak: metrics.wsBufferedAmountPeak,
			capturedKbps: Number(capturedKbps.toFixed(2)),
			sentKbps: Number(sentKbps.toFixed(2)),
			chunksCaptured: metrics.chunksCaptured,
			chunksSent: metrics.chunksSent,
		});
	}, DIAGNOSTIC_LOG_INTERVAL_MS);
}

function updateWsBufferedAmountPeak(ws: WebSocket): void {
	const metrics = transportMetricsRef;
	if (!metrics) return;
	metrics.wsBufferedAmountPeak = Math.max(metrics.wsBufferedAmountPeak, ws.bufferedAmount);
}

function sendPcmChunk(ws: WebSocket, chunk: ArrayBuffer): boolean {
	try {
		ws.send(chunk);
		const metrics = transportMetricsRef;
		if (metrics) {
			metrics.sentBytes += chunk.byteLength;
			metrics.chunksSent += 1;
			metrics.lastSendAtMs = Date.now();
			updateWsBufferedAmountPeak(ws);
		}
		return true;
	} catch {
		return false;
	}
}

function queuePcmChunk(chunk: ArrayBuffer): void {
	bufferedPcmQueue.push(chunk);
	bufferedPcmBytes += chunk.byteLength;
	const metrics = transportMetricsRef;
	if (metrics) {
		metrics.queuedBytesPeak = Math.max(metrics.queuedBytesPeak, bufferedPcmBytes);
	}

	while (bufferedPcmBytes > MAX_BUFFERED_PCM_BYTES && bufferedPcmQueue.length > 0) {
		const dropped = bufferedPcmQueue.shift();
		if (dropped) {
			bufferedPcmBytes -= dropped.byteLength;
			if (metrics) {
				metrics.droppedBytes += dropped.byteLength;
			}
		}
	}
}

function flushBufferedPcmQueue(ws: WebSocket): void {
	while (bufferedPcmQueue.length > 0 && ws.readyState === WebSocket.OPEN) {
		if (ws.bufferedAmount > MAX_BUFFERED_PCM_BYTES * 2) {
			break;
		}

		const nextChunk = bufferedPcmQueue[0];
		if (!sendPcmChunk(ws, nextChunk)) {
			break;
		}
		bufferedPcmQueue.shift();
		bufferedPcmBytes -= nextChunk.byteLength;
	}
}

function handleCapturedPcmChunk(chunk: ArrayBuffer): void {
	const metrics = transportMetricsRef;
	if (metrics) {
		metrics.capturedBytes += chunk.byteLength;
		metrics.chunksCaptured += 1;
		metrics.lastCaptureAtMs = Date.now();
	}

	const ws = wsRef;
	if (ws && ws.readyState === WebSocket.OPEN) {
		// 保证发送顺序：优先把历史缓冲清掉，再尝试发送当前块
		flushBufferedPcmQueue(ws);
		if (bufferedPcmQueue.length === 0 && ws.bufferedAmount <= MAX_BUFFERED_PCM_BYTES * 2) {
			if (sendPcmChunk(ws, chunk)) {
				return;
			}
		}
	}

	queuePcmChunk(chunk);
	if (ws && ws.readyState === WebSocket.OPEN) {
		flushBufferedPcmQueue(ws);
	}
}

function float32ToPcm16Buffer(input: Float32Array): ArrayBuffer {
	const buffer = new ArrayBuffer(input.length * 2);
	const view = new DataView(buffer);
	for (let i = 0; i < input.length; i++) {
		const sample = Math.max(-1, Math.min(1, input[i]));
		view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
	}
	return buffer;
}

async function setupCapturePipeline(
	audioContext: AudioContext,
	source: MediaStreamAudioSourceNode,
	silentGain: GainNode,
): Promise<boolean> {
	if (typeof AudioWorkletNode === "undefined" || !audioContext.audioWorklet) {
		return false;
	}

	try {
		await audioContext.audioWorklet.addModule(WORKLET_MODULE_PATH);
		const workletNode = new AudioWorkletNode(audioContext, WORKLET_PROCESSOR_NAME, {
			numberOfInputs: 1,
			numberOfOutputs: 1,
			outputChannelCount: [1],
			channelCount: 1,
			channelCountMode: "explicit",
			processorOptions: {
				chunkSamples: WORKLET_CHUNK_SAMPLES,
			},
		});

		workletNodeRef = workletNode;
		if (transportMetricsRef) {
			transportMetricsRef.usedWorklet = true;
		}

		workletNode.port.onmessage = (event: MessageEvent<unknown>) => {
			if (typeof event.data !== "object" || event.data === null) return;
			const message = event.data as {
				type?: string;
				payload?: ArrayBuffer;
				droppedFrames?: number;
			};

			if (message.type === "pcm16" && message.payload instanceof ArrayBuffer) {
				handleCapturedPcmChunk(message.payload);
				return;
			}

			if (
				message.type === "telemetry" &&
				typeof message.droppedFrames === "number" &&
				message.droppedFrames > 0
			) {
				console.warn("[AudioRecordingStore] AudioWorklet dropped frames", {
					droppedFrames: message.droppedFrames,
				});
			}
		};

		source.connect(workletNode);
		workletNode.connect(silentGain);
		return true;
	} catch (error) {
		console.warn("[AudioRecordingStore] AudioWorklet unavailable, fallback to ScriptProcessor", error);
		if (workletNodeRef) {
			try {
				workletNodeRef.disconnect();
			} catch {
				// ignore
			}
			workletNodeRef = null;
		}
		if (transportMetricsRef) {
			transportMetricsRef.usedWorklet = false;
		}
		return false;
	}
}

/**
 * 清理录音资源
 * @param segmentTimestamps 段落时间戳数组
 * @param isReconnecting 是否正在重连（重连时不清理回调）
 */
function cleanupRecordingResources(segmentTimestamps?: number[], isReconnecting = false): void {
	// 停止 WebAudio
	stopDiagnosticsLoop();

	if (workletNodeRef) {
		try {
			workletNodeRef.port.onmessage = null;
			workletNodeRef.disconnect();
		} catch {
			// ignore
		}
		workletNodeRef = null;
	}

	if (processorRef) {
		try {
			processorRef.disconnect();
		} catch {
			// ignore
		}
		processorRef.onaudioprocess = null;
		processorRef = null;
	}

	if (sourceNodeRef) {
		try {
			sourceNodeRef.disconnect();
		} catch {
			// ignore
		}
		sourceNodeRef = null;
	}

	if (silentGainNodeRef) {
		try {
			silentGainNodeRef.disconnect();
		} catch {
			// ignore
		}
		silentGainNodeRef = null;
	}

	if (audioContextRef) {
		try {
			audioContextRef.close();
		} catch {
			// ignore
		}
		audioContextRef = null;
	}
	if (mediaStreamRef) {
		for (const track of mediaStreamRef.getTracks()) {
			track.stop();
		}
		mediaStreamRef = null;
	}
	if (wsRef) {
		// 发送停止消息，包含时间戳数组（如果提供）
		const stopMessage: { type: string; segment_timestamps?: number[] } = {
			type: "stop",
		};
		if (segmentTimestamps && segmentTimestamps.length > 0) {
			stopMessage.segment_timestamps = segmentTimestamps;
		}
		try {
			wsRef.send(JSON.stringify(stopMessage));
			wsRef.close();
		} catch {
			// ignore
		}
		wsRef = null;
	}

	bufferedPcmQueue = [];
	bufferedPcmBytes = 0;
	transportMetricsRef = null;

	// 如果不是重连，清理回调引用和重连状态
	if (!isReconnecting) {
		currentOnTranscription = null;
		currentOnRealtimeNlp = null;
		currentOnError = null;
		// 停止自动重连
		shouldReconnectRef = false;
		if (reconnectTimeoutRef) {
			clearTimeout(reconnectTimeoutRef);
			reconnectTimeoutRef = null;
		}
		reconnectAttemptsRef = 0;
		currentIs24x7 = false;
	}
}

// ========== Zustand Store ==========

export const useAudioRecordingStore = create<AudioRecordingStore>((set, get) => ({
	// ===== 核心状态 =====
	isRecording: false,
	recordingStartedAt: null,
	recordingStartedDate: null,
	lastFinalEndMs: null,

	// ===== 转录数据 =====
	transcriptionText: "",
	partialText: "",
	segmentTimesSec: [],
	segmentTimeLabels: [],
	segmentRecordingIds: [],
	segmentOffsetsSec: [],
	liveTodos: [],

	// ===== Actions =====

		startRecording: async (onTranscription, onRealtimeNlp, onError, is24x7 = false) => {
			// 如果已经在录音且不是内部重连，直接返回
			if (get().isRecording && !isReconnectingInternally) {
				console.warn("[AudioRecordingStore] Already recording, ignoring start request");
				return;
			}

			try {
				// 设置 7×24 模式标志
				currentIs24x7 = is24x7;
				shouldReconnectRef = is24x7; // 7×24 模式启用自动重连

				// 重要：AudioContext 需要尽可能在用户手势（点击）触发的调用栈内创建/恢复，
				// 否则某些浏览器/环境会将其保持为 suspended，导致长时间无音频回调 → 录音严重丢帧。
				type AudioContextCtor = typeof AudioContext & {
					webkitAudioContext?: typeof AudioContext;
				};
				const AudioCtx = (window.AudioContext ||
					(window as unknown as { webkitAudioContext?: typeof AudioContext })
						.webkitAudioContext) as AudioContextCtor;
				const audioContext = new AudioCtx({ sampleRate: TARGET_SAMPLE_RATE });
				audioContextRef = audioContext;
				void audioContext.resume().catch((e) => {
					console.warn("[AudioRecordingStore] AudioContext resume failed:", e);
				});

				// 如果是重连成功，重置重连计数
				if (reconnectAttemptsRef > 0) {
					reconnectAttemptsRef = 0;
					console.log("[AudioRecordingStore] WebSocket 重连成功");
				}

				// 获取麦克风权限
				console.log("[AudioRecordingStore] 请求麦克风权限...");
				const stream = await navigator.mediaDevices.getUserMedia({
					audio: {
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true,
						channelCount: 1,
					},
				});
				console.log("[AudioRecordingStore] ✅ 麦克风权限已获取");
				mediaStreamRef = stream;

			// 保存回调引用
				currentOnTranscription = onTranscription;
				currentOnRealtimeNlp = onRealtimeNlp || null;
				currentOnError = onError || null;

				// 初始化本地缓冲（WebSocket 尚未 OPEN 时先暂存一小段 PCM）
				bufferedPcmQueue = [];
				bufferedPcmBytes = 0;
				resetTransportMetrics(false);
				startDiagnosticsLoop();

				const source = audioContext.createMediaStreamSource(stream);
				sourceNodeRef = source;
				const silentGain = audioContext.createGain();
				silentGain.gain.value = 0;
				silentGainNodeRef = silentGain;

				const workletReady = await setupCapturePipeline(audioContext, source, silentGain);
				if (!workletReady) {
					const processor = audioContext.createScriptProcessor(
						SCRIPT_PROCESSOR_BUFFER_SIZE,
						1,
						1,
					);
					processorRef = processor;
					if (transportMetricsRef) {
						transportMetricsRef.usedWorklet = false;
					}

					processor.onaudioprocess = (e) => {
						const input = e.inputBuffer.getChannelData(0); // Float32 [-1, 1]
						handleCapturedPcmChunk(float32ToPcm16Buffer(input));
					};

					source.connect(processor);
					processor.connect(silentGain);
				}

				silentGain.connect(audioContext.destination);

				// 连接到后端 WebSocket
				const apiBaseUrl = getApiBaseUrl();
				const wsUrl = apiBaseUrl.replace("http://", "ws://").replace("https://", "wss://");
				const wsEndpoint = `${wsUrl}/api/audio/transcribe`;
				const ws = new WebSocket(wsEndpoint);
				ws.binaryType = "arraybuffer";
				wsRef = ws;

				ws.onopen = () => {
					// 发送初始化消息
					ws.send(JSON.stringify({ is_24x7: is24x7 }));

					// 刷新缓冲：把 WebSocket 建连期间缓存的音频补发出去（最多 MAX_BUFFERED_SECONDS）
					flushBufferedPcmQueue(ws);
				};

				// 记录开始时间并更新状态（不等待 ws.onopen，避免 UI/逻辑误判“未录音”）
				const now = Date.now();
				set({
					isRecording: true,
					recordingStartedAt: now,
					recordingStartedDate: new Date(),
					lastFinalEndMs: null,
				});

				ws.onmessage = (event) => {
				try {
					if (typeof event.data === "string") {
						const data = JSON.parse(event.data);

						if (data.header?.name === "TaskFailed") {
							const errorText =
								typeof data.payload?.error === "string"
									? data.payload.error
									: "ASR 服务发生错误，请检查音频识别配置";
							if (currentOnError) {
								currentOnError(new Error(errorText));
							}
							cleanupRecordingResources();
							set({
								isRecording: false,
								recordingStartedAt: null,
								recordingStartedDate: null,
								lastFinalEndMs: null,
							});
							return;
						}

						// 转录结果
						if (data.header?.name === "TranscriptionResultChanged") {
							const text = data.payload?.result;
							const isFinal = data.payload?.is_final || false;
							if (text && currentOnTranscription) {
								currentOnTranscription(text, isFinal);
							}
							return;
						}

						// 实时提取结果
						if (data.header?.name === "ExtractionChanged") {
							const todos = data.payload?.todos;
							if (currentOnRealtimeNlp) {
								currentOnRealtimeNlp({
									todos: Array.isArray(todos) ? todos : [],
								});
							}
							return;
						}

						// 分段保存通知（7×24 模式）
						if (data.header?.name === "SegmentSaved") {
							// 通知前端分段已保存，需要重置时间戳和文本
							// 通过特殊标记传递给 onTranscription，并传递原因
							const reason = data.payload?.message || "分段保存";
							if (currentOnTranscription) {
								currentOnTranscription(`__SEGMENT_SAVED__:${reason}`, true);
							}
							console.log("[AudioRecordingStore] 收到分段保存通知:", reason);
							return;
						}
					}
				} catch (error) {
					console.error("Failed to parse transcription data:", error);
				}
			};

			ws.onerror = (error) => {
				const errorMessage =
					error instanceof Error
						? error.message
						: "WebSocket连接错误，请检查后端服务是否运行";
				console.error("WebSocket error:", errorMessage, error);
				// 注意：不在 onerror 中设置 isRecording = false
				// 浏览器中 onerror 总是紧接着 onclose，由 onclose 统一处理状态变更
				// 这样可以避免在自动重连场景下 UI 闪烁
			};

				ws.onclose = (event) => {
				// 正常关闭（用户主动停止或服务器正常关闭）
				if (event.wasClean) {
					set({
						isRecording: false,
						recordingStartedAt: null,
						recordingStartedDate: null,
						lastFinalEndMs: null,
					});
					shouldReconnectRef = false;
					currentIs24x7 = false;
					return;
				}

					// 如果已经被标记为不应该重连（用户主动关闭），直接设置为停止状态
					if (!shouldReconnectRef) {
						console.log("[AudioRecordingStore] 已禁用自动重连，跳过重连");
						cleanupRecordingResources();
						set({
							isRecording: false,
							recordingStartedAt: null,
							recordingStartedDate: null,
						lastFinalEndMs: null,
					});
					return;
				}

				// 异常关闭：如果是 7×24 模式，尝试自动重连
				if (currentIs24x7 && shouldReconnectRef && reconnectAttemptsRef < maxReconnectAttempts) {
					reconnectAttemptsRef++;
					console.log(
						`[AudioRecordingStore] WebSocket 连接断开，${reconnectDelayMs / 1000}秒后尝试重连 (${reconnectAttemptsRef}/${maxReconnectAttempts})`
					);

					// 重要：自动重连期间保持 isRecording = true，避免 UI 闪烁
					// 不设置 isRecording = false，让 UI 继续显示"录音中"状态

					// 清理资源但保留回调（用于重连）
					cleanupRecordingResources(undefined, true);

					reconnectTimeoutRef = setTimeout(async () => {
						if (currentOnTranscription && shouldReconnectRef) {
							console.log("[AudioRecordingStore] 尝试重新连接 WebSocket...");
							// 设置内部重连标志，绕过 startRecording 中的 isRecording 检查
							isReconnectingInternally = true;
							try {
								// 使用保存的回调重新启动录音
								await get().startRecording(
									currentOnTranscription,
									currentOnRealtimeNlp || undefined,
									currentOnError || undefined,
									currentIs24x7
								);
							} catch (error) {
								console.error("[AudioRecordingStore] 重连失败:", error);
								// 重连失败，才将状态设为停止
								set({
									isRecording: false,
									recordingStartedAt: null,
									recordingStartedDate: null,
									lastFinalEndMs: null,
								});
								if (currentOnError) {
									currentOnError(error as Error);
								}
							} finally {
								isReconnectingInternally = false;
							}
						}
					}, reconnectDelayMs);
					return;
				}

					// 超过最大重连次数或非 7×24 模式：彻底停止
					cleanupRecordingResources();
					set({
						isRecording: false,
						recordingStartedAt: null,
						recordingStartedDate: null,
						lastFinalEndMs: null,
				});

				// 异常关闭提供详细错误信息
				let errorMessage = "WebSocket连接异常关闭";
				switch (event.code) {
					case 1006:
						errorMessage =
							"WebSocket连接异常断开，可能是网络问题或服务器未响应。请检查：\n1. 后端服务是否正常运行\n2. 网络连接是否正常\n3. 防火墙或代理设置是否正确";
						break;
					case 1000:
						return;
					case 1001:
						errorMessage = "服务器主动断开连接（端点离开）";
						break;
					case 1002:
						errorMessage = "协议错误导致连接关闭";
						break;
					case 1003:
						errorMessage = "不支持的数据类型导致连接关闭";
						break;
					case 1007:
						errorMessage = "数据格式错误导致连接关闭";
						break;
					case 1008:
						errorMessage = "策略违规导致连接关闭";
						break;
					case 1009:
						errorMessage = "消息过大导致连接关闭";
						break;
					case 1010:
						errorMessage = "扩展协商失败导致连接关闭";
						break;
					case 1011:
						errorMessage = "服务器内部错误导致连接关闭";
						break;
					case 1012:
						errorMessage = "服务重启导致连接关闭";
						break;
					case 1013:
						errorMessage = "服务过载导致连接关闭";
						break;
					default:
						errorMessage = `WebSocket连接异常关闭: ${event.reason || `错误代码 ${event.code}`}`;
				}

				console.error("[AudioRecordingStore] WebSocket closed abnormally:", {
					code: event.code,
					reason: event.reason,
					wasClean: event.wasClean,
				});

				if (currentOnError) {
					currentOnError(new Error(errorMessage));
				}
			};

			wsRef = ws;
			} catch (error) {
				console.error("Failed to start recording:", error);
				cleanupRecordingResources();
				set({
					isRecording: false,
					recordingStartedAt: null,
					recordingStartedDate: null,
					lastFinalEndMs: null,
				});
				if (onError) {
					onError(error as Error);
				}
			}
		},

	stopRecording: (segmentTimestamps) => {
		// 停止自动重连
		shouldReconnectRef = false;
		if (reconnectTimeoutRef) {
			clearTimeout(reconnectTimeoutRef);
			reconnectTimeoutRef = null;
		}
		reconnectAttemptsRef = 0;
		currentIs24x7 = false;

		// 清理录音资源
		cleanupRecordingResources(segmentTimestamps);
		set({
			isRecording: false,
			recordingStartedAt: null,
			recordingStartedDate: null,
			lastFinalEndMs: null,
		});
	},

	resetLastFinalEnd: () => {
		set({ lastFinalEndMs: null });
	},

	updateLastFinalEnd: (ms) => {
		set({ lastFinalEndMs: ms });
	},

	// ===== 转录数据更新方法 =====

	appendTranscriptionText: (text) => {
		set((state) => {
			const prev = state.transcriptionText;
			const needsGap = prev && !prev.endsWith("\n");
			return {
				transcriptionText: `${prev}${needsGap ? "\n" : ""}${text}\n`,
			};
		});
	},

	setPartialText: (text) => {
		set({ partialText: text });
	},

	appendSegmentData: (data) => {
		set((state) => ({
			segmentTimesSec: [...state.segmentTimesSec, data.timeSec],
			segmentTimeLabels: [...state.segmentTimeLabels, data.timeLabel],
			segmentRecordingIds: [...state.segmentRecordingIds, data.recordingId],
			segmentOffsetsSec: [...state.segmentOffsetsSec, data.offsetSec],
		}));
	},

	setLiveTodos: (todos) => {
		set({ liveTodos: todos });
	},

	clearSessionData: () => {
		set({
			transcriptionText: "",
			partialText: "",
			segmentTimesSec: [],
			segmentTimeLabels: [],
			segmentRecordingIds: [],
			segmentOffsetsSec: [],
			liveTodos: [],
		});
	},
}));

// ========== 辅助 Hooks ==========

/**
 * 获取录音开始后的经过时间（毫秒）
 */
export function getRecordingElapsedMs(): number {
	const { recordingStartedAt } = useAudioRecordingStore.getState();
	if (!recordingStartedAt) return 0;
	return Date.now() - recordingStartedAt;
}

/**
 * 获取段落的开始时间（相对于录音开始）
 * 优先使用 lastFinalEndMs，否则使用录音开始时间
 */
export function getSegmentStartMs(): number {
	const { recordingStartedAt, lastFinalEndMs } = useAudioRecordingStore.getState();
	if (!recordingStartedAt) return 0;
	return lastFinalEndMs ?? recordingStartedAt;
}
