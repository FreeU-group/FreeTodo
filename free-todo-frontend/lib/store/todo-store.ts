import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "@/lib/types/todo";

interface TodoStoreState {
	todos: Todo[];
	selectedTodoId: string | null;
	addTodo: (input: CreateTodoInput) => void;
	updateTodo: (id: string, input: UpdateTodoInput) => void;
	deleteTodo: (id: string) => void;
	toggleTodoStatus: (id: string) => void;
	toggleSubtask: (todoId: string, subtaskId: string) => void;
	toggleStarred: (id: string) => void;
	reorderTodos: (newOrder: string[]) => void;
	setSelectedTodoId: (id: string | null) => void;
}

const generateId = () => {
	return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const useTodoStore = create<TodoStoreState>()(
	persist(
		(set) => ({
			todos: [],
			selectedTodoId: null,
			setSelectedTodoId: (id) => set({ selectedTodoId: id }),
			addTodo: (input) =>
				set((state) => {
					const now = new Date().toISOString();
					const newTodo: Todo = {
						id: generateId(),
						title: input.title,
						status: input.status || "pending",
						dueDate: input.dueDate,
						subtasks: input.subtasks?.map((st) => ({
							...st,
							id: generateId(),
						})),
						starred: input.starred || false,
						assignedTo: input.assignedTo,
						priority: input.priority,
						createdAt: now,
						updatedAt: now,
					};
					return {
						todos: [...state.todos, newTodo],
					};
				}),
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
									status: todo.status === "completed" ? "pending" : "completed",
									updatedAt: new Date().toISOString(),
								}
							: todo,
					),
				})),
			toggleSubtask: (todoId, subtaskId) =>
				set((state) => ({
					todos: state.todos.map((todo) =>
						todo.id === todoId && todo.subtasks
							? {
									...todo,
									subtasks: todo.subtasks.map((st) =>
										st.id === subtaskId
											? { ...st, completed: !st.completed }
											: st,
									),
									updatedAt: new Date().toISOString(),
								}
							: todo,
					),
				})),
			toggleStarred: (id) =>
				set((state) => ({
					todos: state.todos.map((todo) =>
						todo.id === id
							? {
									...todo,
									starred: !todo.starred,
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
	),
);
