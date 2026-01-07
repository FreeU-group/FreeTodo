/**
 * 农历计算工具函数
 * 基于简化版农历算法，支持 1900-2100 年
 */

/**
 * 农历信息数据表
 * 每个元素代表一年的农历信息
 */
export const LUNAR_INFO = [
	0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0,
	0x09ad0, 0x055d2, 0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540,
	0x0d6a0, 0x0ada2, 0x095b0, 0x14977, 0x04970, 0x0a4b0, 0x0b4b5, 0x06a50,
	0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, 0x06566, 0x0d4a0,
	0x0ea50, 0x16a95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
	0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2,
	0x0a950, 0x0b557, 0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573,
	0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, 0x0aea6, 0x0ab50, 0x04b60, 0x0aae4,
	0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, 0x096d0, 0x04dd5,
	0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
	0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46,
	0x0ab60, 0x09570, 0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58,
	0x05ac0, 0x0ab60, 0x096d5, 0x092e0, 0x0c960, 0x0d954, 0x0d4a0, 0x0da50,
	0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, 0x0a950, 0x0b4a0,
	0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
	0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260,
	0x0ea65, 0x0d530, 0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0,
	0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, 0x0b5a0, 0x056d0, 0x055b2, 0x049b0,
	0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, 0x14b63, 0x09370,
	0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06aa0, 0x1a6c4, 0x0aae0,
	0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0,
	0x0a6d0, 0x055d4, 0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50,
	0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, 0x0b273, 0x06930, 0x07337, 0x06aa0,
	0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, 0x0e968, 0x0d520,
	0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
	0x0d520,
] as const;

/** 农历月份名称 */
export const LUNAR_MONTH = [
	"正",
	"二",
	"三",
	"四",
	"五",
	"六",
	"七",
	"八",
	"九",
	"十",
	"冬",
	"腊",
] as const;

/** 农历日期名称 */
export const LUNAR_DAY = [
	"初一",
	"初二",
	"初三",
	"初四",
	"初五",
	"初六",
	"初七",
	"初八",
	"初九",
	"初十",
	"十一",
	"十二",
	"十三",
	"十四",
	"十五",
	"十六",
	"十七",
	"十八",
	"十九",
	"二十",
	"廿一",
	"廿二",
	"廿三",
	"廿四",
	"廿五",
	"廿六",
	"廿七",
	"廿八",
	"廿九",
	"三十",
] as const;

/** 节气名称列表 */
export const SOLAR_TERMS = [
	"小寒",
	"大寒",
	"立春",
	"雨水",
	"惊蛰",
	"春分",
	"清明",
	"谷雨",
	"立夏",
	"小满",
	"芒种",
	"夏至",
	"小暑",
	"大暑",
	"立秋",
	"处暑",
	"白露",
	"秋分",
	"寒露",
	"霜降",
	"立冬",
	"小雪",
	"大雪",
	"冬至",
] as const;

/** 节气日期（近似值，按月份索引） */
export const SOLAR_TERM_DAYS: Record<string, number[]> = {
	"1": [6, 20],
	"2": [4, 19],
	"3": [6, 21],
	"4": [5, 20],
	"5": [6, 21],
	"6": [6, 21],
	"7": [7, 23],
	"8": [8, 23],
	"9": [8, 23],
	"10": [8, 24],
	"11": [8, 22],
	"12": [7, 22],
};

/**
 * 计算农历某年的总天数
 */
function lYearDays(y: number): number {
	let i: number;
	let sum = 348;
	for (i = 0x8000; i > 0x8; i >>= 1) {
		sum += LUNAR_INFO[y - 1900] & i ? 1 : 0;
	}
	return sum + leapDays(y);
}

/**
 * 获取农历某年的闰月月份（0 表示无闰月）
 */
function leapMonth(y: number): number {
	return LUNAR_INFO[y - 1900] & 0xf;
}

/**
 * 计算农历某年闰月的天数
 */
function leapDays(y: number): number {
	if (leapMonth(y)) {
		return LUNAR_INFO[y - 1900] & 0x10000 ? 30 : 29;
	}
	return 0;
}

/**
 * 计算农历某年某月的天数
 */
function monthDays(y: number, m: number): number {
	return LUNAR_INFO[y - 1900] & (0x10000 >> m) ? 30 : 29;
}

/**
 * 农历日期信息
 */
export interface LunarDate {
	month: number;
	day: number;
	isLeap: boolean;
}

/**
 * 将公历日期转换为农历日期
 * @param date - 公历日期
 * @returns 农历日期信息
 */
export function getLunarDate(date: Date): LunarDate {
	let i: number;
	let leap = 0;
	let temp = 0;
	const baseDate = new Date(1900, 0, 31);
	let offset = Math.floor((date.getTime() - baseDate.getTime()) / 86400000);

	for (i = 1900; i < 2101 && offset > 0; i++) {
		temp = lYearDays(i);
		offset -= temp;
	}
	if (offset < 0) {
		offset += temp;
		i--;
	}

	const year = i;
	leap = leapMonth(i);
	let isLeap = false;

	for (i = 1; i < 13 && offset > 0; i++) {
		if (leap > 0 && i === leap + 1 && !isLeap) {
			--i;
			isLeap = true;
			temp = leapDays(year);
		} else {
			temp = monthDays(year, i);
		}
		if (isLeap && i === leap + 1) {
			isLeap = false;
		}
		offset -= temp;
	}

	if (offset === 0 && leap > 0 && i === leap + 1) {
		if (isLeap) {
			isLeap = false;
		} else {
			isLeap = true;
			--i;
		}
	}
	if (offset < 0) {
		offset += temp;
		--i;
	}

	return { month: i, day: offset + 1, isLeap };
}

/**
 * 获取日期的农历文本（节气 > 月份 > 日期）
 * @param date - 公历日期
 * @returns 农历显示文本
 */
export function getLunarDayText(date: Date): string {
	const lunar = getLunarDate(date);
	const month = date.getMonth() + 1;
	const day = date.getDate();

	// 检查节气
	const termDays = SOLAR_TERM_DAYS[String(month)];
	if (termDays) {
		const termIndex = (month - 1) * 2;
		if (day === termDays[0]) {
			return SOLAR_TERMS[termIndex];
		}
		if (day === termDays[1]) {
			return SOLAR_TERMS[termIndex + 1];
		}
	}

	// 农历初一显示月份
	if (lunar.day === 1) {
		return `${lunar.isLeap ? "闰" : ""}${LUNAR_MONTH[lunar.month - 1]}月`;
	}

	return LUNAR_DAY[lunar.day - 1];
}
