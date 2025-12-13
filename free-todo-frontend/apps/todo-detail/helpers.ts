import type { Todo, TodoPriority, TodoStatus } from "@/lib/types/todo";
import { cn } from "@/lib/utils";

export const statusOptions: TodoStatus[] = [
	"active",
	"completed",
	"canceled",
	"draft",
];
export const priorityOptions: TodoPriority[] = [
	"high",
	"medium",
	"low",
	"none",
];

export const getStatusClassNames = (status: TodoStatus) =>
	cn(
		"rounded-full border px-2 py-0.5 text-xs font-medium",
		status === "completed"
			? "border-primary/60 bg-primary/10 text-primary"
			: status === "canceled"
				? "border-muted-foreground/50 bg-muted/20 text-muted-foreground"
				: status === "draft"
					? "border-orange-500/60 bg-orange-500/10 text-orange-600 dark:text-orange-400"
					: "border-accent/60 bg-accent/10 text-accent-foreground",
	);

export const getPriorityClassNames = (priority: TodoPriority) =>
	cn(
		"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
		priority === "high"
			? "border-destructive/60 bg-destructive/10 text-destructive"
			: priority === "medium"
				? "border-primary/60 bg-primary/10 text-primary"
				: priority === "low"
					? "border-secondary/60 bg-secondary/20 text-secondary-foreground"
					: "border-muted-foreground/40 text-muted-foreground",
	);

export const getPriorityIconColor = (priority: TodoPriority) => {
	switch (priority) {
		case "high":
			return "text-destructive";
		case "medium":
			return "text-primary";
		case "low":
			return "text-secondary-foreground";
		default:
			return "text-muted-foreground";
	}
};

export const getPriorityLabel = (priority: TodoPriority) => {
	switch (priority) {
		case "high":
			return "高";
		case "medium":
			return "中";
		case "low":
			return "低";
		default:
			return "无";
	}
};

export const formatDeadlineForInput = (value?: string) => {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const offsetMs = date.getTimezoneOffset() * 60 * 1000;
	const local = new Date(date.getTime() - offsetMs);
	return local.toISOString().slice(0, 16);
};

export const parseInputToIso = (value: string) => {
	if (!value) return undefined;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return undefined;
	return date.toISOString();
};

export const formatDateTime = (value?: string) => {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	return date.toLocaleString();
};

export const getChildProgress = (todos: Todo[], parentId: string) => {
	const children = todos.filter((item) => item.parentTodoId === parentId);
	const completed = children.filter(
		(item) => item.status === "completed",
	).length;
	return { completed, total: children.length };
};
