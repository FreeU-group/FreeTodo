import { getStreamApiBaseUrl } from "@/lib/api/base";

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
	attachments?: File[];
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
	onRequestStart?: () => void,
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
		const hasAttachments =
			Array.isArray(params.attachments) && params.attachments.length > 0;

		if (hasAttachments) {
			const formData = new FormData();
			formData.append("message", params.message);
			if (params.userInput !== undefined) {
				formData.append("user_input", params.userInput);
			}
			if (params.context !== undefined) {
				formData.append("context", params.context);
			}
			if (params.systemPrompt !== undefined) {
				formData.append("system_prompt", params.systemPrompt);
			}
			if (params.conversationId !== undefined) {
				formData.append("conversation_id", params.conversationId);
			}
			if (params.useRag !== undefined) {
				formData.append("use_rag", String(params.useRag));
			}
			if (params.mode !== undefined) {
				formData.append("mode", params.mode);
			}
			if (params.selectedTools?.length) {
				for (const tool of params.selectedTools) {
					formData.append("selected_tools", tool);
				}
			}
			if (params.externalTools?.length) {
				for (const tool of params.externalTools) {
					formData.append("external_tools", tool);
				}
			}
			for (const file of (params.attachments ?? [])) {
				formData.append("attachments", file);
			}

			response = await fetch(apiUrl, {
				method: "POST",
				headers: {
					"Accept-Language": locale || "en",
				},
				body: formData,
				signal,
			});
		} else {
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
		}
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

	if (onRequestStart) {
		onRequestStart();
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
export {
	planQuestionnaireStream,
	planSummaryStream,
	createAgentPlan,
	fetchLatestPlanForTodo,
	runAgentPlanStream,
} from "@/lib/api/plan";
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
