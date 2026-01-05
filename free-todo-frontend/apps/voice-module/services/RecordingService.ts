/**
 * 录音服务 - 负责持续录音和音频分段
 * 支持两种录音模式：
 * 1. 每10秒分段保存（用于转录）
 * 2. 完整音频保存（用于回放）
 */
export class RecordingService {
	// 分段录音（每10秒，用于转录）
	private segmentRecorder: MediaRecorder | null = null;
	private segmentChunks: Blob[] = [];
	private segmentStartTime: number = 0;
	private segmentId: string | null = null;
	private segmentTimer: number | null = null;

	// 完整音频录音（用于回放）
	private fullRecorder: MediaRecorder | null = null;
	private fullChunks: Blob[] = [];
	private fullRecordingId: string | null = null;

	private stream: MediaStream | null = null;
	private audioContext: AudioContext | null = null;
	private analyser: AnalyserNode | null = null;

	private isRecording: boolean = false;
	private isPaused: boolean = false;
	private recordingStartTime: Date | null = null;

	private readonly SEGMENT_DURATION = 10 * 1000; // 10秒分段

	// 回调函数
	private onSegmentReady?: (
		blob: Blob,
		startTime: Date,
		endTime: Date,
		segmentId: string,
	) => void;
	private onFullAudioReady?: (
		blob: Blob,
		startTime: Date,
		endTime: Date,
		recordingId: string,
	) => void;
	private onError?: (error: Error) => void;
	private onAudioData?: (analyser: AnalyserNode) => void;

	/**
	 * 设置回调函数
	 */
	setCallbacks(callbacks: {
		onSegmentReady?: (
			blob: Blob,
			startTime: Date,
			endTime: Date,
			segmentId: string,
		) => void;
		onFullAudioReady?: (
			blob: Blob,
			startTime: Date,
			endTime: Date,
			recordingId: string,
		) => void;
		onError?: (error: Error) => void;
		onAudioData?: (analyser: AnalyserNode) => void;
	}) {
		console.log("[RecordingService] 🔧 setCallbacks被调用:", {
			hasOnSegmentReady: typeof callbacks.onSegmentReady === "function",
			hasOnFullAudioReady: typeof callbacks.onFullAudioReady === "function",
			hasOnError: typeof callbacks.onError === "function",
			hasOnAudioData: typeof callbacks.onAudioData === "function",
		});
		this.onSegmentReady = callbacks.onSegmentReady;
		this.onFullAudioReady = callbacks.onFullAudioReady;
		this.onError = callbacks.onError;
		this.onAudioData = callbacks.onAudioData;
		console.log("[RecordingService] ✅ 回调已设置");
	}

	/**
	 * 开始录音
	 * 使用系统默认麦克风（与 Web Speech API 保持一致）
	 */
	async start(): Promise<void> {
		if (this.isRecording) {
			console.warn("[RecordingService] Recording already started");
			return;
		}

		try {
			// 获取麦克风权限（使用系统默认设备）
			this.stream = await navigator.mediaDevices.getUserMedia({
				audio: {
					echoCancellation: true,
					noiseSuppression: true,
					autoGainControl: true,
				},
			});

			// 创建 AudioContext 用于波形分析
			const AudioContextClass =
				window.AudioContext || (window as any).webkitAudioContext;
			this.audioContext = new AudioContextClass();
			this.analyser = this.audioContext.createAnalyser();
			this.analyser.fftSize = 512;

			const source = this.audioContext.createMediaStreamSource(this.stream);
			source.connect(this.analyser);

			if (this.onAudioData) {
				this.onAudioData(this.analyser);
			}

			const mimeType = this.getSupportedMimeType();

			// 创建分段录音器（每10秒，用于转录）
			this.segmentRecorder = new MediaRecorder(this.stream, { mimeType });
			this.segmentRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					this.segmentChunks.push(event.data);
				}
			};
			this.segmentRecorder.onstop = () => {
				this.finalizeSegment();
				// 如果还在录音，启动新的分段
				if (this.isRecording && !this.isPaused) {
					this.startNewSegment();
				}
			};
			this.segmentRecorder.onerror = (event) => {
				console.error("[RecordingService] ❌ 分段录音器错误:", event);
				if (this.onError) {
					this.onError(new Error("Segment recorder error"));
				}
			};

			// 创建完整音频录音器（用于回放）
			this.fullRecorder = new MediaRecorder(this.stream, { mimeType });
			this.fullRecorder.ondataavailable = (event) => {
				if (event.data.size > 0) {
					this.fullChunks.push(event.data);
				}
			};
			this.fullRecorder.onerror = (event) => {
				console.error("[RecordingService] ❌ 完整音频录音器错误:", event);
				if (this.onError) {
					this.onError(new Error("Full recorder error"));
				}
			};

			// 开始录音
			this.recordingStartTime = new Date();
			this.fullRecordingId = this.generateRecordingId();
			this.fullChunks = [];

			// 启动完整音频录音（持续录音，不自动停止）
			this.fullRecorder.start(1000); // 每1秒收集一次数据

			// 启动第一个分段
			this.startNewSegment();

			this.isRecording = true;

			console.log("[RecordingService] ✅ 录音已开始", {
				startTime: this.recordingStartTime,
				fullRecordingId: this.fullRecordingId,
				hasOnSegmentReady: !!this.onSegmentReady,
				hasOnFullAudioReady: !!this.onFullAudioReady,
			});
		} catch (error) {
			const err =
				error instanceof Error ? error : new Error("Failed to start recording");
			console.error("[RecordingService] ❌ 启动录音失败:", err);
			if (this.onError) {
				this.onError(err);
			}
			throw err;
		}
	}

	/**
	 * 暂停录音（保留音频流，暂停MediaRecorder）
	 */
	pause(): void {
		if (!this.isRecording || this.isPaused) {
			console.warn("[RecordingService] ⚠️ 无法暂停：录音未开始或已暂停", {
				isRecording: this.isRecording,
				isPaused: this.isPaused,
			});
			return;
		}

		// 暂停分段录音器
		if (this.segmentRecorder && this.segmentRecorder.state === "recording") {
			this.segmentRecorder.pause();
		}

		// 暂停完整音频录音器
		if (this.fullRecorder && this.fullRecorder.state === "recording") {
			this.fullRecorder.pause();
		}

		// 清除分段定时器
		if (this.segmentTimer) {
			clearTimeout(this.segmentTimer);
			this.segmentTimer = null;
		}

		this.isPaused = true;
		console.log("[RecordingService] ⏸️ 录音已暂停");
	}

	/**
	 * 恢复录音
	 */
	resume(): void {
		if (!this.isRecording || !this.isPaused) {
			console.warn("[RecordingService] ⚠️ 无法恢复：录音未开始或未暂停", {
				isRecording: this.isRecording,
				isPaused: this.isPaused,
			});
			return;
		}

		// 恢复完整音频录音器
		if (this.fullRecorder && this.fullRecorder.state === "paused") {
			this.fullRecorder.resume();
		}

		// 恢复分段录音器或启动新分段
		if (this.segmentRecorder) {
			if (this.segmentRecorder.state === "paused") {
				this.segmentRecorder.resume();
			} else {
				// 如果分段已停止，启动新分段
				this.startNewSegment();
			}
		}

		this.isPaused = false;
		console.log("[RecordingService] ▶️ 录音已恢复");
	}

	/**
	 * 停止录音
	 * @returns 完整音频的Blob（如果已准备好）
	 */
	async stop(): Promise<Blob | null> {
		if (!this.isRecording) {
			return null;
		}

		this.isRecording = false;
		this.isPaused = false;

		// 清除分段定时器
		if (this.segmentTimer) {
			clearTimeout(this.segmentTimer);
			this.segmentTimer = null;
		}

		// 停止分段录音器（会触发finalizeSegment）
		if (this.segmentRecorder && this.segmentRecorder.state !== "inactive") {
			this.segmentRecorder.stop();
		}

		// 停止完整音频录音器
		let fullAudioBlob: Blob | null = null;
		if (this.fullRecorder && this.fullRecorder.state !== "inactive") {
			this.fullRecorder.stop();

			// 等待数据收集完成
			await new Promise((resolve) => setTimeout(resolve, 500));

			// 生成完整音频Blob
			if (
				this.fullChunks.length > 0 &&
				this.recordingStartTime &&
				this.fullRecordingId
			) {
				fullAudioBlob = new Blob(this.fullChunks, {
					type: this.getSupportedMimeType() || "audio/webm",
				});
				console.log("[RecordingService] ✅ 完整音频已准备好", {
					recordingId: this.fullRecordingId,
					blobSize: fullAudioBlob.size,
					duration: Date.now() - this.recordingStartTime.getTime(),
				});
			}
		}

		// 停止音频流
		if (this.stream) {
			for (const track of this.stream.getTracks()) {
				track.stop();
			}
			this.stream = null;
		}

		// 关闭 AudioContext
		if (this.audioContext) {
			await this.audioContext.close();
			this.audioContext = null;
			this.analyser = null;
		}

		return fullAudioBlob;
	}

	/**
	 * 获取录音状态
	 */
	getStatus(): {
		isRecording: boolean;
		isPaused: boolean;
		startTime: Date | null;
		hasOnSegmentReady: boolean;
		hasOnFullAudioReady: boolean;
		fullRecordingId: string | null;
	} {
		return {
			isRecording: this.isRecording,
			isPaused: this.isPaused,
			startTime: this.recordingStartTime,
			hasOnSegmentReady: !!this.onSegmentReady,
			hasOnFullAudioReady: !!this.onFullAudioReady,
			fullRecordingId: this.fullRecordingId,
		};
	}

	/**
	 * 获取 AnalyserNode（用于波形显示）
	 */
	getAnalyser(): AnalyserNode | null {
		return this.analyser;
	}

	/**
	 * 获取当前音频流（用于识别服务）
	 */
	getStream(): MediaStream | null {
		return this.stream;
	}

	/**
	 * 启动一个新的10秒分段录音
	 */
	private startNewSegment() {
		if (!this.stream || !this.isRecording || this.isPaused) return;

		// 如果分段录音器还在运行，先停止它
		if (this.segmentRecorder && this.segmentRecorder.state === "recording") {
			this.segmentRecorder.stop();
			return; // finalizeSegment会调用startNewSegment
		}

		this.segmentStartTime = Date.now();
		this.segmentId = this.generateSegmentId();
		this.segmentChunks = [];

		try {
			if (!this.segmentRecorder) {
				const mimeType = this.getSupportedMimeType();
				this.segmentRecorder = new MediaRecorder(this.stream, { mimeType });
				this.segmentRecorder.ondataavailable = (event) => {
					if (event.data.size > 0) {
						this.segmentChunks.push(event.data);
					}
				};
				this.segmentRecorder.onstop = () => {
					this.finalizeSegment();
					if (this.isRecording && !this.isPaused) {
						this.startNewSegment();
					}
				};
			}

			this.segmentRecorder.start(1000); // 每1秒收集一次数据

			// 设置10秒后自动停止当前分段
			this.segmentTimer = window.setTimeout(() => {
				if (
					this.segmentRecorder &&
					this.segmentRecorder.state === "recording"
				) {
					this.segmentRecorder.stop();
				}
			}, this.SEGMENT_DURATION);

			console.log("[RecordingService] ✅ 新分段已启动", {
				segmentId: this.segmentId,
				startTime: new Date(this.segmentStartTime),
			});
		} catch (e) {
			console.error("[RecordingService] ❌ 启动新分段失败:", e);
			if (this.onError) {
				const err =
					e instanceof Error ? e : new Error("Failed to start new segment");
				this.onError(err);
			}
		}
	}

	/**
	 * 最终化当前10秒分段
	 */
	private finalizeSegment(): void {
		// 防止重复调用
		if (this.segmentChunks.length === 0) {
			console.log("[RecordingService] ⚠️ 分段已处理过，跳过重复调用");
			return;
		}

		if (!this.segmentId || !this.recordingStartTime) {
			console.warn("[RecordingService] ⚠️ 无法最终化分段：数据不足", {
				chunksLength: this.segmentChunks.length,
				segmentId: this.segmentId,
				recordingStartTime: this.recordingStartTime,
			});
			this.segmentChunks = [];
			return;
		}

		const blob = new Blob(this.segmentChunks, {
			type: this.getSupportedMimeType() || "audio/webm",
		});
		const startTime = new Date(this.segmentStartTime);
		const endTime = new Date();

		console.log("[RecordingService] ✅ 最终化10秒分段", {
			segmentId: this.segmentId,
			blobSize: blob.size,
			chunksCount: this.segmentChunks.length,
			duration: endTime.getTime() - startTime.getTime(),
		});

		if (blob.size === 0) {
			console.error("[RecordingService] ❌ 警告：分段大小为 0，跳过保存");
			this.segmentChunks = [];
			return;
		}

		if (this.onSegmentReady) {
			try {
				this.onSegmentReady(blob, startTime, endTime, this.segmentId);
				console.log("[RecordingService] ✅ 10秒分段已发送到回调");
			} catch (error) {
				console.error(
					"[RecordingService] ❌ onSegmentReady回调执行失败:",
					error,
				);
			}
		} else {
			console.warn("[RecordingService] ⚠️ onSegmentReady回调未设置");
		}

		// 清空 chunks
		this.segmentChunks = [];
	}

	/**
	 * 获取完整音频（用于回放）
	 */
	getFullAudio(): {
		blob: Blob;
		startTime: Date;
		endTime: Date;
		recordingId: string;
	} | null {
		if (
			!this.recordingStartTime ||
			!this.fullRecordingId ||
			this.fullChunks.length === 0
		) {
			return null;
		}

		const blob = new Blob(this.fullChunks, {
			type: this.getSupportedMimeType() || "audio/webm",
		});
		const endTime = new Date();

		return {
			blob,
			startTime: this.recordingStartTime,
			endTime,
			recordingId: this.fullRecordingId,
		};
	}

	/**
	 * 生成片段ID（10秒分段）
	 */
	private generateSegmentId(): string {
		return `segment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * 生成完整录音ID
	 */
	private generateRecordingId(): string {
		return `recording_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
	}

	/**
	 * 获取支持的 MIME 类型
	 */
	private getSupportedMimeType(): string {
		const types = [
			"audio/webm;codecs=opus",
			"audio/webm",
			"audio/ogg;codecs=opus",
			"audio/ogg",
			"audio/mp4",
		];

		for (const type of types) {
			if (MediaRecorder.isTypeSupported(type)) {
				return type;
			}
		}

		return ""; // 使用浏览器默认
	}
}
