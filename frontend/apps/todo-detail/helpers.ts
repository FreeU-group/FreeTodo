import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import type { Todo, TodoPriority, TodoStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

dayjs.extend(utc);
dayjs.extend(timezone);

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

const resolveTimeZone = (timeZone?: string) =>
	timeZone || dayjs.tz.guess();

const toZoned = (value?: string, timeZone?: string) => {
	if (!value) return null;
	const parsed = dayjs(value);
	if (!parsed.isValid()) return null;
	return parsed.tz(resolveTimeZone(timeZone));
};

export const formatDateTime = (value?: string, timeZone?: string): string => {
	const zoned = toZoned(value, timeZone);
	if (!zoned) return "";
	return zoned.format("YYYY-MM-DD HH:mm");
};

export const formatDateOnly = (value?: string, timeZone?: string): string => {
	const zoned = toZoned(value, timeZone);
	if (!zoned) return "";
	return zoned.format("YYYY-MM-DD");
};

export const formatScheduleSummary = ({
	startTime,
	endTime,
	timeZone,
	isAllDay,
}: {
	startTime?: string;
	endTime?: string;
	timeZone?: string;
	isAllDay?: boolean;
}): string => {
	const baseStart = startTime ?? endTime;
	const startZoned = toZoned(baseStart, timeZone);
	if (!startZoned) return "";
	const endZoned = endTime ? toZoned(endTime, timeZone) : null;

	const startDate = startZoned.format("YYYY-MM-DD");
	const endDate = endZoned?.format("YYYY-MM-DD");

	if (isAllDay) {
		if (endDate && endDate !== startDate) {
			return `${startDate} - ${endDate}`;
		}
		return startDate;
	}

	const startTimeLabel = startZoned.format("HH:mm");
	if (!endZoned) return `${startDate} ${startTimeLabel}`;

	const endTimeLabel = endZoned.format("HH:mm");
	if (endDate && endDate !== startDate) {
		return `${startDate} ${startTimeLabel} - ${endDate} ${endTimeLabel}`;
	}
	return `${startDate} ${startTimeLabel} - ${endTimeLabel}`;
};

export const getChildProgress = (todos: Todo[], parentId: number) => {
	const children = todos.filter((item) => item.parentTodoId === parentId);
	const completed = children.filter(
		(item) => item.status === "completed",
	).length;
	return { completed, total: children.length };
};
