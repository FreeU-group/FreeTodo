/**
 * 时间工具函数
 * 处理 UTC 时间和本地时间之间的转换
 */

/**
 * 将 UTC ISO 字符串转换为本地时间字符串（用于 input[type="datetime-local"]）
 * @param utcIso UTC 时间 ISO 字符串（如 "2025-12-31T15:13:16.855Z"）
 * @returns 本地时间字符串（如 "2025-12-31T23:13"），格式为 YYYY-MM-DDTHH:mm
 */
export function utcToLocalInput(utcIso: string): string {
	if (!utcIso) return "";
	const date = new Date(utcIso);
	if (Number.isNaN(date.getTime())) return "";

	// 获取本地时间的各个部分
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	const hours = String(date.getHours()).padStart(2, "0");
	const minutes = String(date.getMinutes()).padStart(2, "0");

	return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * 将本地时间字符串（来自 input[type="datetime-local"]）转换为 UTC ISO 字符串
 * @param localInput 本地时间字符串（如 "2025-12-31T23:13"）
 * @returns UTC ISO 字符串（如 "2025-12-31T15:13:00.000Z"）
 */
export function localToUtcIso(localInput: string): string {
	if (!localInput) return "";
	const date = new Date(localInput);
	if (Number.isNaN(date.getTime())) return "";
	return date.toISOString();
}

/**
 * 将 UTC ISO 字符串转换为本地时间显示字符串
 * @param utcIso UTC 时间 ISO 字符串
 * @param format 格式化选项（可选）
 * @returns 本地时间显示字符串
 */
export function utcToLocalDisplay(
	utcIso: string,
	format?: "date" | "datetime" | "time",
): string {
	if (!utcIso) return "";
	const date = new Date(utcIso);
	if (Number.isNaN(date.getTime())) return "";

	switch (format) {
		case "date":
			return date.toLocaleDateString();
		case "time":
			return date.toLocaleTimeString();
		default:
			return date.toLocaleString();
	}
}
