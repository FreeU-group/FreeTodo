// 转录片段
export interface TranscriptSegment {
	id: string;
	timestamp: Date; // 绝对时间
	absoluteStart?: Date; // 绝对开始时间（用于精确回放）
	absoluteEnd?: Date; // 绝对结束时间
	segmentId?: string; // 归属的音频分段ID
	rawText: string; // 原始识别文本
	interimText?: string; // 临时识别文本（实时显示）
	optimizedText?: string; // 优化后文本
	speaker?: string; // 说话人（可选）
	isOptimized: boolean;
	isInterim: boolean; // 是否为临时结果
	containsSchedule: boolean;
	containsTodo?: boolean; // ⚡ 是否包含待办事项
	audioStart: number; // 相对录音开始时间（ms）
	audioEnd: number;
	audioFileId?: string; // 后端音频文件ID
	uploadStatus: "pending" | "uploading" | "uploaded" | "failed";

	// ⚡ 时间索引和双向映射（10分钟固定分段架构）
	segmentIndex?: number; // 关联的存储轨段索引（0, 1, 2...）
	relativeOffset?: number; // 在存储轨段中的偏移（ms，相对于段开始时间）
	unixStartTime?: number; // Unix时间戳（毫秒精度）
	unixEndTime?: number; // Unix时间戳（毫秒精度）
}

// 日程项
export interface ScheduleItem {
	id: string;
	sourceSegmentId: string; // 来源片段ID
	extractedAt: Date; // 提取时间
	scheduleTime: Date; // 日程时间
	description: string; // 日程描述
	status: "pending" | "confirmed" | "cancelled";
	sourceText?: string; // 来源文本片段（用于高亮）
	textStartIndex?: number; // 文本开始位置（在原文本中的索引）
	textEndIndex?: number; // 文本结束位置（在原文本中的索引）
}

// 音频片段元数据
export interface AudioSegment {
	id: string;
	startTime: Date; // 绝对开始时间
	endTime: Date;
	duration: number; // 时长（ms）
	fileSize: number; // 文件大小（bytes）
	fileUrl?: string; // 文件URL
	audioSource: "microphone"; // 音频来源（仅支持麦克风）
	uploadStatus: "pending" | "uploading" | "uploaded" | "failed";
	title?: string; // 音频标题（如"xx会议"）

	// ⚡ 时间索引（10分钟固定分段架构）
	segmentIndex?: number; // 段索引（0, 1, 2...），每10分钟一个
	unixStartTime?: number; // Unix时间戳（毫秒精度）
	unixEndTime?: number; // Unix时间戳（毫秒精度）
}

export interface ChatMessage {
	id: string;
	role: "user" | "model";
	text: string;
	timestamp: Date;
}

export interface AudioContextState {
	isRecording: boolean;
	analyser: AnalyserNode | null;
	audioContext: AudioContext | null;
}

// 时间轴状态
export interface TimelineState {
	viewStartTime: Date; // 视图开始时间
	viewDuration: number; // 视图时长（毫秒，默认1小时）
	zoomLevel: number; // 缩放级别 (1=1小时, 2=6小时, 3=24小时)
	currentTime: Date; // 当前时间
}

// 进程状态
export interface ProcessStatus {
	recording: "idle" | "running" | "paused" | "error";
	recognition: "idle" | "running" | "error";
	optimization: "idle" | "processing" | "error";
	scheduleExtraction: "idle" | "processing" | "error";
	todoExtraction: "idle" | "processing" | "error";
	persistence: "idle" | "uploading" | "error";
}
