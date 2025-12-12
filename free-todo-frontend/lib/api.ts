import type { Activity } from "@/lib/types/activity";

// 获取 API 基础 URL
// 在客户端使用相对路径，通过 Next.js rewrites 代理到后端（避免 CORS）
// 在服务端使用完整 URL
function getApiBaseUrl(): string {
	if (typeof window !== "undefined") {
		// 客户端：使用相对路径，通过 Next.js rewrites 代理
		return "";
	}
	// 服务端：使用完整 URL
	return process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
}

// 为了向后兼容，保留这个导出
export const API_BASE_URL = getApiBaseUrl();

export interface SendChatParams {
	message: string;
	conversation_id?: string;
	use_rag?: boolean;
}

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

/**
 * 发送聊天消息并以流式方式接收回复
 */
export async function sendChatMessageStream(
	params: SendChatParams,
	onChunk: (chunk: string) => void,
	onSessionId?: (sessionId: string) => void,
): Promise<void> {
	const baseUrl =
		typeof window !== "undefined"
			? ""
			: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
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
 * 获取聊天历史（不传 sessionId 时返回会话列表，传入时返回该会话的消息）
 */
export async function getChatHistory(
	sessionId?: string,
	limit = 20,
	chatType?: string,
): Promise<ChatHistoryResponse> {
	const params = new URLSearchParams();
	if (sessionId) params.append("session_id", sessionId);
	if (limit) params.append("limit", String(limit));
	if (chatType) params.append("chat_type", chatType);

	const query = params.toString();
	const baseUrl =
		typeof window !== "undefined"
			? ""
			: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
	const response = await fetch(
		`${baseUrl}/api/chat/history${query ? `?${query}` : ""}`,
	);

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	return response.json();
}

// 活动相关 API
export async function getActivities(params?: {
	limit?: number;
	offset?: number;
	start_date?: string;
	end_date?: string;
}): Promise<{
	data?: {
		activities?: Activity[];
		total_count?: number;
	};
}> {
	const queryParams = new URLSearchParams();
	if (params?.limit) queryParams.append("limit", String(params.limit));
	if (params?.offset) queryParams.append("offset", String(params.offset));
	if (params?.start_date) queryParams.append("start_date", params.start_date);
	if (params?.end_date) queryParams.append("end_date", params.end_date);

	const query = queryParams.toString();
	const baseUrl =
		typeof window !== "undefined"
			? ""
			: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
	const url = `${baseUrl}/api/activities${query ? `?${query}` : ""}`;

	const response = await fetch(url, {
		headers: {
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	const json = await response.json();
	// 后端返回形态为 { activities, total_count }
	if (json?.activities) {
		return {
			data: { activities: json.activities, total_count: json.total_count },
		};
	}
	return json;
}

export async function getActivityEvents(
	activityId: number,
): Promise<{ data?: { event_ids?: number[] } }> {
	const baseUrl =
		typeof window !== "undefined"
			? ""
			: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
	const response = await fetch(
		`${baseUrl}/api/activities/${activityId}/events`,
		{
			headers: {
				"Content-Type": "application/json",
			},
		},
	);

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	const json = await response.json();
	// 后端返回形态为 { event_ids: [...] }
	if (json && Array.isArray(json.event_ids)) {
		return { data: { event_ids: json.event_ids } };
	}
	return json;
}

// 事件相关 API
export async function getEvents(params?: {
	limit?: number;
	offset?: number;
	start_date?: string;
	end_date?: string;
	app_name?: string;
}): Promise<{
	data?: {
		events?: Array<{
			id: number;
			app_name: string;
			window_title: string;
			start_time: string;
			end_time?: string;
			screenshot_count: number;
			first_screenshot_id?: number;
			ai_summary?: string;
		}>;
		total_count?: number;
	};
}> {
	const queryParams = new URLSearchParams();
	if (params?.limit) queryParams.append("limit", String(params.limit));
	if (params?.offset) queryParams.append("offset", String(params.offset));
	if (params?.start_date) queryParams.append("start_date", params.start_date);
	if (params?.end_date) queryParams.append("end_date", params.end_date);
	if (params?.app_name) queryParams.append("app_name", params.app_name);

	const query = queryParams.toString();
	const baseUrl =
		typeof window !== "undefined"
			? ""
			: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
	const url = `${baseUrl}/api/events${query ? `?${query}` : ""}`;
	const response = await fetch(url, {
		headers: {
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	return response.json();
}

export async function getEvent(id: number): Promise<{
	data?: {
		id: number;
		app_name: string | null;
		window_title: string | null;
		start_time: string;
		end_time?: string | null;
		screenshots?: Array<{
			id: number;
			file_path: string;
			app_name: string;
			window_title: string;
			created_at: string;
			width: number;
			height: number;
			ocr_result?: {
				text_content: string;
			};
		}>;
		screenshot_count?: number;
		first_screenshot_id?: number | null;
		ai_title?: string | null;
		ai_summary?: string | null;
	};
}> {
	const baseUrl =
		typeof window !== "undefined"
			? ""
			: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
	const response = await fetch(`${baseUrl}/api/events/${id}`, {
		headers: {
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	const data = await response.json();

	// 后端直接返回 EventDetailResponse，需要在前端补全计数等衍生字段
	const screenshots = data.screenshots || [];
	const screenshotCount = screenshots.length;
	const firstScreenshotId = screenshots[0]?.id ?? null;

	return {
		data: {
			...data,
			screenshots,
			screenshot_count: screenshotCount,
			first_screenshot_id: firstScreenshotId,
		},
	};
}

export function getScreenshotImage(id: number): string {
	// 在客户端使用相对路径，通过 Next.js rewrites 代理
	// 在服务端使用完整 URL
	const baseUrl =
		typeof window !== "undefined"
			? ""
			: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
	return `${baseUrl}/api/screenshots/${id}/image`;
}

// 手动聚合事件为活动
export async function createActivityFromEvents(eventIds: number[]): Promise<{
	data?: Activity;
}> {
	const baseUrl =
		typeof window !== "undefined"
			? ""
			: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
	const response = await fetch(`${baseUrl}/api/activities/manual`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ event_ids: eventIds }),
	});

	if (!response.ok) {
		const errorData = await response.json().catch(() => ({}));
		throw new Error(
			errorData.detail || `Request failed with status ${response.status}`,
		);
	}

	const data = await response.json();
	return { data };
}
