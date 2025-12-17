"use client";

import { useQuery } from "@tanstack/react-query";
import { getChatHistory } from "@/lib/api";
import { queryKeys } from "./keys";

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * 获取聊天会话列表的 Query Hook
 */
export function useChatSessions(options?: {
	limit?: number;
	chatType?: string;
	enabled?: boolean;
}) {
	const { limit = 30, chatType, enabled = true } = options ?? {};

	return useQuery({
		queryKey: queryKeys.chatHistory.sessions(chatType),
		queryFn: async () => {
			const res = await getChatHistory(undefined, limit, chatType);
			return res.sessions ?? [];
		},
		enabled,
		staleTime: 30 * 1000,
	});
}

/**
 * 获取单个会话的消息历史的 Query Hook
 */
export function useChatHistory(
	sessionId: string | null,
	options?: { limit?: number; enabled?: boolean },
) {
	const { limit = 100, enabled = true } = options ?? {};

	return useQuery({
		queryKey: queryKeys.chatHistory.session(sessionId ?? ""),
		queryFn: async () => {
			if (!sessionId) return [];
			const res = await getChatHistory(sessionId, limit);
			return res.history ?? [];
		},
		enabled: enabled && sessionId !== null,
		staleTime: 30 * 1000,
	});
}
