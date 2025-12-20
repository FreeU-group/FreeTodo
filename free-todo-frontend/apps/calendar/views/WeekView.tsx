/**
 * 周视图组件
 */

import type { Todo } from "@/lib/types";
import { DayColumn } from "../components/DayColumn";
import type { CalendarTodo } from "../types";
import { buildWeekDays, toDateKey } from "../utils";

export function WeekView({
	currentDate,
	groupedByDay,
	onSelectDay,
	onSelectTodo,
	todayText,
}: {
	currentDate: Date;
	groupedByDay: Map<string, CalendarTodo[]>;
	onSelectDay: (date: Date) => void;
	onSelectTodo: (todo: Todo) => void;
	todayText: string;
}) {
	const weekDays = buildWeekDays(currentDate);

	return (
		<div className="grid grid-cols-7 border-l border-t border-border">
			{weekDays.map((day) => (
				<DayColumn
					key={toDateKey(day.date)}
					day={day}
					view="week"
					onSelectDay={onSelectDay}
					onSelectTodo={onSelectTodo}
					todos={groupedByDay.get(toDateKey(day.date)) || []}
					todayText={todayText}
				/>
			))}
		</div>
	);
}
