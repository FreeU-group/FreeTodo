import clsx, { type ClassValue } from "clsx";
import dayjs from "dayjs";
import { twMerge } from "tailwind-merge";
import "dayjs/locale/zh-cn";

dayjs.locale("zh-cn");

export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

// 格式化日期时间
export function formatDateTime(
	date: string | Date,
	format = "YYYY-MM-DD HH:mm:ss",
): string {
	return dayjs(date).format(format);
}

// 计算时长（秒）
export function calculateDuration(startTime: string, endTime: string): number {
	const start = dayjs(startTime);
	const end = dayjs(endTime);
	const seconds = end.diff(start, "second");
	// 不足1秒算1秒，使用进一法
	return Math.max(1, seconds);
}

// 格式化时长
export function formatDuration(
	seconds: number,
	timeTranslations?: Record<string, string>,
): string {
	// 不足1秒算1秒
	if (seconds < 1) {
		seconds = 1;
	}

	// 计算各个时间单位
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const secs = seconds % 60;

	// 如果没有提供翻译，使用中文默认值（向后兼容）
	if (!timeTranslations) {
		const parts = [];
		if (days > 0) parts.push(`${days} 天`);
		if (hours > 0) parts.push(`${hours} 小时`);
		if (minutes > 0) parts.push(`${minutes} 分钟`);
		if (secs > 0) parts.push(`${secs} 秒`);
		return parts.length > 0 ? parts.join(" ") : "1 秒";
	}

	// 使用提供的翻译
	const parts = [];
	if (days > 0) parts.push(`${days} ${timeTranslations.days}`);
	if (hours > 0) parts.push(`${hours} ${timeTranslations.hours}`);
	if (minutes > 0) parts.push(`${minutes} ${timeTranslations.minutes}`);
	if (secs > 0) parts.push(`${secs} ${timeTranslations.seconds}`);

	// 如果所有单位都是0（理论上不会发生，因为最小是1秒），返回"1 秒"
	return parts.length > 0 ? parts.join(" ") : `1 ${timeTranslations.seconds}`;
}
