/**
 * 日历日期列 - 作为放置目标
 * 使用 useDroppable 并传递类型化的 DropData
 */

import { useDroppable } from "@dnd-kit/core";
import { useMemo } from "react";
import type { DropData } from "@/lib/dnd";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { CalendarDay, CalendarTodo, CalendarView } from "../types";
import { toDateKey } from "../utils";
import { DraggableTodo } from "./DraggableTodo";

export function DayColumn({
	day,
	todos,
	onSelectDay,
	onSelectTodo,
	view,
	todayText,
}: {
	day: CalendarDay;
	todos: CalendarTodo[];
	onSelectDay: (date: Date) => void;
	onSelectTodo: (todo: Todo) => void;
	view: CalendarView;
	todayText: string;
}) {
	const dateKey = toDateKey(day.date);

	// 构建类型化的放置区数据
	const dropData: DropData = useMemo(
		() => ({
			type: "CALENDAR_DATE" as const,
			metadata: {
				dateKey,
				date: day.date,
			},
		}),
		[dateKey, day.date],
	);

	const { isOver, setNodeRef } = useDroppable({
		id: `day-${dateKey}`,
		data: dropData,
	});

	const isToday = dateKey === toDateKey(new Date());

	return (
		<div
			ref={setNodeRef}
			onClick={() => onSelectDay(day.date)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelectDay(day.date);
				}
			}}
			role="button"
			tabIndex={0}
			className={cn(
				"flex flex-col gap-1 border-r border-b border-border p-1.5 transition-colors",
				isOver && "bg-primary/5",
				day.inCurrentMonth === false && "opacity-40 bg-muted/20",
				isToday && "bg-primary/5",
				view === "month" ? "min-h-[120px]" : "min-h-[180px]",
			)}
		>
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span
					className={cn(
						"inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold",
						isToday && "bg-primary text-primary-foreground",
					)}
				>
					{day.date.getDate()}
				</span>
				{isToday && (
					<span className="text-[11px] text-primary">{todayText}</span>
				)}
			</div>

			<div className="flex flex-col gap-1">
				{todos.map((item) => (
					<DraggableTodo
						key={item.todo.id}
						calendarTodo={item}
						onSelect={onSelectTodo}
					/>
				))}
			</div>
		</div>
	);
}
