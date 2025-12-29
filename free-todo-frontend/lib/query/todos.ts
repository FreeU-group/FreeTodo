"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
	createTodoApiTodosPost,
	deleteTodoApiTodosTodoIdDelete,
	reorderTodosApiTodosReorderPost,
	updateTodoApiTodosTodoIdPut,
	useListTodosApiTodosGet,
} from "@/lib/generated/todos/todos";
import type {
	CreateTodoInput,
	Todo,
	TodoListResponse,
	TodoPriority,
	TodoStatus,
	UpdateTodoInput,
} from "@/lib/types";
import { queryKeys } from "./keys";

// ============================================================================
// Helper Functions
// ============================================================================

const normalizePriority = (priority: unknown): TodoPriority => {
	if (priority === "high" || priority === "medium" || priority === "low") {
		return priority;
	}
	return "none";
};

const normalizeStatus = (status: unknown): TodoStatus => {
	if (status === "completed" || status === "canceled" || status === "draft")
		return status;
	return "active";
};

function normalizeDeadline(
	deadline?: string | null,
): string | null | undefined {
	// 如果 deadline 为 null 或 undefined，返回 null（显式清空）
	if (deadline === null || deadline === undefined) return null;
	// 兼容 <input type="date"> 的 YYYY-MM-DD（后端期望 datetime）
	if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
		return `${deadline}T00:00:00`;
	}
	return deadline;
}

/**
 * Normalize API response to ensure consistent Todo type
 * Now that fetcher auto-converts snake_case -> camelCase, we just need to normalize some optional fields
 */
function normalizeTodo(raw: Record<string, unknown>): Todo {
	return {
		id: raw.id as number,
		name: raw.name as string,
		description: (raw.description as string) ?? undefined,
		userNotes: (raw.userNotes as string) ?? undefined,
		status: normalizeStatus(raw.status),
		priority: normalizePriority(raw.priority),
		deadline: (raw.deadline as string) ?? undefined,
		startTime: (raw.startTime as string) ?? undefined,
		order: (raw.order as number) ?? 0,
		tags: (raw.tags as string[]) ?? [],
		attachments: (raw.attachments as Todo["attachments"]) ?? [],
		parentTodoId:
			raw.parentTodoId === null || raw.parentTodoId === undefined
				? null
				: (raw.parentTodoId as number),
		relatedActivities: (raw.relatedActivities as number[]) ?? [],
		createdAt: raw.createdAt as string,
		updatedAt: raw.updatedAt as string,
	};
}

// ============================================================================
// Query Hooks
// ============================================================================

interface UseTodosParams {
	status?: string;
	limit?: number;
	offset?: number;
}

/**
 * 获取 Todo 列表的 Query Hook
 * 使用 Orval 生成的 hook
 */
export function useTodos(params?: UseTodosParams) {
	return useListTodosApiTodosGet(
		{
			limit: params?.limit ?? 2000,
			offset: params?.offset ?? 0,
			status: params?.status,
		},
		{
			query: {
				queryKey: queryKeys.todos.list(params),
				staleTime: 30 * 1000, // 30 秒内数据被认为是新鲜的
				select: (data: unknown) => {
					// Data is now auto-converted to camelCase by the fetcher
					const response = data as TodoListResponse;
					const todos = response?.todos ?? [];
					return todos.map((raw) =>
						normalizeTodo(raw as unknown as Record<string, unknown>),
					);
				},
			},
		},
	);
}

// ============================================================================
// Mutation Hooks
// ============================================================================

// 防抖更新相关的全局状态
const pendingUpdateTimers = new Map<number, ReturnType<typeof setTimeout>>();
const pendingUpdatePayloads = new Map<number, UpdateTodoInput>();

/**
 * 创建 Todo 的 Mutation Hook
 */
export function useCreateTodo() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (input: CreateTodoInput) => {
			// Fetcher will auto-convert camelCase -> snake_case for request
			// and snake_case -> camelCase for response
			const payload = {
				name: input.name,
				description: input.description,
				userNotes: input.userNotes,
				parentTodoId: input.parentTodoId ?? null,
				deadline: normalizeDeadline(input.deadline),
				startTime: input.startTime,
				status: input.status ?? "active",
				priority: input.priority ?? "none",
				order: input.order ?? 0,
				tags: input.tags ?? [],
				relatedActivities: input.relatedActivities ?? [],
			};
			const created = await createTodoApiTodosPost(payload as never);
			return normalizeTodo(created as unknown as Record<string, unknown>);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
		},
	});
}

interface UpdateTodoParams {
	id: number;
	input: UpdateTodoInput;
}

/**
 * 更新 Todo 的 Mutation Hook
 * 支持乐观更新和防抖（针对描述和备注字段）
 */
export function useUpdateTodo() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, input }: UpdateTodoParams) => {
			const keys = Object.keys(input);
			const shouldDebounce =
				keys.length > 0 &&
				keys.every((k) => k === "description" || k === "userNotes");

			// 合并同一 todo 的待发送 payload
			const merged: UpdateTodoInput = {
				...(pendingUpdatePayloads.get(id) ?? {}),
				...input,
			};
			pendingUpdatePayloads.set(id, merged);

			// 如果需要防抖，返回一个 Promise 延迟执行
			if (shouldDebounce) {
				return new Promise<Todo>((resolve, reject) => {
					const existingTimer = pendingUpdateTimers.get(id);
					if (existingTimer) clearTimeout(existingTimer);

					const timer = setTimeout(async () => {
						pendingUpdateTimers.delete(id);
						const body = pendingUpdatePayloads.get(id);
						pendingUpdatePayloads.delete(id);
						if (!body || Object.keys(body).length === 0) {
							const cachedData = queryClient.getQueryData<TodoListResponse>(
								queryKeys.todos.list(),
							);
							const todos = cachedData?.todos ?? [];
							const todo = todos.find((t) => t.id === id);
							if (todo) {
								resolve(todo);
							} else {
								reject(new Error("Todo not found"));
							}
							return;
						}

						try {
							// Build payload with normalized deadline
							const payload = {
								...body,
								deadline: normalizeDeadline(body.deadline),
							};
							const updated = await updateTodoApiTodosTodoIdPut(
								id,
								payload as never,
							);
							resolve(
								normalizeTodo(updated as unknown as Record<string, unknown>),
							);
						} catch (err) {
							reject(err);
						}
					}, 500);
					pendingUpdateTimers.set(id, timer);
				});
			}

			// 非防抖字段立即更新
			const body = pendingUpdatePayloads.get(id);
			pendingUpdatePayloads.delete(id);
			if (!body || Object.keys(body).length === 0) {
				throw new Error("No fields to update");
			}

			// Build payload with normalized deadline
			const payload = {
				...body,
				deadline: normalizeDeadline(body.deadline),
			};
			const updated = await updateTodoApiTodosTodoIdPut(id, payload as never);
			return normalizeTodo(updated as unknown as Record<string, unknown>);
		},
		onMutate: async ({ id, input }) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.todos.all });

			const previousData = queryClient.getQueryData<TodoListResponse>(
				queryKeys.todos.list(),
			);

			// 乐观更新
			queryClient.setQueryData(
				queryKeys.todos.list(),
				(old: TodoListResponse | undefined) => {
					if (!old || !old.todos) return old;
					const updatedTodos = old.todos.map((todo) => {
						if (todo.id === id) {
							return {
								...todo,
								...input,
								priority: normalizePriority(input.priority ?? todo.priority),
								status: normalizeStatus(input.status ?? todo.status),
								updatedAt: new Date().toISOString(),
							};
						}
						return todo;
					});
					return { ...old, todos: updatedTodos };
				},
			);

			return { previousData };
		},
		onError: (_err, _variables, context) => {
			if (context?.previousData) {
				queryClient.setQueryData(queryKeys.todos.list(), context.previousData);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
		},
	});
}

/**
 * 删除 Todo 的 Mutation Hook
 */
export function useDeleteTodo() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: number) => {
			await deleteTodoApiTodosTodoIdDelete(id);
			return id;
		},
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.todos.all });

			const previousData = queryClient.getQueryData<TodoListResponse>(
				queryKeys.todos.list(),
			);

			const previousTodos = previousData?.todos ?? [];

			// 递归查找所有子任务 ID
			const findAllChildIds = (
				parentId: number,
				allTodos: Todo[],
			): number[] => {
				const childIds: number[] = [];
				const children = allTodos.filter((t) => t.parentTodoId === parentId);
				for (const child of children) {
					childIds.push(child.id);
					childIds.push(...findAllChildIds(child.id, allTodos));
				}
				return childIds;
			};

			const allIdsToDelete = [id, ...findAllChildIds(id, previousTodos)];
			const idsToDeleteSet = new Set(allIdsToDelete);

			// 乐观更新
			queryClient.setQueryData(
				queryKeys.todos.list(),
				(old: TodoListResponse | undefined) => {
					if (!old || !old.todos) return old;
					const updatedTodos = old.todos.filter(
						(todo) => !idsToDeleteSet.has(todo.id),
					);
					return {
						...old,
						todos: updatedTodos,
						total: updatedTodos.length,
					};
				},
			);

			return { previousData, deletedIds: allIdsToDelete };
		},
		onError: (_err, _id, context) => {
			if (context?.previousData) {
				queryClient.setQueryData(queryKeys.todos.list(), context.previousData);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
		},
	});
}

/**
 * 切换 Todo 状态的 Mutation Hook
 */
export function useToggleTodoStatus() {
	const queryClient = useQueryClient();
	const updateMutation = useUpdateTodo();

	return useMutation({
		mutationFn: async (id: number) => {
			const cachedData = queryClient.getQueryData<TodoListResponse>(
				queryKeys.todos.list(),
			);
			const todos = cachedData?.todos ?? [];
			const todo = todos.find((t) => t.id === id);
			if (!todo) throw new Error("Todo not found");

			const nextStatus: TodoStatus =
				todo.status === "completed"
					? "active"
					: todo.status === "canceled"
						? "canceled"
						: todo.status === "draft"
							? "active"
							: "completed";

			return updateMutation.mutateAsync({ id, input: { status: nextStatus } });
		},
	});
}

/**
 * 重排序参数
 */
export interface ReorderTodoItem {
	id: number;
	order: number;
	parentTodoId?: number | null;
}

/**
 * 批量重排序 Todo 的 Mutation Hook
 */
export function useReorderTodos() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (items: ReorderTodoItem[]) => {
			// Fetcher will auto-convert camelCase -> snake_case
			return reorderTodosApiTodosReorderPost({ items } as never);
		},
		onMutate: async (items) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.todos.all });

			const previousData = queryClient.getQueryData<TodoListResponse>(
				queryKeys.todos.list(),
			);

			// 乐观更新
			queryClient.setQueryData(
				queryKeys.todos.list(),
				(old: TodoListResponse | undefined) => {
					if (!old || !old.todos) return old;
					const updatedTodos = old.todos.map((todo) => {
						const item = items.find((i) => i.id === todo.id);
						if (item) {
							return {
								...todo,
								order: item.order,
								...(item.parentTodoId !== undefined
									? { parentTodoId: item.parentTodoId }
									: {}),
								updatedAt: new Date().toISOString(),
							};
						}
						return todo;
					});
					return { ...old, todos: updatedTodos };
				},
			);

			return { previousData };
		},
		onError: (_err, _variables, context) => {
			if (context?.previousData) {
				queryClient.setQueryData(queryKeys.todos.list(), context.previousData);
			}
		},
		onSettled: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
		},
	});
}

// ============================================================================
// 组合 Hook：提供完整的 Todo 操作能力
// ============================================================================

/**
 * 提供所有 Todo Mutation 操作的组合 Hook
 */
export function useTodoMutations() {
	const createMutation = useCreateTodo();
	const updateMutation = useUpdateTodo();
	const deleteMutation = useDeleteTodo();
	const toggleStatusMutation = useToggleTodoStatus();
	const reorderMutation = useReorderTodos();

	return {
		createTodo: createMutation.mutateAsync,
		updateTodo: (id: number, input: UpdateTodoInput) =>
			updateMutation.mutateAsync({ id, input }),
		deleteTodo: deleteMutation.mutateAsync,
		toggleTodoStatus: toggleStatusMutation.mutateAsync,
		reorderTodos: reorderMutation.mutateAsync,
		isCreating: createMutation.isPending,
		isUpdating: updateMutation.isPending,
		isDeleting: deleteMutation.isPending,
		isReordering: reorderMutation.isPending,
		createError: createMutation.error,
		updateError: updateMutation.error,
		deleteError: deleteMutation.error,
		reorderError: reorderMutation.error,
	};
}
