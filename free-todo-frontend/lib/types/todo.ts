export type TodoStatus = "active" | "completed" | "canceled";

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
	deadline?: string;
	tags?: string[];
	attachments?: TodoAttachment[];
	parentTodoId?: string | null;
	relatedActivities?: string[];
}
