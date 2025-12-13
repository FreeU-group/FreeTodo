import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlanParser } from "@/apps/chat/hooks/usePlanParser";
import type { ChatMessage, ChatMode } from "@/apps/chat/types";
import { createId } from "@/apps/chat/utils/id";
import { buildTodoContextBlock } from "@/apps/chat/utils/todoContext";
import type { ChatHistoryItem, ChatSessionSummary } from "@/lib/api";
import { getChatHistory, sendChatMessageStream } from "@/lib/api";
import { useChatStore } from "@/lib/store/chat-store";
import type { CreateTodoInput, Todo } from "@/lib/types/todo";

type UseChatControllerParams = {
	locale: string;
	todos: Todo[];
	selectedTodoIds: string[];
	createTodo: (todo: CreateTodoInput) => Promise<Todo | null>;
};

export const useChatController = ({
	locale,
	todos,
	selectedTodoIds,
	createTodo,
}: UseChatControllerParams) => {
	const { planSystemPrompt, parsePlanTodos, buildTodoPayloads } =
		usePlanParser(locale);

	// 使用 chat-store 管理持久化状态
	const {
		chatMode,
		conversationId,
		historyOpen,
		setChatMode,
		setConversationId,
		setHistoryOpen,
	} = useChatStore();

	const buildInitialAssistantMessage = useCallback(
		(): ChatMessage => ({
			id: createId(),
			role: "assistant",
			content:
				locale === "zh"
					? "你好，我是你的待办助手，可以帮你拆解任务、制定计划，也能聊聊生活。"
					: "Hi! I'm your task assistant. I can break down work, plan the day, or just chat.",
		}),
		[locale],
	);

	const [messages, setMessages] = useState<ChatMessage[]>(() => [
		buildInitialAssistantMessage(),
	]);
	const [inputValue, setInputValue] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [historyLoading, setHistoryLoading] = useState(false);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
	const [isComposing, setIsComposing] = useState(false);

	const selectedTodos = useMemo(
		() => todos.filter((todo) => selectedTodoIds.includes(todo.id)),
		[selectedTodoIds, todos],
	);
	const effectiveTodos = useMemo(
		() => (selectedTodos.length ? selectedTodos : []),
		[selectedTodos],
	);
	const hasSelection = selectedTodoIds.length > 0;

	const handleNewChat = useCallback(() => {
		setIsStreaming(false);
		setConversationId(null);
		setMessages([buildInitialAssistantMessage()]);
		setInputValue("");
		setError(null);
		setHistoryOpen(false);
	}, [buildInitialAssistantMessage, setConversationId, setHistoryOpen]);

	const handleSuggestionClick = useCallback((suggestion: string) => {
		setInputValue(suggestion);
	}, []);

	const handleLoadSession = useCallback(
		async (sessionId: string) => {
			setHistoryLoading(true);
			setHistoryError(null);
			try {
				const res = await getChatHistory(sessionId, 100);
				const history = res.history || [];
				const mapped = history.map((item: ChatHistoryItem) => ({
					id: createId(),
					role: item.role,
					content: item.content,
				}));
				setMessages(mapped.length ? mapped : [buildInitialAssistantMessage()]);
				setConversationId(sessionId);
				setHistoryOpen(false);
			} catch (err) {
				console.error(err);
				setHistoryError(
					locale === "zh" ? "加载会话失败" : "Failed to load session",
				);
			} finally {
				setHistoryLoading(false);
			}
		},
		[buildInitialAssistantMessage, locale, setConversationId, setHistoryOpen],
	);

	const handleSend = useCallback(async () => {
		const text = inputValue.trim();
		if (!text || isStreaming) return;

		setInputValue("");
		setError(null);

		const todoSourceLabel = hasSelection
			? locale === "zh"
				? "已选待办"
				: "Selected todos"
			: locale === "zh"
				? "无待办上下文"
				: "No todo context";
		const todoContext = buildTodoContextBlock(
			effectiveTodos,
			todoSourceLabel,
			locale,
		);
		const userLabel = locale === "zh" ? "用户输入" : "User input";

		const payloadMessage =
			chatMode === "plan"
				? `${planSystemPrompt}\n\n${userLabel}: ${text}`
				: `${todoContext}\n\n${userLabel}: ${text}`;
		const userMessage: ChatMessage = {
			id: createId(),
			role: "user",
			content: text,
		};
		const assistantMessageId = createId();

		setMessages((prev) => [
			...prev,
			userMessage,
			{ id: assistantMessageId, role: "assistant", content: "" },
		]);
		setIsStreaming(true);

		let assistantContent = "";

		try {
			await sendChatMessageStream(
				{
					message: payloadMessage,
					conversation_id: conversationId || undefined,
				},
				(chunk) => {
					assistantContent += chunk;
					setMessages((prev) =>
						prev.map((msg) =>
							msg.id === assistantMessageId
								? { ...msg, content: assistantContent }
								: msg,
						),
					);
				},
				(sessionId) => {
					setConversationId((prev) => prev || sessionId);
				},
			);

			if (!assistantContent) {
				const fallback =
					locale === "zh"
						? "没有收到回复，请稍后再试。"
						: "No response received, please try again.";
				setMessages((prev) =>
					prev.map((msg) =>
						msg.id === assistantMessageId ? { ...msg, content: fallback } : msg,
					),
				);
			} else if (chatMode === "plan") {
				const { todos: parsedTodos, error: parseError } =
					parsePlanTodos(assistantContent);
				if (parseError) {
					setMessages((prev) =>
						prev.map((msg) =>
							msg.id === assistantMessageId
								? { ...msg, content: `${assistantContent}\n\n${parseError}` }
								: msg,
						),
					);
					setError(parseError);
				} else {
					const payloads = buildTodoPayloads(parsedTodos);

					// plan 模式：payloads 内的 id / parentTodoId 是前端临时 id（UUID），
					// 需要顺序创建并把 parent 映射为后端数值 id，否则会在 toApiId(parseInt) 处报错。
					const clientIdToApiId = new Map<string, string>();
					let successCount = 0;
					for (const draft of payloads) {
						const clientId = draft.id ?? createId();
						const parentClientId = draft.parentTodoId ?? null;
						const apiParentId = parentClientId
							? (clientIdToApiId.get(parentClientId) ?? null)
							: null;

						const created = await createTodo({
							...draft,
							// 若父任务未成功创建，则降级为根任务（避免整棵子树丢失）
							parentTodoId: apiParentId,
						});
						if (created) {
							clientIdToApiId.set(clientId, created.id);
							successCount += 1;
						}
					}

					const addedText =
						locale === "zh"
							? `已添加 ${successCount} 条待办到列表。`
							: `Added ${successCount} todos to the list.`;
					setMessages((prev) =>
						prev.map((msg) =>
							msg.id === assistantMessageId
								? { ...msg, content: `${assistantContent}\n\n${addedText}` }
								: msg,
						),
					);
				}
			}
		} catch (err) {
			console.error(err);
			const fallback =
				locale === "zh"
					? "出错了，请稍后再试。"
					: "Something went wrong. Please try again.";
			setMessages((prev) =>
				prev.map((msg) =>
					msg.id === assistantMessageId ? { ...msg, content: fallback } : msg,
				),
			);
			setError(fallback);
		} finally {
			setIsStreaming(false);
		}
	}, [
		buildTodoPayloads,
		chatMode,
		conversationId,
		createTodo,
		effectiveTodos,
		hasSelection,
		inputValue,
		isStreaming,
		locale,
		parsePlanTodos,
		planSystemPrompt,
		setConversationId,
	]);

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

	const fetchSessions = useCallback(async () => {
		setHistoryLoading(true);
		setHistoryError(null);
		try {
			const res = await getChatHistory(undefined, 30);
			setSessions(res.sessions || []);
		} catch (err) {
			console.error(err);
			setHistoryError(
				locale === "zh" ? "加载历史记录失败" : "Failed to load history",
			);
		} finally {
			setHistoryLoading(false);
		}
	}, [locale]);

	useEffect(() => {
		if (historyOpen) {
			void fetchSessions();
		}
	}, [fetchSessions, historyOpen]);

	return {
		chatMode,
		setChatMode,
		messages,
		inputValue,
		setInputValue,
		conversationId,
		isStreaming,
		error,
		historyOpen,
		setHistoryOpen,
		historyLoading,
		historyError,
		sessions,
		isComposing,
		setIsComposing,
		handleSend,
		handleNewChat,
		handleLoadSession,
		handleSuggestionClick,
		handleKeyDown,
		effectiveTodos,
		hasSelection,
	};
};
