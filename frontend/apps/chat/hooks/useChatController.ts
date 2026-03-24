import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSendMessage } from "@/apps/chat/hooks/useSendMessage";
import { useSessionCache } from "@/apps/chat/hooks/useSessionCache";
import { useSessionManager } from "@/apps/chat/hooks/useSessionManager";
import { useStreamController } from "@/apps/chat/hooks/useStreamController";
import { useToolCallTracker } from "@/apps/chat/hooks/useToolCallTracker";
import type { ChatMessage } from "@/apps/chat/types";
import { useCrawlerStore } from "@/apps/crawler/store";
import { formatBytes } from "@/lib/preview/utils";
import { useChatHistory, useChatSessions, useTodos } from "@/lib/query";
import { useBreakdownStore } from "@/lib/store/breakdown-store";
import { useChatStore } from "@/lib/store/chat-store";
import { useUiStore } from "@/lib/store/ui-store";
import { toastError } from "@/lib/toast";
import type { Todo } from "@/lib/types";

type UseChatControllerParams = {
	locale: string;
	selectedTodoIds: number[];
};

const MAX_CHAT_ATTACHMENTS = 8;
const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024;

const buildAttachmentKey = (file: File) =>
	`${file.name}:${file.size}:${file.lastModified}`;

export const useChatController = ({
	locale,
	selectedTodoIds,
}: UseChatControllerParams) => {
	const t = useTranslations("chat");
	const tCommon = useTranslations("common");
	const queryClient = useQueryClient();

	// ==================== 基础 Hooks ====================

	const sessionCache = useSessionCache();
	const streamController = useStreamController();
	const toolCallTracker = useToolCallTracker();

	// ==================== Store 数据 ====================

	const { data: todos = [] } = useTodos();

	// 获取爬虫 store 中选中的爬取结果
	const selectedCrawlerResult = useCrawlerStore((state) => state.selectedResult);

	// 使用 chat-store 管理持久化状态
	const {
		conversationId,
		historyOpen,
		historyPinned,
		setConversationId,
		setHistoryOpen,
		setHistoryPinned,
	} = useChatStore();

	const resetBreakdown = useBreakdownStore((state) => state.resetBreakdown);
	const selectedAgnoTools = useUiStore((state) => state.selectedAgnoTools);
	const selectedExternalTools = useUiStore(
		(state) => state.selectedExternalTools,
	);

	// 调试：打印选中的工具
	useEffect(() => {
		console.log(
			"[useChatController] Current selectedAgnoTools:",
			selectedAgnoTools,
		);
		console.log(
			"[useChatController] Current selectedExternalTools:",
			selectedExternalTools,
		);
	}, [selectedAgnoTools, selectedExternalTools]);

	// ==================== TanStack Query ====================

	const {
		data: sessions = [],
		isLoading: historyLoading,
		error: sessionsError,
	} = useChatSessions({
		enabled: historyOpen,
		refetchInterval: historyOpen ? 3000 : false,
	});

	const {
		data: sessionHistory = [],
		isFetching: historyFetching,
		isFetched: historyFetched,
	} = useChatHistory(conversationId);

	// ==================== 本地状态 ====================

	const [messages, setMessages] = useState<ChatMessage[]>(() => []);
	const [inputValue, setInputValue] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isComposing, setIsComposing] = useState(false);
	const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);

	const historyError = sessionsError ? t("loadHistoryFailed") : null;

	// ==================== 计算属性 ====================

	const selectedTodos = useMemo(
		() => todos.filter((todo: Todo) => selectedTodoIds.includes(todo.id)),
		[selectedTodoIds, todos],
	) as Todo[];

	const effectiveTodos = useMemo(
		() => (selectedTodos.length ? selectedTodos : []),
		[selectedTodos],
	);

	const hasSelection = selectedTodoIds.length > 0;

	// ==================== 附件处理 ====================

	const clearPendingAttachments = useCallback(() => {
		setPendingAttachments([]);
	}, []);

	const removePendingAttachment = useCallback((index: number) => {
		setPendingAttachments((prev) => prev.filter((_, idx) => idx !== index));
	}, []);

	const addPendingAttachments = useCallback(
		(files: File[]) => {
			if (files.length === 0) return;

			setPendingAttachments((prev) => {
				const existingKeys = new Set(prev.map(buildAttachmentKey));
				const next: File[] = [];
				let oversized = false;

				for (const file of files) {
					if (file.size > MAX_CHAT_ATTACHMENT_BYTES) {
						oversized = true;
						continue;
					}

					const key = buildAttachmentKey(file);
					if (existingKeys.has(key)) continue;
					next.push(file);
					existingKeys.add(key);
				}

				if (oversized) {
					toastError(
						t("attachments.fileTooLarge", {
							size: formatBytes(MAX_CHAT_ATTACHMENT_BYTES),
						}),
					);
				}

				if (next.length === 0) return prev;

				const available = MAX_CHAT_ATTACHMENTS - prev.length;
				if (available <= 0) {
					toastError(
						t("attachments.tooMany", { count: MAX_CHAT_ATTACHMENTS }),
					);
					return prev;
				}

				const toAdd = next.slice(0, available);
				if (next.length > available) {
					toastError(
						t("attachments.tooMany", { count: MAX_CHAT_ATTACHMENTS }),
					);
				}

				return [...prev, ...toAdd];
			});
		},
		[t],
	);

	// ==================== 组合 Hooks ====================

	// 会话管理 hook
	const { handleNewChat, handleLoadSession } = useSessionManager({
		sessionCache,
		streamController,
		resetBreakdown,
		setConversationId,
		setHistoryOpen,
		setMessages,
		setInputValue,
		setIsStreaming,
		setError,
		sessionHistory,
		historyFetched,
		historyFetching,
		conversationId,
	});

	// 发送消息 hook
	const { sendMessage } = useSendMessage({
		locale,
		hasSelection,
		effectiveTodos,
		todos,
		selectedAgnoTools,
		selectedExternalTools,
		sessionCache,
		streamController,
		toolCallTracker,
		queryClient,
		t,
		tCommon,
		setConversationId,
		setMessages,
		setInputValue,
		setIsStreaming,
		setError,
		clearPendingAttachments,
	});

	// ==================== 事件处理 ====================

	const handleStop = useCallback(() => {
		streamController.cancelRequest();
		setIsStreaming(false);
	}, [streamController]);

	const handleSend = useCallback(async () => {
		await sendMessage(inputValue, true, pendingAttachments);
	}, [sendMessage, inputValue, pendingAttachments]);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (
				event.key === "Enter" &&
				!event.shiftKey &&
				!isComposing &&
				!event.nativeEvent.isComposing
			) {
				event.preventDefault();
				void handleSend();
			}
		},
		[handleSend, isComposing],
	);

	const handleNewChatWithAttachments = useCallback(
		(keepStreaming = false) => {
			clearPendingAttachments();
			handleNewChat(keepStreaming);
		},
		[clearPendingAttachments, handleNewChat],
	);

	const handleLoadSessionWithAttachments = useCallback(
		async (sessionId: string) => {
			clearPendingAttachments();
			await handleLoadSession(sessionId);
		},
		[clearPendingAttachments, handleLoadSession],
	);

	// ==================== 返回接口（保持向后兼容） ====================

	return {
		messages,
		setMessages,
		inputValue,
		setInputValue,
		conversationId,
		setConversationId,
		isStreaming,
		setIsStreaming,
		error,
		setError,
		historyOpen,
		setHistoryOpen,
		historyPinned,
		setHistoryPinned,
		historyLoading,
		historyError,
		sessions,
		isComposing,
		setIsComposing,
		sendMessage,
		handleSend,
		handleStop,
		handleNewChat: handleNewChatWithAttachments,
		handleLoadSession: handleLoadSessionWithAttachments,
		handleKeyDown,
		effectiveTodos,
		hasSelection,
		todos,
		pendingAttachments,
		addPendingAttachments,
		removePendingAttachment,
		clearPendingAttachments,
		// 暴露 streamController，供其他 hooks 使用（如 usePromptHandlers）
		streamController,
		// 爬取内容上下文
		selectedCrawlerResult,
	};
};
