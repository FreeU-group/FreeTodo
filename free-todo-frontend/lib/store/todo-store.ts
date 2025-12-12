import type { StateCreator } from "zustand";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
	CreateTodoInput,
	Todo,
	TodoPriority,
	UpdateTodoInput,
} from "@/lib/types/todo";

interface TodoStoreState {
	todos: Todo[];
	selectedTodoId: string | null;
	selectedTodoIds: string[];
	addTodo: (input: CreateTodoInput) => Todo;
	updateTodo: (id: string, input: UpdateTodoInput) => void;
	deleteTodo: (id: string) => void;
	toggleTodoStatus: (id: string) => void;
	reorderTodos: (newOrder: string[]) => void;
	setSelectedTodoId: (id: string | null) => void;
	setSelectedTodoIds: (ids: string[]) => void;
	toggleTodoSelection: (id: string) => void;
	clearTodoSelection: () => void;
}

const generateId = () => {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

const normalizePriority = (priority: unknown): TodoPriority => {
	if (
		priority === "high" ||
		priority === "medium" ||
		priority === "low" ||
		priority === "none"
	) {
		return priority;
	}
	return "none";
};

type PersistedStorage = {
	state?: Partial<TodoStoreState> & {
		todos?: Array<Omit<Todo, "priority"> & { priority?: unknown }>;
	};
	version?: number;
};

const isPersistedStorage = (value: unknown): value is PersistedStorage =>
	typeof value === "object" && value !== null && "state" in value;

const todoStoreCreator: StateCreator<TodoStoreState> = persist<TodoStoreState>(
	(set) => ({
		todos: [],
		selectedTodoId: null,
		selectedTodoIds: [],
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
		clearTodoSelection: () =>
			set({ selectedTodoId: null, selectedTodoIds: [] }),
		addTodo: (input) => {
			const now = new Date().toISOString();
			const newTodo: Todo = {
				id: input.id ?? generateId(),
				name: input.name,
				description: input.description,
				userNotes: input.userNotes,
				status: input.status || "active",
				priority: normalizePriority(input.priority),
				deadline: input.deadline,
				tags: input.tags || [],
				attachments: input.attachments || [],
				parentTodoId: input.parentTodoId ?? null,
				relatedActivities: input.relatedActivities || [],
				childTodoIds: input.childTodoIds,
				createdAt: now,
				updatedAt: now,
			};

			set((state) => {
				const nextTodos = [newTodo, ...state.todos];
				// #region agent log
				fetch(
					"http://127.0.0.1:7242/ingest/60db1f8b-8093-4a1d-a587-94a63cffac9e",
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							sessionId: "debug-session",
							runId: "run1",
							hypothesisId: "H2",
							location: "lib/store/todo-store.ts:addTodo",
							message: "addTodo state mutation",
							data: {
								inputName: newTodo.name,
								totalBefore: state.todos.length,
								totalAfter: nextTodos.length,
								parent: newTodo.parentTodoId,
							},
							timestamp: Date.now(),
						}),
					},
				).catch(() => {});
				// #endregion
				if (!newTodo.parentTodoId) {
					return { todos: nextTodos };
				}

				const updatedTodos = nextTodos.map((todo) =>
					todo.id === newTodo.parentTodoId
						? {
								...todo,
								childTodoIds: Array.from(
									new Set([...(todo.childTodoIds ?? []), newTodo.id]),
								),
								updatedAt: now,
							}
						: todo,
				);

				return { todos: updatedTodos };
			});

			return newTodo;
		},
		updateTodo: (id, input) =>
			set((state) => ({
				todos: state.todos.map((todo) =>
					todo.id === id
						? {
								...todo,
								...input,
								priority: normalizePriority(
									input.priority ?? todo.priority ?? "none",
								),
								updatedAt: new Date().toISOString(),
							}
						: todo,
				),
			})),
		deleteTodo: (id) =>
			set((state) => ({
				todos: state.todos.filter((todo) => todo.id !== id),
			})),
		toggleTodoStatus: (id) =>
			set((state) => ({
				todos: state.todos.map((todo) =>
					todo.id === id
						? {
								...todo,
								status:
									todo.status === "completed"
										? "active"
										: todo.status === "canceled"
											? "canceled"
											: "completed",
								updatedAt: new Date().toISOString(),
							}
						: todo,
				),
			})),
		reorderTodos: (newOrder) =>
			set((state) => {
				const todoMap = new Map(state.todos.map((todo) => [todo.id, todo]));
				const reorderedTodos = newOrder
					.map((id) => todoMap.get(id))
					.filter((todo): todo is Todo => todo !== undefined);
				// 保留不在newOrder中的todos（如果有的话）
				const remainingIds = new Set(newOrder);
				const remainingTodos = state.todos.filter(
					(todo) => !remainingIds.has(todo.id),
				);
				return {
					todos: [...reorderedTodos, ...remainingTodos],
				};
			}),
	}),
	{
		name: "todo-storage",
		storage: createJSONStorage(() => localStorage),
		version: 1,
		migrate: (state: unknown, _version: number): TodoStoreState => {
			// 兼容旧数据：补齐 priority 字段
			if (isPersistedStorage(state) && state.state) {
				const todos = state.state.todos ?? [];
				const migratedTodos = todos.map((todo) => ({
					...todo,
					priority: normalizePriority(todo.priority),
				}));
				// #region agent log
				fetch(
					"http://127.0.0.1:7242/ingest/60db1f8b-8093-4a1d-a587-94a63cffac9e",
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							sessionId: "debug-session",
							runId: "run1",
							hypothesisId: "H3",
							location: "lib/store/todo-store.ts:migrate",
							message: "persist migrate invoked",
							data: { persistedCount: todos.length },
							timestamp: Date.now(),
						}),
					},
				).catch(() => {});
				// #endregion
				return {
					...state.state,
					todos: migratedTodos,
				} as TodoStoreState;
			}
			return state as TodoStoreState;
		},
	},
) as unknown as StateCreator<TodoStoreState>;

export const useTodoStore = create<TodoStoreState>()(todoStoreCreator);
