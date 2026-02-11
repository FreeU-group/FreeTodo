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

let wsRef: WebSocket | null = null;
let audioContextRef: AudioContext | null = null;
let processorRef: ScriptProcessorNode | null = null;
let mediaStreamRef: MediaStream | null = null;

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

/**
 * 清理录音资源
 * @param segmentTimestamps 段落时间戳数组
 * @param isReconnecting 是否正在重连（重连时不清理回调）
 */
function cleanupRecordingResources(segmentTimestamps?: number[], isReconnecting = false): void {
	// 停止 WebAudio
	if (processorRef) {
		try {
			processorRef.disconnect();
		} catch {
			// ignore
		}
		processorRef.onaudioprocess = null;
		processorRef = null;
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

			// 如果是重连成功，重置重连计数
			if (reconnectAttemptsRef > 0) {
				reconnectAttemptsRef = 0;
				console.log("[AudioRecordingStore] WebSocket 重连成功");
			}

			// 获取麦克风权限
			console.log("[AudioRecordingStore] 请求麦克风权限...");
			const stream = await navigator.mediaDevices.getUserMedia({
				audio: { noiseSuppression: true },
			});
			console.log("[AudioRecordingStore] ✅ 麦克风权限已获取");
			mediaStreamRef = stream;

			// 保存回调引用
			currentOnTranscription = onTranscription;
			currentOnRealtimeNlp = onRealtimeNlp || null;
			currentOnError = onError || null;

			// 连接到后端 WebSocket
			const apiBaseUrl = getApiBaseUrl();
			const wsUrl = apiBaseUrl.replace("http://", "ws://").replace("https://", "wss://");
			const wsEndpoint = `${wsUrl}/api/audio/transcribe`;
			const ws = new WebSocket(wsEndpoint);
			ws.binaryType = "arraybuffer";

			ws.onopen = () => {
				// 发送初始化消息
				ws.send(JSON.stringify({ is_24x7: is24x7 }));

				// 使用 WebAudio 直接发送 PCM16(16k) 到后端
				type AudioContextCtor = typeof AudioContext & {
					webkitAudioContext?: typeof AudioContext;
				};
				const AudioCtx = (window.AudioContext ||
					(window as unknown as { webkitAudioContext?: typeof AudioContext })
						.webkitAudioContext) as AudioContextCtor;
				const audioContext = new AudioCtx({ sampleRate: 16000 });
				audioContextRef = audioContext;

				const source = audioContext.createMediaStreamSource(stream);
				const processor = audioContext.createScriptProcessor(4096, 1, 1);
				processorRef = processor;

				processor.onaudioprocess = (e) => {
					if (ws.readyState !== WebSocket.OPEN) return;
					const input = e.inputBuffer.getChannelData(0); // Float32 [-1, 1]
					// 转 Int16 little-endian
					const buffer = new ArrayBuffer(input.length * 2);
					const view = new DataView(buffer);
					for (let i = 0; i < input.length; i++) {
						const s = Math.max(-1, Math.min(1, input[i]));
						view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
					}
					ws.send(buffer);
				};

				source.connect(processor);
				processor.connect(audioContext.destination);

				// 记录开始时间并更新状态
				const now = Date.now();
				set({
					isRecording: true,
					recordingStartedAt: now,
					recordingStartedDate: new Date(),
					lastFinalEndMs: null,
				});
			};

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
