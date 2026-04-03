"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
	type CalendarDay,
	startOfDay,
	toDateKey,
	WEEKDAY_KEYS,
	type WeekdayKey,
} from "../utils";
import { SOLAR_TERMS } from "../utils/lunar-utils";

interface MonthNavigationProps {
	currentMonth: Date;
	onPrevMonth: () => void;
	onNextMonth: () => void;
	onToday: () => void;
	tCalendar: ReturnType<typeof useTranslations<"calendar">>;
}

export function MonthNavigation({
	currentMonth,
	onPrevMonth,
	onNextMonth,
	onToday,
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
					onClick={onToday}
					className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
				>
					<span className="flex h-4 w-4 items-center justify-center text-xs">
						○
					</span>
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
	rangeStart: Date | null;
	rangeEnd: Date | null;
	showLunar: boolean;
	onSelectDate: (day: CalendarDay) => void;
}

export function CalendarGrid({
	monthDays,
	selectedDate,
	rangeStart,
	rangeEnd,
	showLunar,
	onSelectDate,
}: CalendarGridProps) {
	const startKey = rangeStart ? toDateKey(rangeStart) : null;
	const endKey = rangeEnd ? toDateKey(rangeEnd) : null;
	const selectedKey = selectedDate ? toDateKey(selectedDate) : null;

	const rangeStartDay = rangeStart ? startOfDay(rangeStart) : null;
	const rangeEndDay = rangeEnd ? startOfDay(rangeEnd) : null;
	const rangeMin =
		rangeStartDay && rangeEndDay
			? rangeStartDay < rangeEndDay
				? rangeStartDay
				: rangeEndDay
			: null;
	const rangeMax =
		rangeStartDay && rangeEndDay
			? rangeStartDay > rangeEndDay
				? rangeStartDay
				: rangeEndDay
			: null;

	return (
		<div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
			{monthDays.map((day, idx) => {
				const dayKey = toDateKey(day.date);
				const isSelected = selectedKey && dayKey === selectedKey;
				const isRangeStart = startKey && dayKey === startKey;
				const isRangeEnd = endKey && dayKey === endKey;
				const isInRange =
					rangeMin &&
					rangeMax &&
					startOfDay(day.date) >= rangeMin &&
					startOfDay(day.date) <= rangeMax;
				const dayOfWeek = (idx % 7) + 1;
				const isWeekend = dayOfWeek >= 6;

				return (
					<button
						key={toDateKey(day.date)}
						type="button"
						onClick={() => onSelectDate(day)}
						className={cn(
							"relative flex flex-col items-center rounded-lg py-1 transition-colors",
							!day.inCurrentMonth && "opacity-40",
							(isSelected || isRangeStart || isRangeEnd) &&
								"bg-primary text-primary-foreground",
							!isSelected &&
								!isRangeStart &&
								!isRangeEnd &&
								isInRange &&
								"bg-primary/10 text-primary",
							!isSelected &&
								!isRangeStart &&
								!isRangeEnd &&
								!isInRange &&
								(day.isToday
									? "bg-primary/5 text-primary"
									: "hover:bg-muted/50"),
						)}
					>
						<span
							className={cn(
								"text-sm font-medium",
								isWeekend && !(isSelected || isRangeStart || isRangeEnd) &&
									"text-muted-foreground/80",
							)}
						>
							{day.date.getDate()}
						</span>
						<span
							className={cn(
								"text-[10px] leading-tight",
								isSelected || isRangeStart || isRangeEnd
									? "text-primary-foreground/80"
									: day.lunarText.includes("月") ||
											SOLAR_TERMS.includes(
												day.lunarText as (typeof SOLAR_TERMS)[number],
											)
										? "text-orange-500"
										: "text-muted-foreground/60",
							)}
						>
							{showLunar ? day.lunarText : ""}
						</span>
						{day.holiday?.isHoliday !== undefined && (
							<span
								className={cn(
									"absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[8px] font-bold",
									day.holiday.isHoliday
										? "bg-green-500 text-white"
										: "bg-orange-500 text-white",
								)}
							>
								{day.holiday.isHoliday ? "休" : "班"}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
}
