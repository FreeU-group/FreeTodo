import type { ScheduleItem, TranscriptSegment } from "../types";

const API_BASE_URL =
	typeof window !== "undefined"
		? process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api"
		: "http://localhost:8000/api";

/**
 * 数据持久化服务 - 负责数据上传和保存
 */
export class PersistenceService {
	private uploadQueue: Array<{
		type: "audio" | "transcript" | "schedule";
		data: any;
	}> = [];
	private isUploading: boolean = false;
	private batchSize: number = 10;
	private uploadDelay: number = 2000;

	// 回调函数
	private onError?: (error: Error) => void;
	private onStatusChange?: (status: "idle" | "uploading" | "error") => void;

	constructor() {
		if (typeof window !== "undefined") {
			setInterval(() => {
				this.processUploadQueue();
			}, this.uploadDelay);
		}
	}

	/**
	 * 设置回调函数
	 */
	setCallbacks(callbacks: {
		onError?: (error: Error) => void;
		onStatusChange?: (status: "idle" | "uploading" | "error") => void;
	}) {
		this.onError = callbacks.onError;
		this.onStatusChange = callbacks.onStatusChange;
	}

	/**
	 * 上传完整音频（用于回放）
	 */
	async uploadFullAudio(
		blob: Blob,
		metadata: {
			startTime: Date;
			endTime: Date;
			recordingId: string;
			title?: string;
			isFullAudio?: boolean;
		},
	): Promise<string | null> {
		try {
			console.log(
				`[PersistenceService] 📤 开始上传完整音频: recordingId=${metadata.recordingId}, 大小=${blob.size} bytes`,
			);

			const formData = new FormData();
			formData.append("file", blob, `${metadata.recordingId}.webm`);
			formData.append("startTime", metadata.startTime.toISOString());
			formData.append("endTime", metadata.endTime.toISOString());
			formData.append("segmentId", metadata.recordingId);
			if (metadata.title) {
				formData.append("title", metadata.title);
			}
			formData.append("isFullAudio", "true");
			if (metadata.isFullAudio !== undefined) {
				formData.append("isFullAudio", metadata.isFullAudio.toString());
			}

			const response = await fetch(`${API_BASE_URL}/audio/upload`, {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Upload failed: ${response.statusText} - ${errorText}`);
			}

			const result = await response.json();
			console.log(`[PersistenceService] ✅ 完整音频上传成功:`, {
				fileId: result.id,
				recordingId: metadata.recordingId,
				filename: result.filename,
				file_path: result.file_path,
				file_size: result.file_size,
				attachment_id: result.attachment_id,
				audio_recording_id: result.audio_recording_id,
			});
			return result.id || null;
		} catch (error) {
			console.error("[PersistenceService] ❌ 完整音频上传失败:", error);

			if (this.onError) {
				const err =
					error instanceof Error
						? error
						: new Error("Full audio upload failed");
				this.onError(err);
			}

			return null;
		}
	}

	/**
	 * 上传音频片段（10秒分段，用于转录）
	 */
	async uploadAudio(
		blob: Blob,
		metadata: {
			startTime: Date;
			endTime: Date;
			segmentId: string;
			isSegmentAudio?: boolean;
		},
	): Promise<string | null> {
		try {
			console.log(
				`[PersistenceService] 📤 开始上传音频: segmentId=${metadata.segmentId}, 大小=${blob.size} bytes, 保存到后端: ${API_BASE_URL}/audio/upload`,
			);

			const formData = new FormData();
			formData.append("file", blob, `${metadata.segmentId}.webm`);
			formData.append("startTime", metadata.startTime.toISOString());
			formData.append("endTime", metadata.endTime.toISOString());
			formData.append("segmentId", metadata.segmentId);
			formData.append("isFullAudio", "false");
			formData.append(
				"isSegmentAudio",
				metadata.isSegmentAudio !== undefined
					? metadata.isSegmentAudio.toString()
					: "true",
			);

			const response = await fetch(`${API_BASE_URL}/audio/upload`, {
				method: "POST",
				body: formData,
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`Upload failed: ${response.statusText} - ${errorText}`);
			}

			const result = await response.json();
			console.log(`[PersistenceService] ✅ 音频上传成功:`, {
				fileId: result.id,
				segmentId: metadata.segmentId,
				filename: result.filename,
				file_path: result.file_path, // 本地文件路径，例如：E:\freeu\LifeTrace\lifetrace\data\audio\segment_xxx_xxx.webm
				file_size: result.file_size,
				attachment_id: result.attachment_id,
				audio_recording_id: result.audio_recording_id,
			});
			return result.id || null;
		} catch (error) {
			console.error("[PersistenceService] ❌ 音频上传失败:", error);

			this.uploadQueue.push({
				type: "audio",
				data: { blob, metadata, retries: 0 },
			});

			if (this.onError) {
				const err =
					error instanceof Error ? error : new Error("Audio upload failed");
				this.onError(err);
			}

			return null;
		}
	}

	/**
	 * 批量保存转录文本
	 */
	async saveTranscripts(segments: TranscriptSegment[]): Promise<void> {
		if (segments.length === 0) return;

		try {
			const validSegments = segments.filter((segment) => {
				if (segment.isInterim) return false;
				if (!segment.rawText || segment.rawText.trim().length === 0)
					return false;
				if (
					typeof segment.audioStart !== "number" ||
					typeof segment.audioEnd !== "number"
				)
					return false;
				if (!isFinite(segment.audioStart) || !isFinite(segment.audioEnd))
					return false;

				const audioStart = Math.round(segment.audioStart);
				const audioEnd = Math.round(segment.audioEnd);
				if (audioStart < 0 || audioEnd <= audioStart) return false;
				if (!segment.timestamp || !(segment.timestamp instanceof Date))
					return false;

				return true;
			});

			if (validSegments.length === 0) {
				return;
			}

			const payload = validSegments
				.map((segment) => {
					const audioStart = Math.round(segment.audioStart);
					const audioEnd = Math.round(segment.audioEnd);

					if (audioStart < 0 || audioEnd <= audioStart) {
						return null;
					}

					return {
						id: segment.id,
						timestamp: segment.timestamp.toISOString(),
						rawText: segment.rawText || "",
						optimizedText: segment.optimizedText || null,
						audioStart: audioStart,
						audioEnd: audioEnd,
						audioFileId: segment.audioFileId || segment.segmentId || null, // 优先使用audioFileId，如果没有则使用segmentId
					};
				})
				.filter((item): item is NonNullable<typeof item> => item !== null);

			if (payload.length === 0) {
				return;
			}

			const response = await fetch(`${API_BASE_URL}/transcripts/batch`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ transcripts: payload }),
			});

			if (!response.ok) {
				throw new Error(`Save transcripts failed: ${response.statusText}`);
			}

			const result = await response.json();
			console.log(
				`[PersistenceService] Saved ${result.saved || segments.length} transcripts`,
			);
		} catch (error) {
			console.error("[PersistenceService] Save transcripts failed:", error);

			segments.forEach((segment) => {
				this.uploadQueue.push({
					type: "transcript",
					data: { segment, retries: 0 },
				});
			});

			if (this.onError) {
				const err =
					error instanceof Error ? error : new Error("Save transcripts failed");
				this.onError(err);
			}
		}
	}

	/**
	 * 保存日程
	 */
	async saveSchedules(schedules: ScheduleItem[]): Promise<void> {
		if (schedules.length === 0) return;

		try {
			const payload = schedules.map((schedule) => ({
				id: schedule.id,
				sourceSegmentId: schedule.sourceSegmentId,
				scheduleTime: schedule.scheduleTime.toISOString(),
				description: schedule.description,
				status: schedule.status,
				extractedAt: schedule.extractedAt.toISOString(),
			}));

			const response = await fetch(`${API_BASE_URL}/schedules`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ schedules: payload }),
			});

			if (!response.ok) {
				throw new Error(`Save schedules failed: ${response.statusText}`);
			}

			console.log(`[PersistenceService] Saved ${schedules.length} schedules`);
		} catch (error) {
			console.error("[PersistenceService] Save schedules failed:", error);

			schedules.forEach((schedule) => {
				this.uploadQueue.push({
					type: "schedule",
					data: { schedule, retries: 0 },
				});
			});

			if (this.onError) {
				const err =
					error instanceof Error ? error : new Error("Save schedules failed");
				this.onError(err);
			}
		}
	}

	/**
	 * 查询历史转录
	 * @param startTime 开始时间（可选）
	 * @param endTime 结束时间（可选）
	 * @param audioFileId 音频文件ID（可选，优先级更高）
	 */
	async queryTranscripts(
		startTime?: Date,
		endTime?: Date,
		audioFileId?: string,
	): Promise<TranscriptSegment[]> {
		try {
			const params = new URLSearchParams();
			if (audioFileId) {
				params.append("audioFileId", audioFileId);
			} else if (startTime && endTime) {
				params.append("startTime", startTime.toISOString());
				params.append("endTime", endTime.toISOString());
			}

			const response = await fetch(`${API_BASE_URL}/transcripts?${params}`);

			if (!response.ok) {
				throw new Error(`Query transcripts failed: ${response.statusText}`);
			}

			const data = await response.json();

			return data.transcripts.map((t: any) => ({
				id: t.id,
				timestamp: new Date(t.timestamp),
				rawText: t.rawText,
				optimizedText: t.optimizedText,
				isOptimized: !!t.optimizedText,
				isInterim: false, // 导入的转录都是最终结果
				containsSchedule: t.containsSchedule || false,
				containsTodo: t.containsTodo || false, // 添加待办标记
				audioStart: t.audioStart || 0,
				audioEnd: t.audioEnd || (t.audioStart || 0) + 5000,
				audioFileId: t.audioFileId || t.segmentId, // 优先使用audioFileId，如果没有则使用segmentId
				segmentId: t.segmentId || t.audioFileId, // 添加segmentId支持
				absoluteStart: t.absoluteStart ? new Date(t.absoluteStart) : undefined, // 添加绝对时间支持
				absoluteEnd: t.absoluteEnd ? new Date(t.absoluteEnd) : undefined,
				uploadStatus: "uploaded" as const,
			}));
		} catch (error) {
			// 网络连接错误（后端未运行）是预期的，只记录警告，不触发错误回调
			if (
				error instanceof TypeError &&
				error.message.includes("Failed to fetch")
			) {
				console.warn(
					"[PersistenceService] ⚠️ 无法连接到后端服务，请确保后端服务正在运行 (http://localhost:8000)",
				);
				return [];
			}
			// 其他错误才记录和触发回调
			console.error("[PersistenceService] Query transcripts failed:", error);
			if (this.onError) {
				const err =
					error instanceof Error
						? error
						: new Error("Query transcripts failed");
				this.onError(err);
			}
			return [];
		}
	}

	/**
	 * 查询日程
	 * @param startTime 开始时间（可选）
	 * @param endTime 结束时间（可选）
	 * @param audioFileId 音频文件ID（可选，优先级更高）
	 */
	async querySchedules(
		startTime?: Date,
		endTime?: Date,
		audioFileId?: string,
	): Promise<ScheduleItem[]> {
		try {
			const params = new URLSearchParams();
			if (audioFileId) {
				params.append("audioFileId", audioFileId);
			} else if (startTime && endTime) {
				params.append("startTime", startTime.toISOString());
				params.append("endTime", endTime.toISOString());
			}

			const response = await fetch(`${API_BASE_URL}/schedules?${params}`);

			if (!response.ok) {
				throw new Error(`Query schedules failed: ${response.statusText}`);
			}

			const data = await response.json();

			return data.schedules.map((s: any) => ({
				id: s.id,
				sourceSegmentId: s.sourceSegmentId,
				extractedAt: new Date(s.extractedAt),
				scheduleTime: new Date(s.scheduleTime),
				description: s.description,
				status: s.status as "pending" | "confirmed" | "cancelled",
			}));
		} catch (error) {
			// 网络连接错误（后端未运行）是预期的，只记录警告，不触发错误回调
			if (
				error instanceof TypeError &&
				error.message.includes("Failed to fetch")
			) {
				console.warn(
					"[PersistenceService] ⚠️ 无法连接到后端服务，请确保后端服务正在运行 (http://localhost:8000)",
				);
				return [];
			}
			// 其他错误才记录和触发回调
			console.error("[PersistenceService] Query schedules failed:", error);
			if (this.onError) {
				const err =
					error instanceof Error ? error : new Error("Query schedules failed");
				this.onError(err);
			}
			return [];
		}
	}

	/**
	 * 查询音频录音记录
	 */
	async queryAudioRecordings(
		startTime: Date,
		endTime: Date,
	): Promise<
		Array<{
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
		}>
	> {
		try {
			const params = new URLSearchParams({
				startTime: startTime.toISOString(),
				endTime: endTime.toISOString(),
			});

			const response = await fetch(`${API_BASE_URL}/audio?${params}`);

			if (!response.ok) {
				throw new Error(
					`Query audio recordings failed: ${response.statusText}`,
				);
			}

			const data = await response.json();
			return data.recordings || [];
		} catch (error) {
			// 网络连接错误（后端未运行）是预期的，只记录警告，不触发错误回调
			if (
				error instanceof TypeError &&
				error.message.includes("Failed to fetch")
			) {
				console.warn(
					"[PersistenceService] ⚠️ 无法连接到后端服务，请确保后端服务正在运行 (http://localhost:8000)",
				);
				return [];
			}
			// 其他错误才记录和触发回调
			console.error(
				"[PersistenceService] Query audio recordings failed:",
				error,
			);
			if (this.onError) {
				const err =
					error instanceof Error
						? error
						: new Error("Query audio recordings failed");
				this.onError(err);
			}
			return [];
		}
	}

	/**
	 * 删除音频文件
	 */
	async deleteAudio(audioId: string): Promise<boolean> {
		try {
			const response = await fetch(`${API_BASE_URL}/audio/${audioId}`, {
				method: "DELETE",
			});

			if (!response.ok) {
				throw new Error(`Delete audio failed: ${response.statusText}`);
			}

			console.log("[PersistenceService] ✅ 音频删除成功:", audioId);
			return true;
		} catch (error) {
			console.error("[PersistenceService] ❌ 删除音频失败:", error);
			if (this.onError) {
				const err =
					error instanceof Error ? error : new Error("Delete audio failed");
				this.onError(err);
			}
			return false;
		}
	}

	/**
	 * 获取音频文件URL
	 */
	async getAudioUrl(audioFileId: string): Promise<string | null> {
		try {
			console.log(
				"[PersistenceService] 获取音频URL，audioFileId:",
				audioFileId,
			);
			const response = await fetch(`${API_BASE_URL}/audio/${audioFileId}`);

			if (!response.ok) {
				console.error(
					"[PersistenceService] Get audio URL failed:",
					response.status,
					response.statusText,
				);
				throw new Error(`Get audio URL failed: ${response.statusText}`);
			}

			const data = await response.json();
			console.log("[PersistenceService] getAudioUrl返回数据:", data);

			if (data.url) {
				if (data.url.startsWith("http://") || data.url.startsWith("https://")) {
					console.log("[PersistenceService] 返回完整URL:", data.url);
					return data.url;
				}

				// 处理相对路径
				const baseUrl = API_BASE_URL.replace(/\/api$/, "");
				const urlPath = data.url.startsWith("/") ? data.url : `/${data.url}`;
				const fullUrl = `${baseUrl}${urlPath}`;

				try {
					new URL(fullUrl);
					console.log("[PersistenceService] 返回规范化URL:", fullUrl);
					return fullUrl;
				} catch (urlError) {
					console.error(
						"[PersistenceService] Invalid URL format:",
						fullUrl,
						urlError,
					);
					return null;
				}
			}
			console.warn("[PersistenceService] getAudioUrl返回数据中没有url字段");
			return null;
		} catch (error) {
			console.error("[PersistenceService] Get audio URL failed:", error);
			return null;
		}
	}

	/**
	 * 处理上传队列
	 */
	private async processUploadQueue(): Promise<void> {
		if (this.isUploading || this.uploadQueue.length === 0) {
			return;
		}

		this.isUploading = true;

		if (this.onStatusChange) {
			this.onStatusChange("uploading");
		}

		try {
			const audioItems = this.uploadQueue.filter(
				(item) => item.type === "audio",
			);
			const transcriptItems = this.uploadQueue.filter(
				(item) => item.type === "transcript",
			);
			const scheduleItems = this.uploadQueue.filter(
				(item) => item.type === "schedule",
			);

			// 处理音频上传（逐个处理）
			for (const item of audioItems.slice(0, 1)) {
				const { blob, metadata, retries } = item.data;
				if (retries < 3) {
					const id = await this.uploadAudio(blob, metadata);
					if (id) {
						this.uploadQueue = this.uploadQueue.filter((i) => i !== item);
					} else {
						item.data.retries = (retries || 0) + 1;
					}
				} else {
					this.uploadQueue = this.uploadQueue.filter((i) => i !== item);
				}
			}

			// 批量处理转录文本
			if (transcriptItems.length > 0) {
				const segments = transcriptItems
					.slice(0, this.batchSize)
					.map((item) => item.data.segment as TranscriptSegment);

				await this.saveTranscripts(segments);
				this.uploadQueue = this.uploadQueue.filter(
					(item) => !transcriptItems.includes(item),
				);
			}

			// 批量处理日程
			if (scheduleItems.length > 0) {
				const schedules = scheduleItems
					.slice(0, this.batchSize)
					.map((item) => item.data.schedule as ScheduleItem);

				await this.saveSchedules(schedules);
				this.uploadQueue = this.uploadQueue.filter(
					(item) => !scheduleItems.includes(item),
				);
			}
		} catch (error) {
			console.error("[PersistenceService] Process upload queue failed:", error);
			if (this.onError) {
				const err =
					error instanceof Error
						? error
						: new Error("Process upload queue failed");
				this.onError(err);
			}
		} finally {
			this.isUploading = false;
			if (this.uploadQueue.length === 0 && this.onStatusChange) {
				this.onStatusChange("idle");
			}
		}
	}

	/**
	 * 获取上传队列状态
	 */
	getUploadQueueStatus(): { queueLength: number; isUploading: boolean } {
		return {
			queueLength: this.uploadQueue.length,
			isUploading: this.isUploading,
		};
	}
}
