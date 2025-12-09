import type { StateCreator } from "zustand";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "@/lib/types/todo";

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
	},
) as unknown as StateCreator<TodoStoreState>;

export const useTodoStore = create<TodoStoreState>()(todoStoreCreator);
