import { create } from "zustand";
import {
	type ApiTodo,
	createTodo,
	deleteTodoApi,
	getTodos,
	updateTodoApi,
} from "@/lib/api";
import type {
	CreateTodoInput,
	Todo,
	TodoAttachment,
	TodoPriority,
	TodoStatus,
	UpdateTodoInput,
} from "@/lib/types/todo";

interface TodoStoreState {
	todos: Todo[];
	selectedTodoId: string | null;
	selectedTodoIds: string[];
	collapsedTodoIds: Set<string>;
	hydrated: boolean;
	isSyncing: boolean;
	syncError: string | null;
	hydrate: () => Promise<void>;
	refreshTodos: () => Promise<void>;
	/**
	 * 创建 todo 并返回后端创建结果（用于需要拿到后端 id 的场景，如 plan 模式的父子任务）
	 */
	createTodoWithResult: (input: CreateTodoInput) => Promise<Todo | null>;
	addTodo: (input: CreateTodoInput) => Promise<void>;
	updateTodo: (id: string, input: UpdateTodoInput) => Promise<void>;
	deleteTodo: (id: string) => Promise<void>;
	toggleTodoStatus: (id: string) => Promise<void>;
	reorderTodos: (newOrder: string[]) => void;
	setSelectedTodoId: (id: string | null) => void;
	setSelectedTodoIds: (ids: string[]) => void;
	toggleTodoSelection: (id: string) => void;
	clearTodoSelection: () => void;
	toggleTodoExpanded: (id: string) => void;
	isTodoExpanded: (id: string) => boolean;
}

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

function fromApiTodo(apiTodo: ApiTodo): Todo {
	return {
		id: String(apiTodo.id),
		name: apiTodo.name,
		description: apiTodo.description ?? undefined,
		userNotes: apiTodo.user_notes ?? undefined,
		status: normalizeStatus(apiTodo.status),
		priority: normalizePriority(apiTodo.priority),
		deadline: apiTodo.deadline ?? undefined,
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

const pendingUpdateTimers = new Map<string, ReturnType<typeof setTimeout>>();
const pendingUpdatePayloads = new Map<string, Record<string, unknown>>();

export const useTodoStore = create<TodoStoreState>()((set, get) => ({
	todos: [],
	selectedTodoId: null,
	selectedTodoIds: [],
	collapsedTodoIds: new Set<string>(),
	hydrated: false,
	isSyncing: false,
	syncError: null,

	setSelectedTodoId: (id) =>
		set({
			selectedTodoId: id,
			selectedTodoIds: id ? [id] : [],
		}),
	setSelectedTodoIds: (ids) =>
		set({
			selectedTodoIds: ids,
			selectedTodoId: ids[0] ?? null,
		}),
	toggleTodoSelection: (id) =>
		set((state) => {
			const exists = state.selectedTodoIds.includes(id);
			const nextIds = exists
				? state.selectedTodoIds.filter((item) => item !== id)
				: [...state.selectedTodoIds, id];
			return {
				selectedTodoIds: nextIds,
				selectedTodoId: nextIds[0] ?? null,
			};
		}),
	clearTodoSelection: () => set({ selectedTodoId: null, selectedTodoIds: [] }),

	hydrate: async () => {
		if (get().hydrated) return;
		await get().refreshTodos();
		set({ hydrated: true });
	},

	refreshTodos: async () => {
		set({ isSyncing: true, syncError: null });
		try {
			const res = await getTodos({ limit: 2000, offset: 0 });
			const todos = (res.todos ?? []).map(fromApiTodo);
			set({ todos, isSyncing: false });
		} catch (err) {
			console.error(err);
			set({
				isSyncing: false,
				syncError: err instanceof Error ? err.message : "同步失败",
			});
		}
	},

	createTodoWithResult: async (input) => {
		set({ syncError: null });
		try {
			const created = await createTodo({
				name: input.name,
				description: input.description,
				user_notes: input.userNotes,
				parent_todo_id: input.parentTodoId ? toApiId(input.parentTodoId) : null,
				deadline: normalizeDeadline(input.deadline),
				status: input.status ?? "active",
				priority: input.priority ?? "none",
				tags: input.tags ?? [],
				related_activities: toNumberList(input.relatedActivities),
			});
			const createdTodo = fromApiTodo(created);
			set((state) => ({ todos: [createdTodo, ...state.todos] }));
			return createdTodo;
		} catch (err) {
			console.error(err);
			set({ syncError: err instanceof Error ? err.message : "创建失败" });
			return null;
		}
	},

	addTodo: async (input) => {
		await get().createTodoWithResult(input);
	},

	updateTodo: async (id, input) => {
		set({ syncError: null });
		// 先本地乐观更新，避免输入时“卡顿”
		set((state) => ({
			todos: state.todos.map((todo) =>
				todo.id === id
					? {
							...todo,
							...input,
							priority: normalizePriority(input.priority ?? todo.priority),
							status: input.status ?? todo.status,
							updatedAt: new Date().toISOString(),
						}
					: todo,
			),
		}));

		try {
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
			if (has("tags")) payload.tags = input.tags ?? [];
			if (has("parentTodoId"))
				payload.parent_todo_id = input.parentTodoId
					? toApiId(input.parentTodoId)
					: null;
			if (has("relatedActivities"))
				payload.related_activities = toNumberList(input.relatedActivities);

			const keys = Object.keys(payload);
			const shouldDebounce =
				keys.length > 0 &&
				keys.every((k) => k === "description" || k === "user_notes");

			// 合并同一 todo 的待发送 payload，并在到期时一次性提交
			const merged = {
				...(pendingUpdatePayloads.get(id) ?? {}),
				...payload,
			};
			pendingUpdatePayloads.set(id, merged);

			const flush = async () => {
				pendingUpdateTimers.delete(id);
				const body = pendingUpdatePayloads.get(id);
				pendingUpdatePayloads.delete(id);
				if (!body || Object.keys(body).length === 0) return;

				const updated = await updateTodoApi(toApiId(id), body);
				const updatedTodo = fromApiTodo(updated);
				set((state) => ({
					todos: state.todos.map((t) => (t.id === id ? updatedTodo : t)),
				}));
			};

			const existingTimer = pendingUpdateTimers.get(id);
			if (existingTimer) clearTimeout(existingTimer);

			if (shouldDebounce) {
				const timer = setTimeout(() => {
					void flush().catch((err) => {
						console.error(err);
						set({
							syncError: err instanceof Error ? err.message : "更新失败",
						});
					});
				}, 500);
				pendingUpdateTimers.set(id, timer);
			} else {
				await flush();
			}
		} catch (err) {
			console.error(err);
			set({ syncError: err instanceof Error ? err.message : "更新失败" });
		}
	},

	deleteTodo: async (id) => {
		set({ syncError: null });
		try {
			// 递归查找所有子任务 ID（包括子任务的子任务）
			const findAllChildIds = (
				parentId: string,
				allTodos: Todo[],
			): string[] => {
				const childIds: string[] = [];
				const children = allTodos.filter((t) => t.parentTodoId === parentId);
				for (const child of children) {
					childIds.push(child.id);
					// 递归查找子任务的子任务
					childIds.push(...findAllChildIds(child.id, allTodos));
				}
				return childIds;
			};

			const state = get();
			const allIdsToDelete = [id, ...findAllChildIds(id, state.todos)];

			await deleteTodoApi(toApiId(id));
			set((state) => {
				const idsToDeleteSet = new Set(allIdsToDelete);
				return {
					todos: state.todos.filter((t) => !idsToDeleteSet.has(t.id)),
					selectedTodoId: idsToDeleteSet.has(state.selectedTodoId ?? "")
						? null
						: state.selectedTodoId,
					selectedTodoIds: state.selectedTodoIds.filter(
						(x) => !idsToDeleteSet.has(x),
					),
				};
			});
		} catch (err) {
			console.error(err);
			set({ syncError: err instanceof Error ? err.message : "删除失败" });
		}
	},

	toggleTodoStatus: async (id) => {
		const todo = get().todos.find((t) => t.id === id);
		if (!todo) return;
		const next: TodoStatus =
			todo.status === "completed"
				? "active"
				: todo.status === "canceled"
					? "canceled"
					: todo.status === "draft"
						? "active" // draft -> active when toggling
						: "completed";
		await get().updateTodo(id, { status: next });
	},

	reorderTodos: (newOrder) =>
		set((state) => {
			const todoMap = new Map(state.todos.map((todo) => [todo.id, todo]));
			const reorderedTodos = newOrder
				.map((id) => todoMap.get(id))
				.filter((todo): todo is Todo => todo !== undefined);
			const remainingIds = new Set(newOrder);
			const remainingTodos = state.todos.filter(
				(todo) => !remainingIds.has(todo.id),
			);
			return { todos: [...reorderedTodos, ...remainingTodos] };
		}),

	toggleTodoExpanded: (id) =>
		set((state) => {
			const newCollapsed = new Set(state.collapsedTodoIds);
			if (newCollapsed.has(id)) {
				// 如果已折叠，则展开（从 Set 中移除）
				newCollapsed.delete(id);
			} else {
				// 如果已展开，则折叠（添加到 Set 中）
				newCollapsed.add(id);
			}
			return { collapsedTodoIds: newCollapsed };
		}),

	isTodoExpanded: (id) => {
		// 如果 id 不在 collapsedTodoIds 中，说明是展开的
		return !get().collapsedTodoIds.has(id);
	},
}));
