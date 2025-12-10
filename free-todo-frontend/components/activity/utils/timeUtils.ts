import type { Activity } from "@/lib/types/activity";

const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * ONE_MINUTE;
const ONE_DAY = 24 * ONE_HOUR;

function toDate(value?: string | null): Date | null {
	if (!value) return null;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
}

function isSameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

function isYesterday(target: Date, now: Date): boolean {
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	return isSameDay(target, yesterday);
}

function isSameWeek(target: Date, now: Date): boolean {
	// 以周一为起始
	const day = now.getDay() === 0 ? 7 : now.getDay();
	const weekStart = new Date(now);
	weekStart.setHours(0, 0, 0, 0);
	weekStart.setDate(now.getDate() - (day - 1));
	const weekEnd = new Date(weekStart);
	weekEnd.setDate(weekStart.getDate() + 6);
	return target >= weekStart && target <= weekEnd;
}

export function formatRelativeTime(time?: string | null): string {
	const d = toDate(time);
	if (!d) return "Unknown time";

	const now = new Date();
	const diff = now.getTime() - d.getTime();

	if (diff < ONE_MINUTE) return "Just now";
	if (diff < ONE_HOUR) {
		const minutes = Math.round(diff / ONE_MINUTE);
		return `${minutes} minute${minutes > 1 ? "s" : ""} ago`;
	}
	if (diff < ONE_DAY) {
		const hours = Math.round(diff / ONE_HOUR);
		return `${hours} hour${hours > 1 ? "s" : ""} ago`;
	}

	const dateStr = d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
	return dateStr;
}

export function formatTimeRange(
	start?: string | null,
	end?: string | null,
): string {
	const startDate = toDate(start);
	const endDate = toDate(end);

	if (!startDate) return "Unknown time";

	const formatter = new Intl.DateTimeFormat(undefined, {
		hour: "numeric",
		minute: "2-digit",
	});

	const startLabel = `${formatRelativeTime(start)} ~ ${formatter.format(startDate)}`;
	if (!endDate) return startLabel;

	return `${startLabel} → ${formatter.format(endDate)}`;
}

export type ActivityGroup = {
	label: string;
	items: Activity[];
};

export function groupActivitiesByTime(activities: Activity[]): ActivityGroup[] {
	const now = new Date();
	const groups: Record<string, Activity[]> = {
		Today: [],
		Yesterday: [],
		"This Week": [],
		Older: [],
	};

	for (const activity of activities) {
		const startDate = toDate(activity.start_time);
		if (!startDate) {
			groups.Older.push(activity);
			continue;
		}

		if (isSameDay(startDate, now)) {
			groups.Today.push(activity);
		} else if (isYesterday(startDate, now)) {
			groups.Yesterday.push(activity);
		} else if (isSameWeek(startDate, now)) {
			groups["This Week"].push(activity);
		} else {
			groups.Older.push(activity);
		}
	}

	return Object.entries(groups)
		.filter(([, items]) => items.length > 0)
		.map(([label, items]) => ({ label, items }));
}
