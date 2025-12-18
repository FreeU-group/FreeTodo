/**
 * 获取流式 API 的基础 URL
 * 流式请求直接调用后端 API，绕过 Next.js 代理，避免 gzip 压缩破坏流式传输
 */
function getStreamApiBaseUrl(): string {
	// 流式请求始终直接调用后端，避免 Next.js 代理导致的缓冲/压缩问题
	return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

// ============================================================================
// 流式 API（Orval 不支持 Server-Sent Events，需要手动实现）
// ============================================================================

export interface SendChatParams {
	message: string;
	conversation_id?: string;
	use_rag?: boolean;
}

/**
 * 发送聊天消息并以流式方式接收回复
 */
export async function sendChatMessageStream(
	params: SendChatParams,
	onChunk: (chunk: string) => void,
	onSessionId?: (sessionId: string) => void,
): Promise<void> {
	// 流式请求直接调用后端 API，绕过 Next.js 代理
	const baseUrl = getStreamApiBaseUrl();
	const response = await fetch(`${baseUrl}/api/chat/stream`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(params),
	});

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
			: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
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
export type ChatSessionSummary = {
	session_id: string;
	title?: string;
	last_active?: string;
	message_count?: number;
	chat_type?: string;
};

export type ChatHistoryItem = {
	role: "user" | "assistant";
	content: string;
	timestamp?: string;
};

export type ChatHistoryResponse = {
	sessions?: ChatSessionSummary[];
	history?: ChatHistoryItem[];
};

// ============================================================================
// 重新导出 Orval 生成的 API 函数（仅保留实际使用的）
// ============================================================================

// 仅保留 notification-poller.ts 中使用的 getTodos
// 其他组件应直接使用 TanStack Query hooks 或生成的 API 函数
export { listTodosApiTodosGet as getTodos } from "@/lib/generated/todos/todos";

// 通知轮询 - 如果 Orval 生成中没有，提供手动实现
export interface NotificationResponse {
	id?: string;
	title: string;
	content: string;
	timestamp?: string;
}

export async function fetchNotification(
	url: string,
): Promise<NotificationResponse | null> {
	const baseUrl = getStreamApiBaseUrl();

	try {
		const response = await fetch(`${baseUrl}${url}`, {
			method: "GET",
			headers: {
				"Content-Type": "application/json",
			},
		});

		if (!response.ok) {
			if (response.status === 404) {
				return null;
			}
			throw new Error(`Request failed with status ${response.status}`);
		}

		const text = await response.text();
		if (!text || text.trim() === "") {
			return null;
		}

		const data = JSON.parse(text) as NotificationResponse;
		if (!data.title && !data.content) {
			return null;
		}

		return data;
	} catch (error) {
		console.warn(`Failed to fetch notification from ${url}:`, error);
		return null;
	}
}
