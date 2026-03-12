import type { TodoPriority } from "@/lib/types";

/**
 * 格式化日期字符串
 */
export function formatScheduleLabel(
	startTime?: string,
	endTime?: string,
): string | null {
	const schedule = startTime ?? endTime;
	if (!schedule) return null;
	const startDate = new Date(schedule);
	if (Number.isNaN(startDate.getTime())) return null;

	const dateLabel = startDate.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	const timeLabel = startDate.toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
	});
	const startLabel =
		startDate.getHours() === 0 && startDate.getMinutes() === 0
			? dateLabel
			: `${dateLabel} ${timeLabel}`;

	if (!endTime) return startLabel;
	const endDate = new Date(endTime);
	if (Number.isNaN(endDate.getTime())) return startLabel;
	const sameDay = startDate.toDateString() === endDate.toDateString();
	const endDateLabel = endDate.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	const endTimeLabel = endDate.toLocaleTimeString("en-US", {
		hour: "2-digit",
		minute: "2-digit",
	});
	const endLabel = sameDay ? endTimeLabel : `${endDateLabel} ${endTimeLabel}`;

	return `${startLabel} - ${endLabel}`;
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
