"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
	buildMonthDays,
	type CalendarDay,
	startOfDay,
	toDateKey,
	WEEKDAY_KEYS,
	type WeekdayKey,
} from "./date-picker-utils";

interface MonthNavigationProps {
	currentMonth: Date;
	onPrevMonth: () => void;
	onNextMonth: () => void;
	tCalendar: ReturnType<typeof useTranslations<"calendar">>;
}

export function MonthNavigation({
	currentMonth,
	onPrevMonth,
	onNextMonth,
	tCalendar,
}: MonthNavigationProps) {
	return (
		<div className="flex items-center justify-between px-1 py-2">
			<span className="text-sm font-medium">
				{tCalendar("yearMonth", {
					year: currentMonth.getFullYear(),
					month: currentMonth.getMonth() + 1,
				})}
			</span>
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={onPrevMonth}
					className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
				>
					<ChevronLeft className="h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={onNextMonth}
					className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
				>
					<ChevronRight className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}

interface WeekdayHeaderProps {
	tCalendar: ReturnType<typeof useTranslations<"calendar">>;
}

export function WeekdayHeader({ tCalendar }: WeekdayHeaderProps) {
	return (
		<div className="grid grid-cols-7 px-2">
			{WEEKDAY_KEYS.map((key, idx) => (
				<span
					key={key}
					className={cn(
						"py-1 text-center text-xs font-medium",
						idx >= 5 ? "text-muted-foreground/70" : "text-muted-foreground",
					)}
				>
					{tCalendar(`weekdays.${key}` as `weekdays.${WeekdayKey}`)}
				</span>
			))}
		</div>
	);
}

interface CalendarGridProps {
	monthDays: CalendarDay[];
	selectedDate: Date | null;
	onSelectDate: (day: CalendarDay) => void;
}

export function CalendarGrid({
	monthDays,
	selectedDate,
	onSelectDate,
}: CalendarGridProps) {
	const selectedKey = selectedDate ? toDateKey(selectedDate) : null;
	const selectedDay = selectedDate ? startOfDay(selectedDate).getTime() : null;

	return (
		<div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
			{monthDays.map((day, idx) => {
				const dayKey = toDateKey(day.date);
				const isSelected = selectedKey && dayKey === selectedKey;
				const isToday = day.isToday;
				const dayStart = startOfDay(day.date).getTime();
				const isWeekend = (idx % 7) + 1 >= 6;
				const showToday = isToday && !isSelected && selectedDay !== dayStart;

				return (
					<button
						key={dayKey}
						type="button"
						onClick={() => onSelectDate(day)}
						className={cn(
							"relative flex items-center justify-center rounded-lg py-2 text-sm font-medium transition-colors",
							!day.inCurrentMonth && "opacity-40",
							isSelected && "bg-primary text-primary-foreground",
							!isSelected && (showToday ? "bg-primary/5 text-primary" : "hover:bg-muted/50"),
						)}
					>
						<span
							className={cn(
								isWeekend && !isSelected && "text-muted-foreground/80",
							)}
						>
							{day.date.getDate()}
						</span>
					</button>
				);
			})}
		</div>
	);
}

export const buildCalendarMonthDays = buildMonthDays;
