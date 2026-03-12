"use client";

import type { ChatHistoryItem, ChatSessionSummary } from "@/lib/api";
import { useGetChatHistoryApiChatHistoryGet } from "@/lib/generated/chat/chat";
import { queryKeys } from "./keys";

// Chat history response type (since API returns unknown, we define it based on usage)
interface ChatHistoryResponse {
	sessions?: Array<{ id: string; [key: string]: unknown }>;
	history?: Array<{ [key: string]: unknown }>;
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * 将会话数据转换为 ChatSessionSummary 类型
 * fetcher 已自动将 snake_case 转换为 camelCase
 */
function mapSessionToSummary(session: {
	[key: string]: unknown;
}): ChatSessionSummary {
	return {
		sessionId: typeof session.sessionId === "string" ? session.sessionId : "",
		title: typeof session.title === "string" ? session.title : undefined,
		lastActive:
			typeof session.lastActive === "string" ? session.lastActive : undefined,
		messageCount:
			typeof session.messageCount === "number"
				? session.messageCount
				: undefined,
		chatType:
			typeof session.chatType === "string" ? session.chatType : undefined,
	};
}

/**
 * 获取聊天会话列表的 Query Hook
 * 使用 Orval 生成的 hook
 */
export function useChatSessions(options?: {
	limit?: number;
	chatType?: string;
	enabled?: boolean;
	refetchInterval?: number | false;
	staleTime?: number;
}) {
	const {
		chatType,
		enabled = true,
		refetchInterval,
		staleTime = 30 * 1000,
	} = options ?? {};

	return useGetChatHistoryApiChatHistoryGet(
		{
			chat_type: chatType,
			// session_id 不传，获取会话列表
		},
		{
			query: {
				queryKey: queryKeys.chatHistory.sessions(chatType),
				enabled,
				staleTime,
				refetchInterval,
				select: (data: unknown) => {
					// 返回会话列表，转换为 ChatSessionSummary[]
					const response = data as ChatHistoryResponse;
					return (response?.sessions ?? []).map(mapSessionToSummary);
				},
			},
		},
	);
}

/**
 * 将历史记录数据转换为 ChatHistoryItem 类型
 */
function mapHistoryItem(item: {
	[key: string]: unknown;
}): ChatHistoryItem | null {
	if (
		typeof item.role !== "string" ||
		(item.role !== "user" && item.role !== "assistant") ||
		typeof item.content !== "string"
	) {
		return null;
	}

	return {
		role: item.role as "user" | "assistant",
		content: item.content,
		timestamp: typeof item.timestamp === "string" ? item.timestamp : undefined,
		extraData: typeof item.extraData === "string" ? item.extraData : undefined,
	};
}

/**
 * 获取单个会话的消息历史的 Query Hook
 * 使用 Orval 生成的 hook
 */
export function useChatHistory(
	sessionId: string | null,
	options?: { limit?: number; enabled?: boolean },
) {
	const { enabled = true } = options ?? {};

	return useGetChatHistoryApiChatHistoryGet(
		{
			session_id: sessionId ?? undefined,
		},
		{
			query: {
				queryKey: queryKeys.chatHistory.session(sessionId ?? ""),
				enabled: enabled && sessionId !== null,
				staleTime: 30 * 1000,
				select: (data: unknown) => {
					// 返回消息历史，转换为 ChatHistoryItem[]
					const response = data as ChatHistoryResponse;
					return (response?.history ?? [])
						.map(mapHistoryItem)
						.filter((item): item is ChatHistoryItem => item !== null);
				},
			},
		},
	);
}
