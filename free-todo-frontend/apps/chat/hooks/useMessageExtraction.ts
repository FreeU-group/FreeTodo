import { useTranslations } from "next-intl";
import { useCallback, useRef, useState } from "react";
import type { ChatMessage } from "@/apps/chat/types";
import { buildHierarchicalTodoContext } from "@/apps/chat/utils/todoContext";
import { toastError } from "@/lib/toast";
import type { Todo } from "@/lib/types";

export type ExtractionState = {
	isExtracting: boolean;
	todos: Array<{
		name: string;
		description?: string | null;
		tags: string[];
	}>;
	parentTodoId: number | null;
};

type UseMessageExtractionParams = {
	effectiveTodos: Todo[];
	allTodos: Todo[];
};

/**
 * 管理消息的待办提取功能
 */
export function useMessageExtraction({
	effectiveTodos,
	allTodos,
}: UseMessageExtractionParams) {
	const t = useTranslations("chat");
	const tCommon = useTranslations("common");
	const [extractionStates, setExtractionStates] = useState<
		Map<string, ExtractionState>
	>(new Map());
	const extractionStatesRef = useRef<Map<string, ExtractionState>>(new Map());

	// 同步 ref 和 state
	const updateExtractionStates = useCallback(
		(
			updater: (
				prev: Map<string, ExtractionState>,
			) => Map<string, ExtractionState>,
		) => {
			setExtractionStates((prev) => {
				const newMap = updater(prev);
				extractionStatesRef.current = newMap;
				return newMap;
			});
		},
		[],
	);

	const handleExtractTodos = useCallback(
		async (messageId: string, messages: ChatMessage[]) => {
			const currentState = extractionStatesRef.current.get(messageId);
			if (currentState?.isExtracting) return;

			// 获取目标消息及其之前的所有消息
			const targetIndex = messages.findIndex((m) => m.id === messageId);
			const messagesForExtraction = messages
				.slice(0, targetIndex + 1)
				.map((msg) => ({
					role: msg.role,
					content: msg.content,
				}));

			// 获取父待办ID（使用第一个关联的待办）
			const parentTodoId =
				effectiveTodos.length > 0 ? effectiveTodos[0].id : null;

			// 构建待办上下文
			const todoContext =
				effectiveTodos.length > 0
					? buildHierarchicalTodoContext(effectiveTodos, allTodos, t, tCommon)
					: null;

			// 设置提取状态
			updateExtractionStates((prev) => {
				const newMap = new Map(prev);
				newMap.set(messageId, {
					isExtracting: true,
					todos: [],
					parentTodoId,
				});
				return newMap;
			});

			try {
				// 客户端使用相对路径，通过 Next.js rewrites 代理到后端（支持动态端口）
				const response = await fetch(`/api/chat/extract-todos-from-messages`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						messages: messagesForExtraction,
						parent_todo_id: parentTodoId,
						todo_context: todoContext,
					}),
				});

				if (!response.ok) {
					// 尝试从响应中获取错误信息
					let errorMessage = `提取待办失败 (${response.status})`;
					try {
						const errorData = await response.json();
						if (errorData.detail) {
							errorMessage = errorData.detail;
						} else if (errorData.error_message) {
							errorMessage = errorData.error_message;
						} else if (errorData.message) {
							errorMessage = errorData.message;
						}
					} catch {
						// 如果无法解析 JSON，使用状态文本
						errorMessage = `提取待办失败: ${response.statusText || response.status}`;
					}
					throw new Error(errorMessage);
				}

				const data = await response.json();

				if (data.error_message) {
					toastError(data.error_message);
					updateExtractionStates((prev) => {
						const newMap = new Map(prev);
						newMap.delete(messageId);
						return newMap;
					});
					return;
				}

				if (data.todos.length === 0) {
					toastError(t("noTodosFound") || "未发现待办事项");
					updateExtractionStates((prev) => {
						const newMap = new Map(prev);
						newMap.delete(messageId);
						return newMap;
					});
					return;
				}

				// 转换格式并模拟流式显示
				const extractedTodos = data.todos.map(
					(todo: {
						name: string;
						description?: string | null;
						tags?: string[];
					}) => ({
						name: todo.name,
						description: todo.description || null,
						tags: todo.tags || [],
					}),
				);

				// 模拟流式显示：逐个添加待办
				for (let i = 0; i < extractedTodos.length; i++) {
					await new Promise((resolve) => setTimeout(resolve, 200));
					updateExtractionStates((prev) => {
						const newMap = new Map(prev);
						const current = newMap.get(messageId);
						if (current) {
							newMap.set(messageId, {
								...current,
								todos: extractedTodos.slice(0, i + 1),
							});
						}
						return newMap;
					});
				}

				// 提取完成
				updateExtractionStates((prev) => {
					const newMap = new Map(prev);
					const current = newMap.get(messageId);
					if (current) {
						newMap.set(messageId, {
							...current,
							isExtracting: false,
						});
					}
					return newMap;
				});
			} catch (error) {
				console.error("提取待办失败:", error);
				toastError(
					error instanceof Error ? error.message : "提取待办失败，请稍后重试",
				);
				updateExtractionStates((prev) => {
					const newMap = new Map(prev);
					newMap.delete(messageId);
					return newMap;
				});
			}
		},
		[effectiveTodos, allTodos, t, tCommon, updateExtractionStates],
	);

	const removeExtractionState = useCallback(
		(messageId: string) => {
			updateExtractionStates((prev) => {
				const newMap = new Map(prev);
				newMap.delete(messageId);
				return newMap;
			});
		},
		[updateExtractionStates],
	);

	return {
		extractionStates,
		handleExtractTodos,
		removeExtractionState,
	};
}
