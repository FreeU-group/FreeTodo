/**
 * 日历工具函数
 */

export const DEFAULT_NEW_TIME = "09:00";

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

export function parseDeadline(deadline?: string): Date | null {
	if (!deadline) return null;
	// 如果 deadline 字符串没有时区信息（没有 Z 或 +/- 偏移），
	// 假设它是 UTC 时间并添加 Z 后缀，避免被解析为本地时间导致日期偏移
	let normalizedDeadline = deadline;
	if (
		deadline.includes("T") &&
		!deadline.includes("Z") &&
		!deadline.includes("+") &&
		!/\d{2}:\d{2}:\d{2}-/.test(deadline)
	) {
		normalizedDeadline = `${deadline}Z`;
	}
	const parsed = new Date(normalizedDeadline);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatHumanDate(date: Date): string {
	return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function formatTimeLabel(date: Date | null, allDayText: string): string {
	if (!date) return allDayText;
	const hh = `${date.getHours()}`.padStart(2, "0");
	const mm = `${date.getMinutes()}`.padStart(2, "0");
	return `${hh}:${mm}`;
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
