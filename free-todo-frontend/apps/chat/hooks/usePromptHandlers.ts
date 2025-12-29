import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { flushSync } from "react-dom";
import type { ChatMessage, ParsedTodoTree } from "@/apps/chat/types";
import { createId } from "@/apps/chat/utils/id";
import {
	buildHierarchicalTodoContext,
	buildTodoContextBlock,
} from "@/apps/chat/utils/todoContext";
import { sendChatMessageStream } from "@/lib/api";
import type { CreateTodoInput, Todo } from "@/lib/types";

type UsePromptHandlersParams = {
	chatMode: string;
	isStreaming: boolean;
	planSystemPrompt: string;
	editSystemPrompt: string;
	hasSelection: boolean;
	effectiveTodos: Todo[];
	todos: Todo[];
	conversationId: string | null;
	setConversationId: (id: string | null) => void;
	setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
	setIsStreaming: (streaming: boolean) => void;
	setError: (error: string | null) => void;
	parsePlanTodos: (content: string) => {
		todos: ParsedTodoTree[];
		error: string | null;
	};
	buildTodoPayloads: (trees: ParsedTodoTree[]) => (Omit<
		CreateTodoInput,
		"parentTodoId"
	> & {
		id?: string;
		parentTodoId?: string | number | null;
	})[];
	createTodoWithResult: (input: CreateTodoInput) => Promise<Todo | null>;
};

export const usePromptHandlers = ({
	chatMode,
	isStreaming,
	planSystemPrompt,
	editSystemPrompt,
	hasSelection,
	effectiveTodos,
	todos,
	conversationId,
	setConversationId,
	setMessages,
	setIsStreaming,
	setError,
	parsePlanTodos,
	buildTodoPayloads,
	createTodoWithResult,
}: UsePromptHandlersParams) => {
	const tChat = useTranslations("chat");
	const tCommon = useTranslations("common");

	// 验证 prompt 输入和检查系统提示词是否已加载
	const validatePromptInput = useCallback(
		(text: string): boolean => {
			if (!text || isStreaming) return false;

			if (chatMode === "plan" && !planSystemPrompt) {
				setError(tChat("promptNotLoaded") || "提示词正在加载中，请稍候...");
				return false;
			}
			if (chatMode === "edit" && !editSystemPrompt) {
				setError(tChat("promptNotLoaded") || "提示词正在加载中，请稍候...");
				return false;
			}

			setError(null);
			return true;
		},
		[
			isStreaming,
			chatMode,
			planSystemPrompt,
			editSystemPrompt,
			setError,
			tChat,
		],
	);

	// 构建消息负载（根据聊天模式）
	const buildPayloadMessage = useCallback(
		(text: string): string => {
			const todoContext = hasSelection
				? buildHierarchicalTodoContext(effectiveTodos, todos, tChat, tCommon)
				: buildTodoContextBlock([], tChat("noTodoContext"), tChat);
			const userLabel = tChat("userInput");

			if (chatMode === "plan") {
				return `${planSystemPrompt}\n\n${userLabel}: ${text}`;
			}
			if (chatMode === "edit") {
				return `${editSystemPrompt}\n\n${todoContext}\n\n${userLabel}: ${text}`;
			}
			if (chatMode === "difyTest") {
				return text;
			}
			// Ask mode
			return `${todoContext}\n\n${userLabel}: ${text}`;
		},
		[
			chatMode,
			planSystemPrompt,
			editSystemPrompt,
			hasSelection,
			effectiveTodos,
			todos,
			tChat,
			tCommon,
		],
	);

	// 更新助手消息内容的辅助函数
	const updateAssistantMessage = useCallback(
		(assistantMessageId: string, content: string) => {
			setMessages((prev) =>
				prev.map((msg) =>
					msg.id === assistantMessageId ? { ...msg, content } : msg,
				),
			);
		},
		[setMessages],
	);

	// 处理 plan 模式的响应：解析并创建 todos
	const handlePlanModeResponse = useCallback(
		async (
			assistantContent: string,
			assistantMessageId: string,
		): Promise<void> => {
			const { todos: parsedTodos, error: parseError } =
				parsePlanTodos(assistantContent);

			if (parseError) {
				updateAssistantMessage(
					assistantMessageId,
					`${assistantContent}\n\n${parseError}`,
				);
				setError(parseError);
				return;
			}

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
				const created = await createTodoWithResult({
					...createPayload,
					// 若父任务未成功创建，则降级为根任务（避免整棵子树丢失）
					parentTodoId: apiParentId,
				});

				if (created) {
					clientIdToApiId.set(clientId, created.id);
					successCount += 1;
				}
			}

			const addedText = tChat("addedTodos", { count: successCount });
			updateAssistantMessage(
				assistantMessageId,
				`${assistantContent}\n\n${addedText}`,
			);
		},
		[
			parsePlanTodos,
			buildTodoPayloads,
			createTodoWithResult,
			updateAssistantMessage,
			setError,
			tChat,
		],
	);

	// 处理流式响应
	const handleStreamingResponse = useCallback(
		async (
			payloadMessage: string,
			assistantMessageId: string,
		): Promise<string> => {
			let assistantContent = "";
			const modeForBackend = chatMode === "difyTest" ? "dify_test" : chatMode;

			await sendChatMessageStream(
				{
					message: payloadMessage,
					conversationId: conversationId || undefined,
					// 当发送格式化消息（包含todo上下文）时，设置useRag=false
					useRag: false,
					mode: modeForBackend,
				},
				(chunk) => {
					assistantContent += chunk;
					// 使用 flushSync 强制同步更新，确保流式输出效果
					flushSync(() => {
						updateAssistantMessage(assistantMessageId, assistantContent);
					});
				},
				(sessionId) => {
					setConversationId(conversationId || sessionId);
				},
			);

			return assistantContent;
		},
		[chatMode, conversationId, setConversationId, updateAssistantMessage],
	);

	// 处理预设prompt选择：直接发送消息，不设置到输入框
	const handleSelectPrompt = useCallback(
		async (prompt: string) => {
			const text = prompt.trim();
			if (!validatePromptInput(text)) return;

			const payloadMessage = buildPayloadMessage(text);

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

			try {
				const assistantContent = await handleStreamingResponse(
					payloadMessage,
					assistantMessageId,
				);

				if (!assistantContent) {
					const fallback = tChat("noResponseReceived");
					updateAssistantMessage(assistantMessageId, fallback);
				} else if (chatMode === "plan") {
					await handlePlanModeResponse(assistantContent, assistantMessageId);
				}
			} catch (err) {
				console.error(err);
				const fallback = tChat("errorOccurred");
				updateAssistantMessage(assistantMessageId, fallback);
				setError(fallback);
			} finally {
				setIsStreaming(false);
			}
		},
		[
			validatePromptInput,
			buildPayloadMessage,
			handleStreamingResponse,
			handlePlanModeResponse,
			chatMode,
			setMessages,
			setIsStreaming,
			setError,
			tChat,
			updateAssistantMessage,
		],
	);

	return {
		handleSelectPrompt,
	};
};
