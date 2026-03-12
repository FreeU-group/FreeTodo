/**
 * 日期选择器工具函数
 * 提供日期计算和格式化功能
 */

import { getHolidayInfo, type HolidayInfo } from "./holiday-utils";
import { getLunarDayText } from "./lunar-utils";

/**
 * 日历单元格数据
 */
export interface CalendarDay {
	/** 日期对象 */
	date: Date;
	/** 是否在当前显示月份内 */
	inCurrentMonth: boolean;
	/** 是否为今天 */
	isToday: boolean;
	/** 农历文本 */
	lunarText: string;
	/** 节假日信息 */
	holiday?: HolidayInfo;
}

/**
 * 获取日期的开始时间（0:00:00）
 */
export function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

/**
 * 日期加减天数
 * @param date - 基础日期
 * @param days - 要添加的天数（可为负数）
 */
export function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

/**
 * 获取日期所在周的周一
 */
export function startOfWeek(date: Date): Date {
	const d = startOfDay(date);
	const day = d.getDay();
	const diff = (day + 6) % 7;
	d.setDate(d.getDate() - diff);
	return d;
}

/**
 * 获取日期所在月份的第一天
 */
export function startOfMonth(date: Date): Date {
	return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

/**
 * 将日期转换为 YYYY-MM-DD 格式字符串
 */
export function toDateKey(date: Date): string {
	const y = date.getFullYear();
	const m = `${date.getMonth() + 1}`.padStart(2, "0");
	const d = `${date.getDate()}`.padStart(2, "0");
	return `${y}-${m}-${d}`;
}

/**
 * 构建月历数据
 * @param currentDate - 当前显示的月份日期
 * @returns 包含 42 天的日历数据（6周 × 7天）
 */
export function buildMonthDays(currentDate: Date): CalendarDay[] {
	const start = startOfMonth(currentDate);
	const startGrid = startOfWeek(start);
	const today = toDateKey(new Date());

	return Array.from({ length: 42 }, (_, idx) => {
		const date = addDays(startGrid, idx);
		return {
			date,
			inCurrentMonth: date.getMonth() === currentDate.getMonth(),
			isToday: toDateKey(date) === today,
			lunarText: getLunarDayText(date),
			holiday: getHolidayInfo(date) || undefined,
		};
	});
}

/**
 * 星期名称的国际化键值
 */
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
