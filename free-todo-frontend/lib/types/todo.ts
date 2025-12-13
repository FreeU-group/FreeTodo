export type TodoStatus = "active" | "completed" | "canceled" | "draft";
export type TodoPriority = "high" | "medium" | "low" | "none";

export interface TodoAttachment {
	id: string;
	fileName: string;
	filePath: string;
	fileSize?: number;
	mimeType?: string;
}

export interface Todo {
	id: string;
	name: string;
	description?: string;
	userNotes?: string;
	status: TodoStatus;
	priority: TodoPriority;
	deadline?: string; // ISO date string
	tags?: string[];
	attachments?: TodoAttachment[];
	parentTodoId?: string | null;
	relatedActivities?: string[];
	childTodoIds?: string[];
	createdAt: string;
	updatedAt: string;
}

export interface CreateTodoInput {
	id?: string;
	name: string;
	description?: string;
	userNotes?: string;
	priority?: TodoPriority;
	deadline?: string;
	tags?: string[];
	attachments?: TodoAttachment[];
	parentTodoId?: string | null;
	childTodoIds?: string[];
	relatedActivities?: string[];
	status?: TodoStatus;
}

export interface UpdateTodoInput {
	name?: string;
	description?: string;
	userNotes?: string;
	status?: TodoStatus;
	priority?: TodoPriority;
	deadline?: string;
	tags?: string[];
	attachments?: TodoAttachment[];
	parentTodoId?: string | null;
	relatedActivities?: string[];
}
