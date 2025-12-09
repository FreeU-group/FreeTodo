export type TodoStatus = "pending" | "in-progress" | "completed";
export type TodoPriority = "low" | "medium" | "high";

export interface AssignedUser {
	id: string;
	name: string;
	avatar?: string;
}

export interface Todo {
	id: string;
	title: string;
	status: TodoStatus;
	dueDate?: string; // ISO date string
	subtasks?: Subtask[];
	starred?: boolean;
	assignedTo?: AssignedUser[];
	priority?: TodoPriority;
	notes?: string;
	createdAt: string;
	updatedAt: string;
}

export interface Subtask {
	id: string;
	title: string;
	completed: boolean;
}

export interface CreateTodoInput {
	title: string;
	dueDate?: string;
	subtasks?: Omit<Subtask, "id">[];
	starred?: boolean;
	assignedTo?: AssignedUser[];
	priority?: TodoPriority;
	status?: TodoStatus;
}

export interface UpdateTodoInput {
	title?: string;
	status?: TodoStatus;
	dueDate?: string;
	subtasks?: Subtask[];
	starred?: boolean;
	assignedTo?: AssignedUser[];
	priority?: TodoPriority;
	notes?: string;
}
