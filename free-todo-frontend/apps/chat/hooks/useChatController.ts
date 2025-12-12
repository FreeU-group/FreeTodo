import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePlanParser } from "@/apps/chat/hooks/usePlanParser";
import type { ChatMessage, ChatMode } from "@/apps/chat/types";
import { createId } from "@/apps/chat/utils/id";
import { buildTodoContextBlock } from "@/apps/chat/utils/todoContext";
import type { ChatHistoryItem, ChatSessionSummary } from "@/lib/api";
import { getChatHistory, sendChatMessageStream } from "@/lib/api";
import type { CreateTodoInput, Todo } from "@/lib/types/todo";

type UseChatControllerParams = {
	locale: string;
	todos: Todo[];
	selectedTodoIds: string[];
	addTodo: (todo: CreateTodoInput) => void;
};

export const useChatController = ({
	locale,
	todos,
	selectedTodoIds,
	addTodo,
}: UseChatControllerParams) => {
	const { planSystemPrompt, parsePlanTodos, buildTodoPayloads } =
		usePlanParser(locale);

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
	const [chatMode, setChatMode] = useState<ChatMode>("ask");
	const [inputValue, setInputValue] = useState("");
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [historyOpen, setHistoryOpen] = useState(false);
	const [historyLoading, setHistoryLoading] = useState(false);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
	const [isComposing, setIsComposing] = useState(false);

	const selectedTodos = useMemo(
		() => todos.filter((todo) => selectedTodoIds.includes(todo.id)),
		[selectedTodoIds, todos],
	);
	const effectiveTodos = useMemo(
		() => (selectedTodos.length ? selectedTodos : todos),
		[selectedTodos, todos],
	);
	const hasSelection = selectedTodoIds.length > 0;

	const handleNewChat = useCallback(() => {
		setIsStreaming(false);
		setConversationId(null);
		setMessages([buildInitialAssistantMessage()]);
		setInputValue("");
		setError(null);
		setHistoryOpen(false);
	}, [buildInitialAssistantMessage]);

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
		[buildInitialAssistantMessage, locale],
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
				? "全部待办"
				: "All todos";
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
					payloads.forEach((todo) => {
						addTodo(todo);
					});
					const addedText =
						locale === "zh"
							? `已添加 ${payloads.length} 条待办到列表。`
							: `Added ${payloads.length} todos to the list.`;
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
		addTodo,
		buildTodoPayloads,
		chatMode,
		conversationId,
		effectiveTodos,
		hasSelection,
		inputValue,
		isStreaming,
		locale,
		parsePlanTodos,
		planSystemPrompt,
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
