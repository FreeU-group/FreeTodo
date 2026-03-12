import type { JournalRefreshMode } from "@/lib/store/journal-store";

const pad = (value: number) => value.toString().padStart(2, "0");

export const formatDateInput = (value: Date) => {
	return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
};

export const parseDateInput = (value: string) => {
	const [year, month, day] = value.split("-").map(Number);
	if (!year || !month || !day) return new Date();
	return new Date(year, month - 1, day);
};

export const parseJournalDate = (value: string) => {
	const datePart = value.split("T")[0] ?? value;
	return parseDateInput(datePart);
};

export const normalizeDateOnly = (value: Date) =>
	new Date(value.getFullYear(), value.getMonth(), value.getDate());

export const getDayRange = (value: Date) => {
	const start = new Date(
		value.getFullYear(),
		value.getMonth(),
		value.getDate(),
		0,
		0,
		0,
		0,
	);
	const end = new Date(
		value.getFullYear(),
		value.getMonth(),
		value.getDate(),
		23,
		59,
		59,
		999,
	);
	return { start, end };
};

const parseTimeString = (value: string) => {
	const [hours = "0", minutes = "0"] = value.split(":");
	return {
		hours: Number(hours),
		minutes: Number(minutes),
	};
};

export const resolveBucketRange = (
	reference: Date,
	mode: JournalRefreshMode,
	fixedTime: string,
	workHoursEnd: string,
	customTime: string,
) => {
	const timeSource =
		mode === "workHours"
			? workHoursEnd
			: mode === "custom"
				? customTime
				: fixedTime;
	const { hours, minutes } = parseTimeString(timeSource);

	const bucketStart = new Date(reference);
	bucketStart.setHours(hours, minutes, 0, 0);
	if (reference < bucketStart) {
		bucketStart.setDate(bucketStart.getDate() - 1);
	}

	const bucketEnd = new Date(bucketStart);
	bucketEnd.setDate(bucketEnd.getDate() + 1);

	return { bucketStart, bucketEnd, bucketTime: timeSource };
};
