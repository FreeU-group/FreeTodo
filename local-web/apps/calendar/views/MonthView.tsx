/**
 * 月视图组件
 */

import type React from "react";
import type { Todo } from "@/lib/types";
import { DayColumn } from "../components/DayColumn";
import type { CalendarTodo } from "../types";
import { buildMonthDays, toDateKey } from "../utils";

export function MonthView({
	currentDate,
	groupedByDay,
	onSelectDay,
	onSelectTodo,
	todayText,
	renderQuickCreate,
}: {
	currentDate: Date;
	groupedByDay: Map<string, CalendarTodo[]>;
	onSelectDay: (
		date: Date,
		anchorEl?: HTMLDivElement | null,
		inCurrentMonth?: boolean,
	) => void;
	onSelectTodo: (todo: Todo) => void;
	todayText: string;
	renderQuickCreate?: (date: Date) => React.ReactNode;
}) {
	const monthDays = buildMonthDays(currentDate);

	return (
		<div className="grid grid-cols-7 border-l border-t border-border">
			{monthDays.map((day) => (
				<DayColumn
					key={toDateKey(day.date)}
					day={day}
					view="month"
					onSelectDay={onSelectDay}
					onSelectTodo={onSelectTodo}
					todos={groupedByDay.get(toDateKey(day.date)) || []}
					todayText={todayText}
					renderQuickCreate={renderQuickCreate}
				/>
			))}
		</div>
	);
}
