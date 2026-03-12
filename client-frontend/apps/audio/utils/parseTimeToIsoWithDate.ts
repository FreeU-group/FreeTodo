"use client";

/**
 * 将中文/自然语言时间解析为带日期的 ISO 字符串；解析失败返回 undefined。
 */
export function parseTimeToIsoWithDate(raw: string | null | undefined, selectedDate: Date): string | undefined {
	if (!raw) return undefined;
	const abs = Date.parse(raw);
	if (!Number.isNaN(abs)) return new Date(abs).toISOString();

	const normalized = raw.replace(/钟/g, "").replace(/：/g, ":").trim();
	const m = normalized.match(
		/(早上|上午|中午|下午|晚上|傍晚|夜里|凌晨)?\s*([0-9一二三四五六七八九十两]{1,3})\s*点(?:\s*(半|([0-9]{1,2})\s*分))?/,
	);
	if (!m) return undefined;

	const period = m[1] || "";
	const hourRaw = m[2];
	const half = m[3] === "半";
	const minRaw = m[4];

	const cnToNum = (s: string): number => {
		if (/^\d+$/.test(s)) return Number(s);
		const map: Record<string, number> = {
			零: 0,
			一: 1,
			二: 2,
			两: 2,
			三: 3,
			四: 4,
			五: 5,
			六: 6,
			七: 7,
			八: 8,
			九: 9,
			十: 10,
		};
		if (s === "十") return 10;
		if (s.length === 2 && s[0] === "十") return 10 + (map[s[1]] ?? 0);
		if (s.length === 2 && s[1] === "十") return (map[s[0]] ?? 0) * 10;
		if (s.length === 3 && s[1] === "十") return (map[s[0]] ?? 0) * 10 + (map[s[2]] ?? 0);
		return map[s] ?? 0;
	};

	let hour = cnToNum(hourRaw);
	let minute = half ? 30 : minRaw ? Number(minRaw) : 0;
	if (!Number.isFinite(hour) || hour < 0 || hour > 23) return undefined;
	if (!Number.isFinite(minute) || minute < 0 || minute > 59) minute = 0;

	if (/(下午|晚上|傍晚|夜里)/.test(period) && hour < 12) hour += 12;
	if (/中午/.test(period) && hour >= 1 && hour <= 11) hour += 12;

	const d = new Date(selectedDate);
	d.setHours(hour, minute, 0, 0);
	return d.toISOString();
}

// formatDateTime 和 formatTime 已移至 timeUtils.ts
// 请使用 timeUtils 中的函数以保持一致性
export { formatDateTime, formatTime } from "./timeUtils";
