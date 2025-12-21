// 转录片段
export interface TranscriptSegment {
  id: string;
  timestamp: Date;              // 绝对时间
  absoluteStart?: Date;         // 绝对开始时间（用于精确回放）
  absoluteEnd?: Date;           // 绝对结束时间
  segmentId?: string;           // 归属的音频分段ID
  rawText: string;              // 原始识别文本
  interimText?: string;         // 临时识别文本（实时显示）
  optimizedText?: string;       // 优化后文本
  isOptimized: boolean;
  isInterim: boolean;            // 是否为临时结果
  containsSchedule: boolean;
  audioStart: number;           // 相对录音开始时间（ms）
  audioEnd: number;
  audioFileId?: string;         // 后端音频文件ID
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'failed';
}

// 日程项
export interface ScheduleItem {
  id: string;
  sourceSegmentId: string;      // 来源片段ID
  extractedAt: Date;            // 提取时间
  scheduleTime: Date;           // 日程时间
  description: string;          // 日程描述
  status: 'pending' | 'confirmed' | 'cancelled';
}

// 音频片段元数据
export interface AudioSegment {
  id: string;
  startTime: Date;              // 绝对开始时间
  endTime: Date;
  duration: number;             // 时长（ms）
  fileSize: number;             // 文件大小（bytes）
  fileUrl?: string;             // 文件URL
  uploadStatus: 'pending' | 'uploading' | 'uploaded' | 'failed';
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
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
  viewStartTime: Date;      // 视图开始时间
  viewDuration: number;     // 视图时长（毫秒，默认1小时）
  zoomLevel: number;         // 缩放级别 (1=1小时, 2=6小时, 3=24小时)
  currentTime: Date;         // 当前时间
}

// 进程状态
export interface ProcessStatus {
  recording: 'idle' | 'running' | 'error';
  recognition: 'idle' | 'running' | 'error';
  optimization: 'idle' | 'processing' | 'error';
  scheduleExtraction: 'idle' | 'processing' | 'error';
  persistence: 'idle' | 'uploading' | 'error';
}

