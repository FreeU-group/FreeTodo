import type {
	PlanEvent,
	PlanRunInfo,
	PlanRunStatusResponse,
	PlanRunStepInfo,
	PlanSpec,
} from "@/lib/types/plan";

/**
 * 获取流式 API 的基础 URL
 * 流式请求直接调用后端 API，绕过 Next.js 代理，避免 gzip 压缩破坏流式传输
 */
function getStreamApiBaseUrl(): string {
	// 流式请求始终直接调用后端，避免 Next.js 代理导致的缓冲/压缩问题
	return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";
}

// ============================================================================
// 流式 API（Orval 不支持 Server-Sent Events，需要手动实现）
// ============================================================================

export interface SendChatParams {
	message: string; // 发送给 LLM 的完整消息（包含 system prompt + context + user input）
	userInput?: string; // 用户真正输入的内容（用于保存到历史记录）
	context?: string; // 待办上下文（可选）
	systemPrompt?: string; // 系统提示词（可选）
	conversationId?: string;
	useRag?: boolean;
	mode?: string;
	selectedTools?: string[];
	externalTools?: string[];
}

/**
 * 工具调用事件类型（从后端流式响应中解析）
 */
export type ToolCallEventType =
	| "tool_call_start"
	| "tool_call_end"
	| "run_started"
	| "run_completed"
	| "memory_saved";

/**
 * 工具调用事件数据
 */
export interface ToolCallEvent {
	type: ToolCallEventType;
	tool_name?: string;
	tool_args?: Record<string, unknown>;
	result_preview?: string;
	memories?: string[];
	profile_updates?: { field: string; value: string }[];
	more_count?: number;
}

// 工具调用事件标记（与后端保持一致）
const TOOL_EVENT_PREFIX = "\n[TOOL_EVENT:";
const TOOL_EVENT_SUFFIX = "]\n";

// Plan 执行事件标记（与后端保持一致）
const PLAN_EVENT_PREFIX = "\n[PLAN_EVENT:";
const PLAN_EVENT_SUFFIX = "]\n";

/**
 * 解析流式响应中的工具调用事件
 * 返回 [解析出的事件列表, 剩余的纯内容]
 */
function parseToolEvents(chunk: string): [ToolCallEvent[], string] {
	const events: ToolCallEvent[] = [];
	let content = chunk;

	// 循环查找并解析所有工具调用事件
	let startIdx = content.indexOf(TOOL_EVENT_PREFIX);
	while (startIdx !== -1) {
		const endIdx = content.indexOf(TOOL_EVENT_SUFFIX, startIdx);
		if (endIdx === -1) {
			// 事件标记不完整，等待更多数据
			break;
		}

		// 提取 JSON 部分
		const jsonStart = startIdx + TOOL_EVENT_PREFIX.length;
		const jsonStr = content.substring(jsonStart, endIdx);

		try {
			const event = JSON.parse(jsonStr) as ToolCallEvent;
			events.push(event);
		} catch (e) {
			console.error("[parseToolEvents] Failed to parse event:", jsonStr, e);
		}

		// 移除已解析的事件标记
		content =
			content.substring(0, startIdx) +
			content.substring(endIdx + TOOL_EVENT_SUFFIX.length);

		// 继续查找下一个事件
		startIdx = content.indexOf(TOOL_EVENT_PREFIX);
	}

	return [events, content];
}

/**
 * 解析流式响应中的 Plan 执行事件
 * 返回 [解析出的事件列表, 剩余的纯内容]
 */
function parsePlanEvents(chunk: string): [PlanEvent[], string] {
	const events: PlanEvent[] = [];
	let content = chunk;

	let startIdx = content.indexOf(PLAN_EVENT_PREFIX);
	while (startIdx !== -1) {
		const endIdx = content.indexOf(PLAN_EVENT_SUFFIX, startIdx);
		if (endIdx === -1) {
			break;
		}

		const jsonStart = startIdx + PLAN_EVENT_PREFIX.length;
		const jsonStr = content.substring(jsonStart, endIdx);
		try {
			const event = JSON.parse(jsonStr) as PlanEvent;
			events.push(event);
		} catch (e) {
			console.error("[parsePlanEvents] Failed to parse event:", jsonStr, e);
		}

		content =
			content.substring(0, startIdx) +
			content.substring(endIdx + PLAN_EVENT_SUFFIX.length);
		startIdx = content.indexOf(PLAN_EVENT_PREFIX);
	}

	return [events, content];
}

/**
 * 发送聊天消息并以流式方式接收回复
 * @param params - 聊天参数
 * @param onChunk - 内容块回调
 * @param onSessionId - 会话 ID 回调
 * @param signal - 取消信号
 * @param locale - 语言设置
 * @param onToolEvent - 工具调用事件回调（可选）
 */
export async function sendChatMessageStream(
	params: SendChatParams,
	onChunk: (chunk: string) => void,
	onSessionId?: (sessionId: string) => void,
	signal?: AbortSignal,
	locale?: string,
	onToolEvent?: (event: ToolCallEvent) => void,
): Promise<void> {
	// 流式请求直接调用后端 API，绕过 Next.js 代理
	const baseUrl = getStreamApiBaseUrl();
	const apiUrl = `${baseUrl}/api/chat/stream`;

	// 调试日志
	console.log("[sendChatMessageStream] baseUrl:", baseUrl);
	console.log("[sendChatMessageStream] apiUrl:", apiUrl);
	console.log("[sendChatMessageStream] params:", params);
	console.log("[sendChatMessageStream] selectedTools:", params.selectedTools);

	let response: Response;
	try {
		const requestBody = {
			message: params.message,
			user_input: params.userInput,
			context: params.context,
			system_prompt: params.systemPrompt,
			conversation_id: params.conversationId,
			use_rag: params.useRag,
			mode: params.mode,
			selected_tools: params.selectedTools,
			external_tools: params.externalTools,
		};
		console.log("[sendChatMessageStream] Request body:", requestBody);

		response = await fetch(apiUrl, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"Accept-Language": locale || "en",
			},
			body: JSON.stringify(requestBody),
			signal,
		});
	} catch (error) {
		// 调试日志
		console.error("[sendChatMessageStream] fetch error:", error);

		// 如果是取消操作，静默返回
		if (
			signal?.aborted ||
			(error instanceof Error && error.name === "AbortError")
		) {
			return;
		}
		throw error;
	}

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	// 从响应头中获取 session_id
	const sessionId = response.headers.get("X-Session-Id");
	if (sessionId && onSessionId) {
		onSessionId(sessionId);
	}

	if (!response.body) {
		throw new Error("ReadableStream is not supported in this environment");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();

	// 用于处理跨 chunk 的不完整事件标记
	let pendingChunk = "";

	try {
		while (true) {
			// 检查是否已取消
			if (signal?.aborted) {
				await reader.cancel();
				break;
			}

			const { done, value } = await reader.read();
			if (done) break;

			if (value) {
				const rawChunk = decoder.decode(value, { stream: true });
				if (rawChunk) {
					// 将待处理的部分与新数据合并
					const fullChunk = pendingChunk + rawChunk;

					// 解析工具调用事件
					const [events, content] = parseToolEvents(fullChunk);

					// 触发工具调用事件回调
					if (onToolEvent) {
						for (const event of events) {
							onToolEvent(event);
						}
					}

					// 检查是否有不完整的事件标记
					const incompleteEventIdx = content.indexOf(TOOL_EVENT_PREFIX);
					if (incompleteEventIdx !== -1) {
						// 有不完整的事件标记，保存到下次处理
						pendingChunk = content.substring(incompleteEventIdx);
						const completeContent = content.substring(0, incompleteEventIdx);
						if (completeContent) {
							onChunk(completeContent);
						}
					} else {
						// 没有不完整的事件标记
						pendingChunk = "";
						if (content) {
							onChunk(content);
						}
					}
				}
			}
		}

		// 处理最后剩余的内容
		if (pendingChunk) {
			onChunk(pendingChunk);
		}
	} catch (error) {
		// 如果是取消操作，不抛出错误
		if (
			signal?.aborted ||
			(error instanceof Error && error.name === "AbortError")
		) {
			await reader.cancel();
			return;
		}
		throw error;
	}
}

/**
 * Plan功能：生成选择题（流式输出）
 */
export async function planQuestionnaireStream(
	todoName: string,
	onChunk: (chunk: string) => void,
	todoId?: number,
): Promise<void> {
	// 流式请求直接调用后端 API，绕过 Next.js 代理
	const baseUrl = getStreamApiBaseUrl();
	const response = await fetch(
		`${baseUrl}/api/chat/plan/questionnaire/stream`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				todo_name: todoName,
				todo_id: todoId,
			}),
		},
	);

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	if (!response.body) {
		throw new Error("ReadableStream is not supported in this environment");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		if (value) {
			const chunk = decoder.decode(value, { stream: true });
			if (chunk) {
				onChunk(chunk);
			}
		}
	}
}

/**
 * Plan功能：生成任务总结和子任务（流式输出）
 */
export async function planSummaryStream(
	todoName: string,
	answers: Record<string, string[]>,
	onChunk: (chunk: string) => void,
): Promise<void> {
	// 流式请求直接调用后端 API，绕过 Next.js 代理
	const baseUrl = getStreamApiBaseUrl();
	const response = await fetch(`${baseUrl}/api/chat/plan/summary/stream`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			todo_name: todoName,
			answers: answers,
		}),
	});

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	if (!response.body) {
		throw new Error("ReadableStream is not supported in this environment");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		if (value) {
			const chunk = decoder.decode(value, { stream: true });
			if (chunk) {
				onChunk(chunk);
			}
		}
	}
}

// ============================================================================
// Agent Plan 执行 API
// ============================================================================

type RawPlan = Record<string, unknown>;

function normalizePlanSpec(raw: RawPlan | null | undefined): PlanSpec | null {
	if (!raw) return null;
	const steps = Array.isArray(raw.steps) ? raw.steps : [];
	return {
		planId: String(raw.plan_id ?? ""),
		title: String(raw.title ?? ""),
		steps: steps.map((step: RawPlan, index: number) => ({
			stepId: String(step.step_id ?? `s${index + 1}`),
			name: String(step.name ?? ""),
			type: step.type as PlanSpec["steps"][number]["type"],
			tool: step.tool ? String(step.tool) : undefined,
			inputs: (step.inputs as Record<string, unknown>) ?? {},
			dependsOn: Array.isArray(step.depends_on)
				? (step.depends_on as string[])
				: [],
			parallelGroup: (step.parallel_group as string | null) ?? null,
			retry: step.retry
				? {
						maxRetries: Number(
							(step.retry as RawPlan).max_retries ?? 0,
						),
						backoffMs: (step.retry as RawPlan).backoff_ms
							? Number((step.retry as RawPlan).backoff_ms)
							: undefined,
					}
				: undefined,
			onFail: step.on_fail as "stop" | "skip" | undefined,
			isSideEffect: (step.is_side_effect as boolean | undefined) ?? undefined,
		})),
	};
}

function normalizeRunInfo(raw: RawPlan | null | undefined): PlanRunInfo | null {
	if (!raw) return null;
	return {
		runId: String(raw.run_id ?? ""),
		planId: String(raw.plan_id ?? ""),
		status: raw.status as PlanRunInfo["status"],
		sessionId: (raw.session_id as string | null | undefined) ?? null,
		error: (raw.error as string | null | undefined) ?? null,
		rollbackStatus: (raw.rollback_status as string | null | undefined) ?? null,
		rollbackError: (raw.rollback_error as string | null | undefined) ?? null,
		startedAt: (raw.started_at as string | null | undefined) ?? null,
		endedAt: (raw.ended_at as string | null | undefined) ?? null,
		cancelRequested: Boolean(raw.cancel_requested),
	};
}

function normalizeRunStep(raw: RawPlan): PlanRunStepInfo {
	return {
		stepId: String(raw.step_id ?? ""),
		stepName: String(raw.step_name ?? ""),
		status: raw.status as PlanRunStepInfo["status"],
		retryCount: Number(raw.retry_count ?? 0),
		inputJson: (raw.input_json as string | null | undefined) ?? null,
		outputJson: (raw.output_json as string | null | undefined) ?? null,
		error: (raw.error as string | null | undefined) ?? null,
		startedAt: (raw.started_at as string | null | undefined) ?? null,
		endedAt: (raw.ended_at as string | null | undefined) ?? null,
		isSideEffect: Boolean(raw.is_side_effect),
		rollbackRequired: Boolean(raw.rollback_required),
	};
}

export async function createAgentPlan(params: {
	message: string;
	todoId?: number;
	context?: Record<string, unknown>;
}): Promise<PlanSpec> {
	const baseUrl = getStreamApiBaseUrl();
	const response = await fetch(`${baseUrl}/api/agent/plan`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			message: params.message,
			todo_id: params.todoId,
			context: params.context,
		}),
	});

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}
	const data = (await response.json()) as { plan: RawPlan };
	const plan = normalizePlanSpec(data.plan);
	if (!plan) {
		throw new Error("Plan response missing");
	}
	return plan;
}

export async function fetchLatestPlanForTodo(
	todoId: number,
): Promise<PlanRunStatusResponse> {
	const baseUrl = getStreamApiBaseUrl();
	const response = await fetch(`${baseUrl}/api/agent/plan/todo/${todoId}/latest`);
	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}
	const data = (await response.json()) as {
		plan?: RawPlan | null;
		run?: RawPlan | null;
		steps?: RawPlan[];
	};
	return {
		plan: normalizePlanSpec(data.plan),
		run: normalizeRunInfo(data.run),
		steps: Array.isArray(data.steps) ? data.steps.map(normalizeRunStep) : [],
	};
}

export async function runAgentPlanStream(
	planId: string,
	onEvent: (event: PlanEvent) => void,
	signal?: AbortSignal,
): Promise<void> {
	const baseUrl = getStreamApiBaseUrl();
	const response = await fetch(`${baseUrl}/api/agent/plan/run`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ plan_id: planId }),
		signal,
	});

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}
	if (!response.body) {
		throw new Error("ReadableStream is not supported in this environment");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let pendingChunk = "";

	while (true) {
		if (signal?.aborted) {
			await reader.cancel();
			break;
		}
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;

		const rawChunk = decoder.decode(value, { stream: true });
		const fullChunk = pendingChunk + rawChunk;
		const [events, content] = parsePlanEvents(fullChunk);

		for (const event of events) {
			onEvent(event);
		}

		const incompleteEventIdx = content.indexOf(PLAN_EVENT_PREFIX);
		if (incompleteEventIdx !== -1) {
			pendingChunk = content.substring(incompleteEventIdx);
		} else {
			pendingChunk = "";
		}
	}
}

// ============================================================================
// 工具函数
// ============================================================================

/**
 * 获取截图图片 URL
 * 辅助函数，用于构建截图图片的 URL
 */
export function getScreenshotImage(id: number): string {
	// 在客户端使用相对路径，通过 Next.js rewrites 代理
	// 在服务端使用完整 URL
	const baseUrl =
		typeof window !== "undefined"
			? ""
			: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";
	return `${baseUrl}/api/screenshots/${id}/image`;
}

// ============================================================================
// 类型导出（从 Orval 生成的 schemas 重新导出，保持向后兼容）
// ============================================================================

// 这些类型现在应该从 @/lib/generated/schemas 导入
// 保留这些重导出以保持向后兼容
export type {
	ExtractedTodo,
	ManualActivityCreateRequest,
	ManualActivityCreateResponse,
	TodoAttachmentResponse as ApiTodoAttachment,
	TodoCreate,
	TodoExtractionResponse,
	TodoPriority,
	TodoResponse as ApiTodo,
	TodoStatus,
	TodoTimeInfo,
	TodoUpdate,
} from "@/lib/generated/schemas";

// Chat 相关类型（这些类型在后端 OpenAPI spec 中可能没有定义，手动定义）
// 注意：使用 camelCase，因为 fetcher 会自动将后端的 snake_case 转换为 camelCase
export type ChatSessionSummary = {
	sessionId: string;
	title?: string;
	lastActive?: string;
	messageCount?: number;
	chatType?: string;
};

export type ChatHistoryItem = {
	role: "user" | "assistant";
	content: string;
	timestamp?: string;
	extraData?: string;
};

export type ChatHistoryResponse = {
	sessions?: ChatSessionSummary[];
	history?: ChatHistoryItem[];
};

// ============================================================================
// 注：通知相关的 API（fetchNotification、deleteNotification）已被 Orval 生成的 API 替换
// 请直接使用 @/lib/generated/notifications/notifications 中的函数
// ============================================================================
