import { useCallback, useEffect, useRef } from "react";
import type { ChatMessage } from "@/apps/chat/types";

/**
 * 管理消息列表的滚动行为
 */
export function useMessageScroll(
	messages: ChatMessage[],
	isStreaming: boolean,
) {
	const messageListRef = useRef<HTMLDivElement>(null);
	// 跟踪用户是否在底部（或接近底部）
	const isAtBottomRef = useRef(true);
	// 跟踪上一次消息数量，用于检测新消息
	const prevMessageCountRef = useRef(0);

	// 检查是否在底部（允许 30px 的误差）
	const checkIsAtBottom = useCallback(() => {
		const el = messageListRef.current;
		if (!el) return true;
		const threshold = 30;
		return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
	}, []);

	// 处理滚动事件
	const handleScroll = useCallback(() => {
		isAtBottomRef.current = checkIsAtBottom();
	}, [checkIsAtBottom]);

	// 滚动到底部
	const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
		const el = messageListRef.current;
		if (el) {
			el.scrollTo({ top: el.scrollHeight, behavior });
		}
	}, []);

	// 当用户发送新消息时，强制滚动到底部
	useEffect(() => {
		if (messages.length === 0) return;

		const currentCount = messages.length;
		const prevCount = prevMessageCountRef.current;
		prevMessageCountRef.current = currentCount;

		// 检测是否是用户发送了新消息（消息数量增加且最后一条是用户消息）
		const lastMessage = messages[messages.length - 1];
		const isNewUserMessage =
			currentCount > prevCount && lastMessage?.role === "user";

		if (isNewUserMessage) {
			// 用户发送新消息时，强制滚动到底部并重置状态
			isAtBottomRef.current = true;
			scrollToBottom();
		}
	}, [messages, scrollToBottom]);

	// 流式输出时，只有在底部才自动滚动
	// biome-ignore lint/correctness/useExhaustiveDependencies: messages dependency is needed to trigger scroll on each streaming update
	useEffect(() => {
		if (!isStreaming) return;
		if (!isAtBottomRef.current) return;

		// 使用 requestAnimationFrame 确保 DOM 更新后再滚动
		const frameId = requestAnimationFrame(() => {
			scrollToBottom("auto");
		});

		return () => cancelAnimationFrame(frameId);
	}, [messages, isStreaming, scrollToBottom]);

	return {
		messageListRef,
		handleScroll,
	};
}
