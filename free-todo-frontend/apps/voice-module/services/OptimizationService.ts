import OpenAI from "openai";
import type { TranscriptSegment } from "../types";

const SYSTEM_PROMPT_OPTIMIZER = `
你是一个智能语音转录优化助手，负责优化文本并提取结构化信息。
任务：修正输入文本的语法和标点，使其更通顺，同时提取待办事项和日程安排。

重要原则：
1. 严禁删减内容！必须保留所有原始信息，仅进行润色。
2. 如果输入是不完整的句子，尝试补全标点，不要强行造句。
3. 【关键】主动提取结构化信息：

   a) 日程安排提取：
   - 如果文本中包含任何【时间点、日程安排、会议、时间提醒】（例如"早上7点"、"7:40"、"11:30"、"明天下午三点开会"、"后天去上海"），请务必用 [SCHEDULE: 完整日程内容] 格式将该部分包裹起来。
   - 任何包含时间信息（如"早上7点"、"7:40"、"11:30"、"8点至10"、"明天"、"后天"等）的文本，都应该被标记为日程
   - 即使时间信息不完整（如只有"7点"），只要后面有活动描述，也要标记
   - 标记时要包含完整的时间+活动描述，例如："[SCHEDULE: 早上7点准时起床]" 而不是只标记时间

   b) 待办事项提取：
   - 如果文本中包含待办事项（例如"记得买牛奶"、"明天要完成报告"、"需要整理文档"），请用 [TODO: 任务名称 | deadline: 时间 | priority: 优先级] 格式标记
   - deadline 可以是具体时间（如"明天下午3点"）或相对时间（如"明天"、"下周"）
   - priority 可以是 "high"、"medium"、"low" 或留空（默认 medium）

示例输入1："早上7点准时起床,洗术完毕后记得买牛奶"
示例输出1："[SCHEDULE: 早上7点准时起床],洗术完毕后[TODO: 买牛奶 | deadline: 今天 | priority: medium]"

示例输入2："明天下午三点开会，记得准备报告"
示例输出2："[SCHEDULE: 明天下午3点 开会]，[TODO: 准备报告 | deadline: 明天下午3点前 | priority: high]"

示例输入3："充足能量 7.40分前往突出，需要整理文档"
示例输出3："充足能量 [SCHEDULE: 7:40 前往突出]，[TODO: 整理文档 | deadline: 今天 | priority: medium]"

只输出优化后的文本，不要任何解释。必须严格遵循 [SCHEDULE: ...] 和 [TODO: ...] 格式标记。
`;

/**
 * 文本优化服务 - 负责异步优化转录文本
 */
export class OptimizationService {
	private queue: TranscriptSegment[] = [];
	private isProcessing: boolean = false;
	private batchSize: number = 3;
	private processingDelay: number = 500;
	private maxQueueSize: number = 100;

	private aiClient: OpenAI | null = null;

	// 回调函数
	private onOptimized?: (
		segmentId: string,
		optimizedText: string,
		containsSchedule: boolean,
	) => void;
	private onError?: (segmentId: string, error: Error) => void;
	private onStatusChange?: (status: "idle" | "processing" | "error") => void;

	constructor() {
		this.initializeAIClient();
	}

	/**
	 * 初始化 AI 客户端
	 */
	private initializeAIClient(): void {
		let apiKey = process.env.NEXT_PUBLIC_DEEPSEEK_API_KEY;
		if (!apiKey || apiKey.includes("your_deepseek_api_key")) {
			apiKey = "sk-26d76c61cf2842fcb729e019d587a026";
		}

		if (apiKey) {
			let baseURL: string;
			if (typeof window !== "undefined" && window.location) {
				const origin = window.location.origin;
				baseURL =
					origin && origin !== "null" && origin !== "undefined"
						? `${origin}/api/deepseek`
						: "http://localhost:3000/api/deepseek";
			} else {
				baseURL = "http://localhost:8000/api/deepseek";
			}

			try {
				new URL(baseURL);
			} catch (_urlError) {
				console.error("[OptimizationService] Invalid baseURL:", baseURL);
				baseURL = "http://localhost:3000/api/deepseek";
			}

			this.aiClient = new OpenAI({
				baseURL: baseURL,
				apiKey: "dummy-key",
				dangerouslyAllowBrowser: true,
			});
		} else {
			console.warn(
				"[OptimizationService] Missing NEXT_PUBLIC_DEEPSEEK_API_KEY",
			);
		}
	}

	/**
	 * 设置回调函数
	 */
	setCallbacks(callbacks: {
		onOptimized?: (
			segmentId: string,
			optimizedText: string,
			containsSchedule: boolean,
		) => void;
		onError?: (segmentId: string, error: Error) => void;
		onStatusChange?: (status: "idle" | "processing" | "error") => void;
	}) {
		this.onOptimized = callbacks.onOptimized;
		this.onError = callbacks.onError;
		this.onStatusChange = callbacks.onStatusChange;
	}

	/**
	 * 添加文本到优化队列
	 */
	enqueue(segment: TranscriptSegment): void {
		if (this.queue.length >= this.maxQueueSize) {
			console.warn("[OptimizationService] Queue is full, dropping oldest item");
			this.queue.shift();
		}

		const exists = this.queue.find((s) => s.id === segment.id);
		if (exists) {
			const index = this.queue.indexOf(exists);
			this.queue[index] = segment;
		} else {
			this.queue.push(segment);
		}

		this.processQueue();
	}

	/**
	 * 处理队列
	 */
	private async processQueue(): Promise<void> {
		if (this.isProcessing || this.queue.length === 0) {
			return;
		}

		this.isProcessing = true;

		if (this.onStatusChange) {
			this.onStatusChange("processing");
		}

		try {
			const batch = this.queue.splice(0, this.batchSize);
			const promises = batch.map((segment) => this.optimizeSegment(segment));
			await Promise.allSettled(promises);

			await new Promise((resolve) => setTimeout(resolve, this.processingDelay));

			if (this.queue.length > 0) {
				this.processQueue();
			} else {
				this.isProcessing = false;
				if (this.onStatusChange) {
					this.onStatusChange("idle");
				}
			}
		} catch (error) {
			console.error("[OptimizationService] Error processing queue:", error);
			this.isProcessing = false;
			if (this.onStatusChange) {
				this.onStatusChange("error");
			}
		}
	}

	/**
	 * 优化单个片段
	 */
	private async optimizeSegment(segment: TranscriptSegment): Promise<void> {
		if (!this.aiClient) {
			console.warn(
				"[OptimizationService] AI client not initialized, skipping optimization",
			);
			if (this.onOptimized) {
				this.onOptimized(segment.id, segment.rawText || "", false);
			}
			return;
		}

		if (!segment.rawText || segment.rawText.trim().length === 0) {
			if (this.onOptimized) {
				this.onOptimized(segment.id, segment.rawText || "", false);
			}
			return;
		}

		try {
			const timeoutPromise = new Promise((_, reject) =>
				setTimeout(() => reject(new Error("API timeout")), 15000),
			);

			const apiPromise = this.aiClient.chat.completions.create({
				model: "deepseek-chat",
				messages: [
					{ role: "system", content: SYSTEM_PROMPT_OPTIMIZER },
					{ role: "user", content: segment.rawText },
				],
				temperature: 0.3,
			});

			type ChatCompletionResponse = {
				choices?: Array<{ message?: { content?: string } }>;
			};

			const response = (await Promise.race([
				apiPromise,
				timeoutPromise,
			])) as ChatCompletionResponse;
			const optimizedText =
				response.choices?.[0]?.message?.content?.trim() || segment.rawText;
			const containsSchedule = optimizedText.includes("[SCHEDULE:");

			if (this.onOptimized) {
				this.onOptimized(segment.id, optimizedText, containsSchedule);
			}
		} catch (error) {
			console.error(
				`[OptimizationService] Optimization failed for segment ${segment.id}:`,
				error,
			);

			if (this.onOptimized) {
				this.onOptimized(segment.id, segment.rawText || "", false);
			}

			if (this.onError) {
				const err =
					error instanceof Error ? error : new Error("Optimization failed");
				this.onError(segment.id, err);
			}
		}
	}

	/**
	 * 获取队列状态
	 */
	getQueueStatus(): { queueLength: number; isProcessing: boolean } {
		return {
			queueLength: this.queue.length,
			isProcessing: this.isProcessing,
		};
	}

	/**
	 * 清空队列
	 */
	clearQueue(): void {
		this.queue = [];
		this.isProcessing = false;
		if (this.onStatusChange) {
			this.onStatusChange("idle");
		}
	}
}
