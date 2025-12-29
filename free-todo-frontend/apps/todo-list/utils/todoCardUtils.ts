import type { TodoPriority } from "@/lib/types";

/**
 * 格式化日期字符串
 */
export function formatDate(dateString?: string): string | null {
	if (!dateString) return null;
	const date = new Date(dateString);
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

/**
 * 根据优先级获取边框颜色类名
 */
export function getPriorityBorderColor(priority: TodoPriority): string {
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
}
