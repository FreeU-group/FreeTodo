import { useCallback, useRef } from "react";
import type { ChatMessage } from "@/apps/chat/types";

/**
 * 会话缓存 Hook 返回值接口
 */
export interface SessionCacheReturn {
	/** 保存消息到缓存 */
	saveMessages: (sessionId: string, messages: ChatMessage[]) => void;
	/** 从缓存获取消息 */
	getMessages: (sessionId: string) => ChatMessage[] | undefined;
	/** 标记会话正在流式输出 */
	markStreaming: (sessionId: string) => void;
	/** 取消会话的流式输出标记 */
	unmarkStreaming: (sessionId: string) => void;
	/** 检查会话是否正在流式输出 */
	isStreaming: (sessionId: string) => boolean;
	/** 更新缓存中的消息（使用更新函数） */
	updateMessages: (
		sessionId: string,
		updater: (prev: ChatMessage[]) => ChatMessage[],
	) => void;
}

/**
 * 管理会话消息的内存缓存
 *
 * 支持：
 * - 会话切换时保留流式输出
 * - 切换回正在流式输出的会话时恢复显示
 *
 * @returns 缓存操作方法
 */
export const useSessionCache = (): SessionCacheReturn => {
	// 在内存中保存每个 sessionId 对应的消息列表
	// 用于切换对话时恢复状态，正在进行的流式输出不会因为切换对话而丢失
	const messagesMapRef = useRef<Map<string, ChatMessage[]>>(new Map());

	// 跟踪每个 sessionId 是否正在流式输出
	const streamingSessionsRef = useRef<Set<string>>(new Set());

	const saveMessages = useCallback(
		(sessionId: string, messages: ChatMessage[]) => {
			if (messages.length > 0) {
				messagesMapRef.current.set(sessionId, messages);
			}
		},
		[],
	);

	const getMessages = useCallback((sessionId: string) => {
		return messagesMapRef.current.get(sessionId);
	}, []);

	const markStreaming = useCallback((sessionId: string) => {
		streamingSessionsRef.current.add(sessionId);
	}, []);

	const unmarkStreaming = useCallback((sessionId: string) => {
		streamingSessionsRef.current.delete(sessionId);
	}, []);

	const isStreaming = useCallback((sessionId: string) => {
		return streamingSessionsRef.current.has(sessionId);
	}, []);

	const updateMessages = useCallback(
		(sessionId: string, updater: (prev: ChatMessage[]) => ChatMessage[]) => {
			const currentMsgs = messagesMapRef.current.get(sessionId) || [];
			messagesMapRef.current.set(sessionId, updater(currentMsgs));
		},
		[],
	);

	return {
		saveMessages,
		getMessages,
		markStreaming,
		unmarkStreaming,
		isStreaming,
		updateMessages,
	};
};
