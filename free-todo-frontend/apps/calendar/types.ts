/**
 * 日历相关类型定义
 */

import type { Todo, TodoStatus } from "@/lib/types";

export type CalendarView = "month" | "week" | "day";

export interface CalendarTodo {
	todo: Todo;
	deadline: Date;
	dateKey: string;
}

export interface CalendarDay {
	date: Date;
	inCurrentMonth?: boolean;
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
			return "bg-blue-500/10 text-blue-600 border-blue-500/25";
	}
}

export function getDeadlineSeverity(
	deadline: Date,
): "overdue" | "soon" | "normal" {
	const now = new Date();
	if (deadline.getTime() < now.getTime()) return "overdue";
	const diffHours = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
	return diffHours <= 24 ? "soon" : "normal";
}
