/**
 * 日历日期列 - 作为放置目标
 * 使用 useDroppable 并传递类型化的 DropData
 */

import { useDroppable } from "@dnd-kit/core";
import type React from "react";
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
	renderQuickCreate,
}: {
	day: CalendarDay;
	todos: CalendarTodo[];
	onSelectDay: (
		date: Date,
		anchorEl?: HTMLDivElement | null,
		inCurrentMonth?: boolean,
	) => void;
	onSelectTodo: (todo: Todo) => void;
	view: CalendarView;
	todayText: string;
	renderQuickCreate?: (date: Date) => React.ReactNode;
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
			onClick={(event) => {
				if (
					(event.target as HTMLElement | null)?.closest(
						"[data-quick-create]",
					)
				) {
					return;
				}
				onSelectDay(day.date, event.currentTarget, day.inCurrentMonth);
			}}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					if (
						(e.target as HTMLElement | null)?.closest(
							"[data-quick-create]",
						)
					) {
						return;
					}
					onSelectDay(
						day.date,
						e.currentTarget as HTMLDivElement,
						day.inCurrentMonth,
					);
				}
			}}
			role="button"
			tabIndex={0}
			className={cn(
				"group relative flex flex-col gap-1 border-r border-b border-border p-1.5 transition-all duration-200 ease-out",
				"cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
				"hover:bg-muted/40 hover:ring-1 hover:ring-primary/20 hover:shadow-[0_10px_24px_-18px_oklch(var(--primary)/0.55)]",
				"active:scale-[0.99] active:bg-primary/10",
				isOver &&
					"bg-primary/10 ring-1 ring-primary/30 shadow-[0_12px_26px_-20px_oklch(var(--primary)/0.6)]",
				day.inCurrentMonth === false && "opacity-40 bg-muted/20",
				isToday && "bg-primary/5",
				view === "month" ? "min-h-[120px]" : "min-h-[180px]",
			)}
		>
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span
					className={cn(
						"inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold transition-all",
						isToday && "bg-primary text-primary-foreground shadow-sm",
						!isToday &&
							"group-hover:bg-primary/10 group-hover:text-foreground group-hover:shadow-[inset_0_0_0_1px_oklch(var(--primary)/0.25)] group-hover:scale-[1.04]",
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
						key={`${item.todo.id}-${item.dateKey}`}
						calendarTodo={item}
						onSelect={onSelectTodo}
					/>
				))}
			</div>
			{renderQuickCreate ? renderQuickCreate(day.date) : null}
		</div>
	);
}
