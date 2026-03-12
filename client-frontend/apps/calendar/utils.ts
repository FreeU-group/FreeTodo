/**
 * 日历工具函数
 */

export const DEFAULT_NEW_TIME = "09:00";
export const DEFAULT_WORK_START_MINUTES = 8 * 60;
export const DEFAULT_WORK_END_MINUTES = 22 * 60;
export const MINUTES_PER_SLOT = 15;
export const DEFAULT_DURATION_MINUTES = 30;

export function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

export function endOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(23, 59, 59, 999);
	return d;
}

export function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

export function addMonths(date: Date, months: number): Date {
	const d = new Date(date.getFullYear(), date.getMonth(), 1);
	d.setMonth(d.getMonth() + months);
	return startOfMonth(d);
}

export function startOfWeek(date: Date): Date {
	const d = startOfDay(date);
	const day = d.getDay(); // Sunday=0
	const diff = (day + 6) % 7; // Monday as first day
	d.setDate(d.getDate() - diff);
	return d;
}

export function startOfMonth(date: Date): Date {
	return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

export function endOfMonth(date: Date): Date {
	return endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

export function getWeekOfYear(date: Date): number {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	// Set to Thursday of current week (ISO week starts Monday)
	d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
	const yearStart = new Date(d.getFullYear(), 0, 1);
	const weekNumber = Math.ceil(
		((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
	);
	return weekNumber;
}

export function toDateKey(date: Date): string {
	const y = date.getFullYear();
	const m = `${date.getMonth() + 1}`.padStart(2, "0");
	const d = `${date.getDate()}`.padStart(2, "0");
	return `${y}-${m}-${d}`;
}

export function parseTodoDateTime(value?: string): Date | null {
	if (!value) return null;
	let normalizedValue = value;
	if (
		value.includes("T") &&
		!value.includes("Z") &&
		!value.includes("+") &&
		!/\d{2}:\d{2}:\d{2}-/.test(value)
	) {
		normalizedValue = `${value}Z`;
	}
	const parsed = new Date(normalizedValue);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseScheduleTime(value?: string): Date | null {
	if (!value) return null;
	// 如果时间字符串没有时区信息（没有 Z 或 +/- 偏移），
	// 假设它是 UTC 时间并添加 Z 后缀，避免被解析为本地时间导致日期偏移
	let normalizedValue = value;
	if (
		value.includes("T") &&
		!value.includes("Z") &&
		!value.includes("+") &&
		!/\d{2}:\d{2}:\d{2}-/.test(value)
	) {
		normalizedValue = `${value}Z`;
	}
	const parsed = new Date(normalizedValue);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function parseDeadline(deadline?: string): Date | null {
	return parseTodoDateTime(deadline);
}

export function isAllDayDeadlineString(value?: string): boolean {
	if (!value) return false;
	if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
	if (
		value.includes("T00:00:00") &&
		!value.includes("Z") &&
		!value.includes("+") &&
		!/\d{2}:\d{2}:\d{2}-/.test(value)
	) {
		return true;
	}
	return false;
}

export function formatHumanDate(date: Date): string {
	return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatMonthLabel(date: Date): string {
	return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

export function formatTimeLabel(date: Date | null, allDayText: string): string {
	if (!date) return allDayText;
	const hh = `${date.getHours()}`.padStart(2, "0");
	const mm = `${date.getMinutes()}`.padStart(2, "0");
	return `${hh}:${mm}`;
}

export function formatTimeRangeLabel(start: number, end: number): string {
	return `${formatMinutesLabel(start)}-${formatMinutesLabel(end)}`;
}

export function formatMinutesLabel(minutes: number): string {
	const hh = `${Math.floor(minutes / 60)}`.padStart(2, "0");
	const mm = `${minutes % 60}`.padStart(2, "0");
	return `${hh}:${mm}`;
}

export function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

export function getMinutesFromDate(date: Date): number {
	return date.getHours() * 60 + date.getMinutes();
}

export function addMinutes(date: Date, minutes: number): Date {
	const d = new Date(date);
	d.setMinutes(d.getMinutes() + minutes);
	return d;
}

export function setMinutesOnDate(date: Date, minutes: number): Date {
	const d = startOfDay(date);
	d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
	return d;
}

export function floorToMinutes(minutes: number, step = MINUTES_PER_SLOT): number {
	return Math.floor(minutes / step) * step;
}

export function ceilToMinutes(minutes: number, step = MINUTES_PER_SLOT): number {
	return Math.ceil(minutes / step) * step;
}

export function clampMinutes(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

export function buildMonthDays(
	currentDate: Date,
): Array<{ date: Date; inCurrentMonth?: boolean }> {
	const start = startOfMonth(currentDate);
	const startGrid = startOfWeek(start);
	return Array.from({ length: 42 }, (_, idx) => {
		const date = addDays(startGrid, idx);
		return { date, inCurrentMonth: date.getMonth() === currentDate.getMonth() };
	});
}

export function buildWeekDays(
	currentDate: Date,
): Array<{ date: Date; inCurrentMonth?: boolean }> {
	const start = startOfWeek(currentDate);
	return Array.from({ length: 7 }, (_, idx) => ({ date: addDays(start, idx) }));
}
