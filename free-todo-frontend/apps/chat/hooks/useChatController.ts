import { useTranslations } from "next-intl";
import type { KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePlanParser } from "@/apps/chat/hooks/usePlanParser";
import type { ChatMessage } from "@/apps/chat/types";
import { createId } from "@/apps/chat/utils/id";
import {
	buildHierarchicalTodoContext,
	buildTodoContextBlock,
} from "@/apps/chat/utils/todoContext";
import type { ChatHistoryItem } from "@/lib/api";
import { sendChatMessageStream } from "@/lib/api";
import { useChatHistory, useChatSessions, useTodos } from "@/lib/query";
import { useChatStore } from "@/lib/store/chat-store";
import type { CreateTodoInput, Todo } from "@/lib/types";

type UseChatControllerParams = {
	locale: string;
	selectedTodoIds: number[];
	createTodo: (todo: CreateTodoInput) => Promise<Todo | null>;
};

// Build Edit mode system prompt
const buildEditSystemPrompt = (locale: string): string => {
	return locale === "zh"
		? `你是一个待办编辑助手。根据用户的请求和关联待办的上下文，生成有用的内容。

**重要规则：**
1. 使用 ## 标题来分隔不同的内容块
2. **每个内容块的末尾必须添加 [append_to: <todo_id>]**，推荐这段内容应该追加到哪个待办的备注中
3. 使用上下文中提供的待办ID（数字），根据内容相关性选择最合适的待办
4. 每个内容块都必须有推荐的目标待办，不能遗漏

**输出格式示例：**
## 项目概述
这是项目的主要目标和范围...

[append_to: 123]

## 下一步行动
1. 完成需求分析
2. 安排会议

[append_to: 456]

注意：[append_to: xxx] 中的 xxx 必须是上下文中存在的待办ID数字。`
		: `You are a todo editing assistant. Generate helpful content based on the user's request and linked todos context.

**Important Rules:**
1. Use ## headers to separate distinct content blocks
2. **Every content block MUST end with [append_to: <todo_id>]** to recommend which todo this content should be appended to
3. Use the todo IDs (numbers) provided in context, choose the most relevant one based on content
4. Every block must have a recommended target todo, do not omit any

**Output Format Example:**
## Project Overview
This section describes the main goals and scope...

[append_to: 123]

## Next Steps
1. Complete requirements analysis
2. Schedule meeting

[append_to: 456]

Note: The xxx in [append_to: xxx] must be an existing todo ID number from the context.`;
};

export const useChatController = ({
	locale,
	selectedTodoIds,
	createTodo,
}: UseChatControllerParams) => {
	const t = useTranslations("chat");
	const tCommon = useTranslations("common");
	const { planSystemPrompt, parsePlanTodos, buildTodoPayloads } = usePlanParser(
		locale,
		t,
	);

	// Edit mode system prompt
	const editSystemPrompt = useMemo(
		() => buildEditSystemPrompt(locale),
		[locale],
	);

	// 从 TanStack Query 获取 todos 数据
	const { data: todos = [] } = useTodos();

	// 使用 chat-store 管理持久化状态
	const {
		chatMode,
		conversationId,
		historyOpen,
		setChatMode,
		setConversationId,
		setHistoryOpen,
	} = useChatStore();

	// 使用 TanStack Query 获取会话列表
	const {
		data: sessions = [],
		isLoading: historyLoading,
		error: sessionsError,
	} = useChatSessions({
		enabled: historyOpen,
	});

	// 使用 TanStack Query 获取当前会话的历史记录
	const { data: sessionHistory = [] } = useChatHistory(conversationId);

	const buildInitialAssistantMessage = useCallback(
		(): ChatMessage => ({
			id: createId(),
			role: "assistant",
			content: t("initialMessage"),
		}),
		[t],
	);

	const [messages, setMessages] = useState<ChatMessage[]>(() => [
		buildInitialAssistantMessage(),
	]);
	const [inputValue, setInputValue] = useState("");
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isComposing, setIsComposing] = useState(false);
	// 使用ref跟踪上一次的conversationId，只在conversationId改变时加载history
	const prevConversationIdRef = useRef<string | null>(null);
	// 跟踪是否是主动加载历史记录（点击历史记录）vs 发送消息后的被动更新
	const isLoadingSessionRef = useRef<boolean>(false);

	const historyError = sessionsError ? t("loadHistoryFailed") : null;

	const selectedTodos = useMemo(
		() => todos.filter((todo: Todo) => selectedTodoIds.includes(todo.id)),
		[selectedTodoIds, todos],
	) as Todo[];
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
			// 标记为主动加载历史记录
			isLoadingSessionRef.current = true;
			// 使用 TanStack Query 的数据
			// 当 conversationId 改变时，useChatHistory 会自动获取新的历史记录
			setConversationId(sessionId);
			setHistoryOpen(false);
		},
		[setConversationId, setHistoryOpen],
	);

	// 当会话历史加载完成后，更新 messages（仅在主动加载历史记录时）
	useEffect(() => {
		// 如果正在流式传输，不要覆盖消息
		if (isStreaming) {
			return;
		}

		// 更新prevConversationIdRef
		const conversationIdChanged =
			prevConversationIdRef.current !== conversationId;
		if (conversationIdChanged) {
			prevConversationIdRef.current = conversationId;
		}

		// 只有在主动加载历史记录时才用history覆盖messages
		// 发送消息后的history更新不应该覆盖当前正在显示的消息
		if (!isLoadingSessionRef.current) {
			return;
		}

		if (sessionHistory.length > 0 && conversationId) {
			const mapped = sessionHistory.map((item: ChatHistoryItem) => ({
				id: createId(),
				role: item.role,
				content: item.content,
			}));
			setMessages(mapped.length ? mapped : [buildInitialAssistantMessage()]);
			// 加载完成，重置标志
			isLoadingSessionRef.current = false;
		}
		// 如果conversationId存在但历史记录为空，可能是正在加载，保持标志为true等待数据
	}, [
		sessionHistory,
		conversationId,
		buildInitialAssistantMessage,
		isStreaming,
	]);

	const handleSend = useCallback(async () => {
		const text = inputValue.trim();
		if (!text || isStreaming) return;

		setInputValue("");
		setError(null);

		// 当有选中待办时，使用完整的层级上下文（包含所有参数和父子关系）
		// 否则使用简单的空上下文提示
		const todoContext = hasSelection
			? buildHierarchicalTodoContext(effectiveTodos, todos, t, tCommon)
			: buildTodoContextBlock([], t("noTodoContext"), t);
		const userLabel = t("userInput");

		// Build payload message based on chat mode
		let payloadMessage: string;
		if (chatMode === "plan") {
			payloadMessage = `${planSystemPrompt}\n\n${userLabel}: ${text}`;
		} else if (chatMode === "edit") {
			// Edit mode: combine todo context with edit system prompt
			payloadMessage = `${editSystemPrompt}\n\n${todoContext}\n\n${userLabel}: ${text}`;
		} else {
			// Ask mode: just todo context
			payloadMessage = `${todoContext}\n\n${userLabel}: ${text}`;
		}
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
					conversationId: conversationId || undefined,
					// 当发送格式化消息（包含todo上下文）时，设置useRag=false
					// 因为前端已经构建了完整的prompt，后端只需要解析并保存用户输入部分
					useRag: false,
				},
				(chunk) => {
					assistantContent += chunk;
					// 使用 flushSync 强制同步更新，确保流式输出效果
					flushSync(() => {
						setMessages((prev) =>
							prev.map((msg) =>
								msg.id === assistantMessageId
									? { ...msg, content: assistantContent }
									: msg,
							),
						);
					});
				},
				(sessionId) => {
					setConversationId(conversationId || sessionId);
				},
			);

			if (!assistantContent) {
				const fallback = t("noResponseReceived");
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
					// 需要顺序创建并把 parent 映射为后端数值 id
					const clientIdToApiId = new Map<string, number>();
					let successCount = 0;
					for (const draft of payloads) {
						const clientId = draft.id ?? createId();
						const parentClientId = draft.parentTodoId;
						const apiParentId =
							typeof parentClientId === "string"
								? (clientIdToApiId.get(parentClientId) ?? null)
								: (parentClientId ?? null);

						// Create payload without the temporary string ID
						const { id: _tempId, ...createPayload } = draft;
						const created = await createTodo({
							...createPayload,
							// 若父任务未成功创建，则降级为根任务（避免整棵子树丢失）
							parentTodoId: apiParentId,
						});
						if (created) {
							clientIdToApiId.set(clientId, created.id);
							successCount += 1;
						}
					}

					const addedText = t("addedTodos", { count: successCount });
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
			const fallback = t("errorOccurred");
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
		editSystemPrompt,
		effectiveTodos,
		hasSelection,
		inputValue,
		isStreaming,
		parsePlanTodos,
		planSystemPrompt,
		t,
		tCommon,
		todos,
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
