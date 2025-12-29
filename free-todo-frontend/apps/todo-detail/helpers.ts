import type { Todo, TodoPriority, TodoStatus } from "@/lib/types";
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
		"inline-flex items-center justify-center rounded-full border px-2 py-1 text-xs font-medium leading-none",
		status === "active"
			? "border-primary/70 bg-primary/20 text-primary"
			: status === "completed"
				? "border-green-500/60 bg-green-500/12 text-green-600 dark:text-green-500"
				: status === "draft"
					? "border-orange-500/50 bg-orange-500/8 text-orange-600 dark:text-orange-400"
					: "border-muted-foreground/40 bg-muted/15 text-muted-foreground",
	);

export const getPriorityClassNames = (priority: TodoPriority) =>
	cn(
		"inline-flex items-center justify-center gap-1 rounded-full border px-2 py-1 text-xs font-medium leading-none",
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

export const getPriorityBorderColor = (priority: TodoPriority) => {
	switch (priority) {
		case "high":
			return "border-destructive/60";
		case "medium":
			return "border-primary/60";
		case "low":
			return "border-secondary/60";
		default:
			return "border-muted-foreground/40";
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

/**
 * 格式化 deadline，如果时间为 0:00:00 则只显示日期，否则显示完整的日期时间
 */
export const formatDeadline = (value?: string) => {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";

	// 检查本地时间是否为 0:00:00（用户只设置日期时，DatePickerPopover 会设置本地时间为 0:00:00）
	const hours = date.getHours();
	const minutes = date.getMinutes();
	const seconds = date.getSeconds();
	const milliseconds = date.getMilliseconds();

	// 如果本地时间为 0:00:00.000，只显示日期
	if (hours === 0 && minutes === 0 && seconds === 0 && milliseconds === 0) {
		return date.toLocaleDateString();
	}

	// 否则显示完整的日期时间
	return date.toLocaleString();
};

export const getChildProgress = (todos: Todo[], parentId: number) => {
	const children = todos.filter((item) => item.parentTodoId === parentId);
	const completed = children.filter(
		(item) => item.status === "completed",
	).length;
	return { completed, total: children.length };
};
