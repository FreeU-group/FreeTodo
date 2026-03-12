"use client";

/**
 * 统一的时间处理工具
 * 处理时区、跨日期、时间戳转换等问题
 */

/**
 * 获取本地时区的 Date 对象（不进行时区转换）
 * @param dateStr ISO 8601 字符串或 Date 对象
 * @returns Date 对象（本地时区）
 */
export function parseLocalDate(dateStr: string | Date): Date {
	if (dateStr instanceof Date) {
		return dateStr;
	}
	// 如果包含时区信息，解析为 UTC 然后转换为本地
	if (dateStr.includes("T") || dateStr.includes("Z") || dateStr.includes("+") || dateStr.includes("-", 10)) {
		const date = new Date(dateStr);
		// 返回本地时区的 Date 对象
		return new Date(
			date.getFullYear(),
			date.getMonth(),
			date.getDate(),
			date.getHours(),
			date.getMinutes(),
			date.getSeconds(),
			date.getMilliseconds()
		);
	}
	// 简单日期字符串，直接解析
	return new Date(dateStr);
}

/**
 * 格式化日期为本地时区的 ISO 字符串（不含时区信息）
 * @param date Date 对象
 * @returns ISO 格式字符串（本地时区）
 */
export function toLocalISOString(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");
	const seconds = String(date.getSeconds()).padStart(2, "0");
	const milliseconds = String(date.getMilliseconds()).padStart(3, "0");
	return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
}

/**
 * 计算文本段在音频中的精确偏移时间
 * 对于录音模式：使用已记录的精确时间戳
 * 对于回看模式：使用录音开始时间 + 均匀分配的偏移（临时方案，理想情况下后端应返回精确时间戳）
 *
 * @param _recordingStartTime 录音开始时间（Date 对象，保留用于未来扩展）
 * @param segmentIndex 文本段索引
 * @param totalSegments 总文本段数
 * @param recordingDuration 录音总时长（秒）
 * @param preciseOffset 精确偏移时间（秒），如果提供则优先使用（录音模式）
 * @returns 偏移时间（秒）
 */
export function calculateSegmentOffset(
	_recordingStartTime: Date,
	segmentIndex: number,
	totalSegments: number,
	recordingDuration: number,
	preciseOffset?: number
): number {
	// 如果有精确偏移（录音模式），直接使用
	if (preciseOffset !== undefined && Number.isFinite(preciseOffset)) {
		return preciseOffset;
	}
	// 否则使用均匀分配（回看模式，临时方案）
	// TODO: 后端应返回每段文本的精确时间戳
	if (recordingDuration > 0 && totalSegments > 0) {
		return (segmentIndex / totalSegments) * recordingDuration;
	}
	return 0;
}

/**
 * 计算文本段的绝对时间（用于时间标签显示）
 * @param recordingStartTime 录音开始时间
 * @param offsetSec 偏移时间（秒）
 * @returns Date 对象
 */
export function calculateSegmentAbsoluteTime(
	recordingStartTime: Date,
	offsetSec: number
): Date {
	return new Date(recordingStartTime.getTime() + offsetSec * 1000);
}

/**
 * 检查录音是否跨日期
 * @param startTime 录音开始时间
 * @param durationSec 录音时长（秒）
 * @param selectedDate 用户选择的日期
 * @returns 如果跨日期返回 true
 */
export function isRecordingCrossDate(
	startTime: Date,
	durationSec: number,
	selectedDate: Date
): boolean {
	const startDateStr = getLocalDateString(startTime);
	const selectedDateStr = getLocalDateString(selectedDate);

	// 如果开始日期与选择日期不同，肯定跨日期
	if (startDateStr !== selectedDateStr) {
		return true;
	}

	// 计算结束时间
	const endTime = new Date(startTime.getTime() + durationSec * 1000);
	const endDateStr = getLocalDateString(endTime);

	// 如果结束日期与开始日期不同，跨日期
	return endDateStr !== startDateStr;
}

/**
 * 获取录音的实际日期（用于时间标签）
 * 如果录音跨日期，使用录音的实际开始日期
 * @param recordingStartTime 录音开始时间
 * @param offsetSec 文本段偏移时间（秒）
 * @param _selectedDate 用户选择的日期（保留用于未来扩展）
 * @returns Date 对象（用于时间标签的日期部分）
 */
export function getSegmentDate(
	recordingStartTime: Date,
	offsetSec: number,
	_selectedDate: Date
): Date {
	const segmentTime = calculateSegmentAbsoluteTime(recordingStartTime, offsetSec);
	// 使用文本段的实际时间，而不是 selectedDate
	return segmentTime;
}

/**
 * 格式化日期时间（本地时区）
 * @param date Date 对象
 * @returns 格式化的日期时间字符串
 */
export function formatDateTime(date: Date): string {
	return date.toLocaleString("zh-CN", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour12: false,
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

/**
 * 格式化时间（秒数）
 * @param seconds 秒数
 * @returns "MM:SS" 格式
 */
export function formatTime(seconds: number): string {
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * 获取日期字符串（用于 API 查询）
 * 使用本地时区，避免时区转换问题
 * @param date Date 对象
 * @returns "YYYY-MM-DD" 格式
 */
export function getDateString(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * 获取本地日期字符串（用于日期比较）
 * @param date Date 对象
 * @returns "YYYY-MM-DD" 格式
 */
export function getLocalDateString(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

/**
 * 获取本地日期字符串（用于日期比较）- 别名
 * @param date Date 对象
 * @returns "YYYY-MM-DD" 格式
 */
export function getLocalDateStringForCompare(date: Date): string {
	return getLocalDateString(date);
}
