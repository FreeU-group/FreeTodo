"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type {
	TodoCreate,
	TodoListResponse,
	TodoReorderRequest,
	TodoResponse,
	TodoUpdate,
} from "@/lib/generated/schemas";
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
	TodoAttachment,
	TodoPriority,
	TodoStatus,
	UpdateTodoInput,
} from "@/lib/types/todo";
import { queryKeys } from "./keys";

// 使用生成的类型作为 API 类型
type ApiTodo = TodoResponse;

// ============================================================================
// 类型转换工具函数
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

function toApiId(id: string): number {
	const n = Number.parseInt(id, 10);
	if (Number.isNaN(n)) {
		throw new Error(`Invalid todo id: ${id}`);
	}
	return n;
}

function toNumberList(values?: string[]): number[] {
	if (!values?.length) return [];
	return values
		.map((v) => Number.parseInt(v, 10))
		.filter((n) => Number.isFinite(n));
}

function normalizeDeadline(deadline?: string): string | undefined {
	if (!deadline) return undefined;
	// 兼容 <input type="date"> 的 YYYY-MM-DD（后端期望 datetime）
	if (/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
		return `${deadline}T00:00:00`;
	}
	return deadline;
}

function mapAttachments(apiTodo: ApiTodo): TodoAttachment[] {
	const list = apiTodo.attachments ?? [];
	return list.map((a) => ({
		id: String(a.id),
		fileName: a.file_name,
		filePath: a.file_path,
		fileSize: a.file_size ?? undefined,
		mimeType: a.mime_type ?? undefined,
	}));
}

/**
 * 将 API 返回的 Todo 转换为前端 Todo 类型
 */
export function fromApiTodo(apiTodo: ApiTodo): Todo {
	return {
		id: String(apiTodo.id),
		name: apiTodo.name,
		description: apiTodo.description ?? undefined,
		userNotes: apiTodo.user_notes ?? undefined,
		status: normalizeStatus(apiTodo.status),
		priority: normalizePriority(apiTodo.priority),
		deadline: apiTodo.deadline ?? undefined,
		startTime: apiTodo.start_time ?? undefined,
		order: apiTodo.order ?? 0,
		tags: apiTodo.tags ?? [],
		attachments: mapAttachments(apiTodo),
		parentTodoId:
			apiTodo.parent_todo_id === null || apiTodo.parent_todo_id === undefined
				? null
				: String(apiTodo.parent_todo_id),
		relatedActivities: (apiTodo.related_activities ?? []).map(String),
		createdAt: apiTodo.created_at,
		updatedAt: apiTodo.updated_at,
	};
}

/**
 * 将前端 CreateTodoInput 转换为 API 请求参数
 */
function toCreateTodoPayload(input: CreateTodoInput) {
	return {
		name: input.name,
		description: input.description,
		user_notes: input.userNotes,
		parent_todo_id: input.parentTodoId ? toApiId(input.parentTodoId) : null,
		deadline: normalizeDeadline(input.deadline),
		start_time: input.startTime,
		status: input.status ?? "active",
		priority: input.priority ?? "none",
		order: input.order ?? 0,
		tags: input.tags ?? [],
		related_activities: toNumberList(input.relatedActivities),
	};
}

/**
 * 将前端 UpdateTodoInput 转换为 API 请求参数
 */
function toUpdateTodoPayload(input: UpdateTodoInput): Record<string, unknown> {
	const payload: Record<string, unknown> = {};
	const has = (k: keyof UpdateTodoInput) => Object.hasOwn(input, k);

	if (has("name")) payload.name = input.name ?? null;
	if (has("description")) payload.description = input.description ?? null;
	if (has("userNotes")) payload.user_notes = input.userNotes ?? null;
	if (has("status")) payload.status = input.status ?? null;
	if (has("priority")) payload.priority = input.priority ?? null;
	if (has("deadline"))
		payload.deadline = input.deadline
			? normalizeDeadline(input.deadline)
			: null;
	if (has("startTime")) payload.start_time = input.startTime ?? null;
	if (has("order")) payload.order = input.order ?? 0;
	if (has("tags")) payload.tags = input.tags ?? [];
	if (has("parentTodoId"))
		payload.parent_todo_id = input.parentTodoId
			? toApiId(input.parentTodoId)
			: null;
	if (has("relatedActivities"))
		payload.related_activities = toNumberList(input.relatedActivities);

	return payload;
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
				select: (data: TodoListResponse) => {
					// 转换 API 数据为前端格式
					const todos = data?.todos ?? [];
					return todos.map(fromApiTodo);
				},
			},
		},
	);
}

// ============================================================================
// Mutation Hooks
// ============================================================================

// 防抖更新相关的全局状态
const pendingUpdateTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingUpdatePayloads = new Map<string, Record<string, unknown>>();

/**
 * 创建 Todo 的 Mutation Hook
 * 包装 Orval 生成的 hook，接受 CreateTodoInput 参数
 */
export function useCreateTodo() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (input: CreateTodoInput) => {
			const payload = toCreateTodoPayload(input);
			const created = await createTodoApiTodosPost(payload as TodoCreate);
			return fromApiTodo(created);
		},
		onSuccess: () => {
			// 创建成功后使 todos 列表缓存失效
			queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
		},
	});
}

interface UpdateTodoParams {
	id: string;
	input: UpdateTodoInput;
}

/**
 * 更新 Todo 的 Mutation Hook
 * 支持乐观更新和防抖（针对描述和备注字段）
 * 使用 Orval 生成的 API 函数，但保留业务逻辑
 */
export function useUpdateTodo() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ id, input }: UpdateTodoParams) => {
			const payload = toUpdateTodoPayload(input);
			const keys = Object.keys(payload);
			const shouldDebounce =
				keys.length > 0 &&
				keys.every((k) => k === "description" || k === "user_notes");

			// 合并同一 todo 的待发送 payload
			const merged = {
				...(pendingUpdatePayloads.get(id) ?? {}),
				...payload,
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
							// 没有要更新的内容，返回当前缓存的 todo
							const cached = queryClient.getQueryData<Todo[]>(
								queryKeys.todos.list(),
							);
							const todo = cached?.find((t) => t.id === id);
							if (todo) {
								resolve(todo);
							} else {
								reject(new Error("Todo not found"));
							}
							return;
						}

						try {
							// 使用 Orval 生成的 API 函数
							const updated = await updateTodoApiTodosTodoIdPut(
								toApiId(id),
								body as TodoUpdate,
							);
							resolve(fromApiTodo(updated));
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

			// 使用 Orval 生成的 API 函数
			const updated = await updateTodoApiTodosTodoIdPut(
				toApiId(id),
				body as TodoUpdate,
			);
			return fromApiTodo(updated);
		},
		onMutate: async ({ id, input }) => {
			// 取消正在进行的 todos 查询
			await queryClient.cancelQueries({ queryKey: queryKeys.todos.all });

			// 保存之前的数据用于回滚
			// 注意：query cache 中存储的是原始 API 响应 { total, todos: TodoResponse[] }
			// 但 useTodos 使用了 select 转换，所以我们需要获取转换后的数据
			const previousData = queryClient.getQueryData<TodoListResponse>(
				queryKeys.todos.list(),
			);

			// 获取转换后的 todos 数组（通过 select 函数）
			let previousTodos: Todo[] | undefined;
			if (previousData && Array.isArray(previousData.todos)) {
				previousTodos = previousData.todos.map(fromApiTodo);
			}

			// 乐观更新 - 更新原始 API 响应结构
			queryClient.setQueryData(
				queryKeys.todos.list(),
				(old: TodoListResponse | undefined) => {
					if (!old) return old;

					// 处理原始 API 响应结构 { total, todos: TodoResponse[] }
					if (old && "todos" in old && Array.isArray(old.todos)) {
						const updatedTodos = old.todos.map((todo: TodoResponse) => {
							// 如果是 TodoResponse，需要先转换
							const todoId = String(todo.id ?? todo.id);
							if (todoId === id) {
								// 转换 API todo 为前端 todo，然后应用更新
								const frontendTodo = fromApiTodo(todo);
								return {
									...todo, // 保持原始 API 结构
									description:
										input.description ??
										frontendTodo.description ??
										todo.description,
									user_notes:
										input.userNotes ??
										frontendTodo.userNotes ??
										todo.user_notes,
									name: input.name ?? frontendTodo.name ?? todo.name,
									status: input.status ?? frontendTodo.status ?? todo.status,
									priority:
										input.priority ?? frontendTodo.priority ?? todo.priority,
									updated_at: new Date().toISOString(),
								};
							}
							return todo;
						});
						return {
							...old,
							todos: updatedTodos,
						};
					}

					// 向后兼容：如果是数组格式（不应该发生，但为了安全）
					if (Array.isArray(old)) {
						const updated = old.map((todo: Todo) =>
							todo.id === id
								? {
										...todo,
										...input,
										priority: normalizePriority(
											input.priority ?? todo.priority,
										),
										status: input.status ?? todo.status,
										updatedAt: new Date().toISOString(),
									}
								: todo,
						);
						return updated;
					}

					return old;
				},
			);

			return { previousTodos };
		},
		onError: (_err, _variables, context) => {
			// 发生错误时回滚
			if (context?.previousTodos) {
				queryClient.setQueryData(queryKeys.todos.list(), context.previousTodos);
			}
		},
		onSettled: () => {
			// 无论成功失败，都重新获取最新数据
			queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
		},
	});
}

/**
 * 删除 Todo 的 Mutation Hook
 * 使用 Orval 生成的 API 函数，保留乐观更新逻辑
 */
export function useDeleteTodo() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (id: string) => {
			// 使用 Orval 生成的 API 函数
			await deleteTodoApiTodosTodoIdDelete(toApiId(id));
			return id;
		},
		onMutate: async (id) => {
			await queryClient.cancelQueries({ queryKey: queryKeys.todos.all });

			const previousTodos = queryClient.getQueryData<Todo[]>(
				queryKeys.todos.list(),
			);

			// 递归查找所有子任务 ID
			const findAllChildIds = (
				parentId: string,
				allTodos: Todo[],
			): string[] => {
				const childIds: string[] = [];
				const children = allTodos.filter((t) => t.parentTodoId === parentId);
				for (const child of children) {
					childIds.push(child.id);
					childIds.push(...findAllChildIds(child.id, allTodos));
				}
				return childIds;
			};

			const allIdsToDelete =
				previousTodos && Array.isArray(previousTodos)
					? [id, ...findAllChildIds(id, previousTodos)]
					: [id];
			const idsToDeleteSet = new Set(allIdsToDelete);

			// 乐观更新：移除 todo 及其所有子任务
			queryClient.setQueryData<Todo[]>(queryKeys.todos.list(), (old) => {
				if (!old || !Array.isArray(old)) return old;
				return old.filter((t) => !idsToDeleteSet.has(t.id));
			});

			return { previousTodos, deletedIds: allIdsToDelete };
		},
		onError: (_err, _id, context) => {
			if (context?.previousTodos) {
				queryClient.setQueryData(queryKeys.todos.list(), context.previousTodos);
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
		mutationFn: async (id: string) => {
			const todos = queryClient.getQueryData<Todo[]>(queryKeys.todos.list());
			const todo = todos?.find((t) => t.id === id);
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
	id: string;
	order: number;
	parentTodoId?: string | null;
}

/**
 * 批量重排序 Todo 的 Mutation Hook
 * 支持更新 order 和 parentTodoId
 * 使用 Orval 生成的 API 函数，保留乐观更新逻辑
 */
export function useReorderTodos() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (items: ReorderTodoItem[]) => {
			// 转换为 API 格式
			const apiItems = items.map((item) => ({
				id: toApiId(item.id),
				order: item.order,
				...(item.parentTodoId !== undefined
					? {
							parent_todo_id: item.parentTodoId
								? toApiId(item.parentTodoId)
								: null,
						}
					: {}),
			}));
			// 使用 Orval 生成的 API 函数
			return reorderTodosApiTodosReorderPost({
				items: apiItems,
			} as TodoReorderRequest);
		},
		onMutate: async (items) => {
			// 取消正在进行的 todos 查询
			await queryClient.cancelQueries({ queryKey: queryKeys.todos.all });

			// 保存之前的数据用于回滚
			const previousTodos = queryClient.getQueryData<Todo[]>(
				queryKeys.todos.list(),
			);

			// 乐观更新
			queryClient.setQueryData<Todo[]>(queryKeys.todos.list(), (old) => {
				if (!old || !Array.isArray(old)) return old;
				return old.map((todo) => {
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
			});

			return { previousTodos };
		},
		onError: (_err, _variables, context) => {
			// 发生错误时回滚
			if (context?.previousTodos) {
				queryClient.setQueryData(queryKeys.todos.list(), context.previousTodos);
			}
		},
		onSettled: () => {
			// 无论成功失败，都重新获取最新数据
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
		updateTodo: (id: string, input: UpdateTodoInput) =>
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
