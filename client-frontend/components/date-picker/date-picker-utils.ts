"use client";

export interface CalendarDay {
	date: Date;
	inCurrentMonth: boolean;
	isToday: boolean;
}

const pad = (value: number) => `${value}`.padStart(2, "0");

export const toDateKey = (date: Date) =>
	`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const startOfDay = (date: Date) => {
	const next = new Date(date);
	next.setHours(0, 0, 0, 0);
	return next;
};

const addDays = (date: Date, days: number) => {
	const next = new Date(date);
	next.setDate(next.getDate() + days);
	return next;
};

const startOfWeek = (date: Date) => {
	const day = date.getDay();
	const diff = (day + 6) % 7;
	return addDays(date, -diff);
};

const startOfMonth = (date: Date) =>
	startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));

export const buildMonthDays = (currentDate: Date): CalendarDay[] => {
	const start = startOfMonth(currentDate);
	const gridStart = startOfWeek(start);
	const todayKey = toDateKey(new Date());

	return Array.from({ length: 42 }, (_, idx) => {
		const date = addDays(gridStart, idx);
		return {
			date,
			inCurrentMonth: date.getMonth() === currentDate.getMonth(),
			isToday: toDateKey(date) === todayKey,
		};
	});
};

export const WEEKDAY_KEYS = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];
