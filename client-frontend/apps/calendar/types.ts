/**
 * 日历相关类型定义
 */

import type { Todo, TodoStatus } from "@/lib/types";

export type CalendarView = "month" | "week" | "day";

export interface CalendarTodo {
	todo: Todo;
	startTime: Date;
	endTime?: Date | null;
	dateKey: string;
	day: Date;
	isAllDay?: boolean;
}

export interface CalendarDay {
	date: Date;
	inCurrentMonth?: boolean;
}

export interface TimelineItem {
	todo: Todo;
	kind: "deadline" | "range";
	date: Date;
	startMinutes: number;
	endMinutes: number;
	timeLabel: string;
}

export function getStatusStyle(status: TodoStatus): string {
	switch (status) {
		case "completed":
			return "bg-green-500/15 text-green-600 border-green-500/30";
		case "canceled":
			return "bg-gray-500/15 text-gray-500 border-gray-500/30";
		case "draft":
			return "bg-orange-500/15 text-orange-600 border-orange-500/30";
		default:
			return "bg-primary/10 text-primary border-primary/25";
	}
}

export function getScheduleSeverity(
	startTime: Date,
): "overdue" | "soon" | "normal" {
	const now = new Date();
	if (startTime.getTime() < now.getTime()) return "overdue";
	const diffHours = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
	return diffHours <= 24 ? "soon" : "normal";
}
