export const REMINDER_PRESET_MINUTES = [0, 5, 10, 30, 60, 1440];

export type ReminderUnit = "minutes" | "hours" | "days";

export const sanitizeReminderOffsets = (value: number[]): number[] => {
	const cleaned = value
		.map((item) => Number(item))
		.filter((item) => Number.isFinite(item) && item >= 0);
	return Array.from(new Set(cleaned)).sort((a, b) => a - b);
};

export const normalizeReminderOffsets = (
	value: number[] | null | undefined,
	fallback: number[] = [],
): number[] => {
	if (value === null || value === undefined) {
		return [...fallback];
	}
	return sanitizeReminderOffsets(value);
};

export const formatReminderOffset = (
	t: (key: string, values?: Record<string, string | number | Date>) => string,
	minutes: number,
): string => {
	if (minutes === 0) return t("atTime");
	if (minutes < 60) return t("minutesBefore", { count: minutes });
	if (minutes % 1440 === 0) {
		return t("daysBefore", { count: minutes / 1440 });
	}
	if (minutes % 60 === 0) {
		return t("hoursBefore", { count: minutes / 60 });
	}
	return t("minutesBefore", { count: minutes });
};

export const formatReminderSummary = (
	t: (key: string, values?: Record<string, string | number | Date>) => string,
	offsets: number[],
	emptyLabel: string,
): string => {
	if (!offsets.length) return emptyLabel;
	return offsets.map((offset) => formatReminderOffset(t, offset)).join(", ");
};
