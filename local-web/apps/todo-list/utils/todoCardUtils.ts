import type { TodoPriority } from "@/lib/types";
import { formatTodoIntl, parseTodoDateTime } from "@/lib/utils/todoTime";

/**
 * 格式化日期字符串
 */
export function formatScheduleLabel(
	startTime?: string,
	endTime?: string,
	timeZone?: string,
): string | null {
	const schedule = startTime ?? endTime;
	if (!schedule) return null;
	const startZoned = parseTodoDateTime(schedule, timeZone);
	if (!startZoned) return null;
	const locale = typeof navigator !== "undefined" ? navigator.language : "en-US";
	const dateLabel = formatTodoIntl(schedule, timeZone, locale, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	const timeLabel = formatTodoIntl(schedule, timeZone, locale, {
		hour: "2-digit",
		minute: "2-digit",
	});
	if (!dateLabel || !timeLabel) return null;
	const isMidnight =
		startZoned.hour() === 0 &&
		startZoned.minute() === 0 &&
		startZoned.second() === 0;
	const startLabel = isMidnight ? dateLabel : `${dateLabel} ${timeLabel}`;

	if (!endTime) return startLabel;
	const endZoned = parseTodoDateTime(endTime, timeZone);
	if (!endZoned) return startLabel;
	const endDateLabel = formatTodoIntl(endTime, timeZone, locale, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	const endTimeLabel = formatTodoIntl(endTime, timeZone, locale, {
		hour: "2-digit",
		minute: "2-digit",
	});
	if (!endDateLabel || !endTimeLabel) return startLabel;
	const sameDay = startZoned.format("YYYY-MM-DD") === endZoned.format("YYYY-MM-DD");
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
