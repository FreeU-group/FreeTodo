import type { Todo } from "@/lib/types";

export const TODO_FOLDER_NONE = "__no_folder__";

export function parseTodoFolder(categories?: string | null): string | null {
	if (!categories) return null;
	const parts = categories
		.split(",")
		.map((value) => value.trim())
		.filter(Boolean);
	return parts[0] ?? null;
}

export function getTodoFolder(todo: Pick<Todo, "categories">): string | null {
	return parseTodoFolder(todo.categories);
}
