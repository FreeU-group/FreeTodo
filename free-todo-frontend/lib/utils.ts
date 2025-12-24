import clsx, { type ClassValue } from "clsx";
import dayjs from "dayjs";
import { twMerge } from "tailwind-merge";
import "dayjs/locale/zh-cn";
import type { Todo, TodoPriority, TodoStatus } from "./types";

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

// ============================================================================
// Todo 排序工具函数
// ============================================================================

/**
 * 按 order 字段排序 Todo 列表（用于子任务）
 * 优先按 order 字段排序，如果 order 相同则按创建时间升序排序
 */
export function sortTodosByOrder<T extends Todo>(todos: T[]): T[] {
	return [...todos].sort((a, b) => {
		// 优先按 order 字段排序
		const aOrder = a.order ?? 0;
		const bOrder = b.order ?? 0;
		if (aOrder !== bOrder) {
			return aOrder - bOrder;
		}
		// order 相同时，按创建时间排序
		const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
		const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
		return aTime - bTime;
	});
}

/**
 * 按原始顺序排序 Todo 列表（用于根任务）
 * 保持数组中的原始顺序（支持用户拖拽排序）
 */
export function sortTodosByOriginalOrder<T extends Todo>(
	todos: T[],
	orderMap: Map<number, number>,
): T[] {
	return [...todos].sort(
		(a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
	);
}

// ============================================================================
// Todo 国际化工具函数
// ============================================================================

/**
 * 翻译函数类型
 */
export type TranslationFunction = (
	key: string,
	values?: Record<string, string | number | Date>,
) => string;

/**
 * 获取优先级的本地化标签
 * @param priority 优先级
 * @param t 翻译函数（从 useTranslations("common") 获取）
 */
export function getPriorityLabel(
	priority: TodoPriority,
	t: TranslationFunction,
): string {
	return t(`priority.${priority}`);
}

/**
 * 获取状态的本地化标签
 * @param status 状态
 * @param t 翻译函数（从 useTranslations("common") 获取）
 */
export function getStatusLabel(
	status: TodoStatus,
	t: TranslationFunction,
): string {
	return t(`status.${status}`);
}
