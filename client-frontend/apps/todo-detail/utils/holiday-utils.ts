/**
 * 节假日工具函数
 * 管理中国法定节假日和调休信息
 */

/**
 * 节假日信息接口
 */
export interface HolidayInfo {
	/** 节日名称 */
	name: string;
	/** 是否放假（true=休息，false=调休上班，undefined=普通节日） */
	isHoliday?: boolean;
}

/**
 * 年度节假日配置类型
 */
type YearHolidayConfig = Record<string, HolidayInfo>;

/**
 * 2025年节假日配置
 * 格式: "月-日": { name: "节日名称", isHoliday: true/false }
 */
const HOLIDAYS_2025: YearHolidayConfig = {
	// 元旦
	"1-1": { name: "元旦", isHoliday: true },
	"1-2": { name: "", isHoliday: true },
	"1-3": { name: "", isHoliday: true },
	"1-4": { name: "", isHoliday: true },
	// 西方节日（仅标记，不放假）
	"12-24": { name: "平安夜" },
	"12-25": { name: "圣诞节" },
};

/**
 * 2026年节假日配置
 */
const HOLIDAYS_2026: YearHolidayConfig = {
	// 元旦
	"1-1": { name: "元旦", isHoliday: true },
	"1-2": { name: "", isHoliday: true },
	"1-3": { name: "", isHoliday: true },
};

/**
 * 所有年份的节假日配置
 */
const HOLIDAYS_BY_YEAR: Record<number, YearHolidayConfig> = {
	2025: HOLIDAYS_2025,
	2026: HOLIDAYS_2026,
};

/**
 * 获取指定日期的节假日信息
 * @param date - 日期对象
 * @returns 节假日信息，如果不是节假日则返回 null
 */
export function getHolidayInfo(date: Date): HolidayInfo | null {
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const key = `${month}-${day}`;

	const yearHolidays = HOLIDAYS_BY_YEAR[year];
	if (yearHolidays) {
		return yearHolidays[key] || null;
	}

	return null;
}

/**
 * 检查指定日期是否为法定假日
 * @param date - 日期对象
 * @returns 是否为法定假日
 */
export function isHoliday(date: Date): boolean {
	const info = getHolidayInfo(date);
	return info?.isHoliday === true;
}

/**
 * 检查指定日期是否为调休工作日
 * @param date - 日期对象
 * @returns 是否为调休工作日
 */
export function isWorkday(date: Date): boolean {
	const info = getHolidayInfo(date);
	return info?.isHoliday === false;
}
