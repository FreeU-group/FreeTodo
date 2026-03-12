import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

const FALLBACK_TIMEZONES = [
	"Asia/Shanghai",
	"Asia/Tokyo",
	"Europe/London",
	"Europe/Berlin",
	"America/New_York",
	"America/Los_Angeles",
	"UTC",
];

export const DEFAULT_TIME = "09:00";
export const DEFAULT_RANGE_MINUTES = 60;

export const getTimeZoneOptions = () => {
	if (typeof Intl === "undefined") return FALLBACK_TIMEZONES;
	const supported = (Intl as unknown as { supportedValuesOf?: (kind: string) => string[] })
		.supportedValuesOf;
	if (typeof supported === "function") {
		return supported("timeZone");
	}
	return FALLBACK_TIMEZONES;
};

export const resolveTimeZone = (value?: string) => value || dayjs.tz.guess();

const toZoned = (value?: string, zone?: string) => {
	if (!value) return null;
	const parsed = dayjs(value);
	if (!parsed.isValid()) return null;
	return parsed.tz(resolveTimeZone(zone));
};

export const toCalendarDate = (value?: string, zone?: string): Date | null => {
	const zoned = toZoned(value, zone);
	if (!zoned) return null;
	return new Date(zoned.year(), zoned.month(), zoned.date());
};

export const toTimeValue = (value?: string, zone?: string): string => {
	const zoned = toZoned(value, zone);
	if (!zoned) return "";
	return zoned.format("HH:mm");
};

export const formatDateLabel = (date: Date | null) =>
	date ? dayjs(date).format("YYYY-MM-DD") : "";

export const addMinutes = (timeValue: string, minutes: number) => {
	if (!timeValue) return "";
	const [hh, mm] = timeValue.split(":").map((n) => Number.parseInt(n, 10));
	if (Number.isNaN(hh) || Number.isNaN(mm)) return "";
	const total = (hh * 60 + mm + minutes) % 1440;
	const nextH = Math.floor(total / 60);
	const nextM = total % 60;
	return `${`${nextH}`.padStart(2, "0")}:${`${nextM}`.padStart(2, "0")}`;
};

export const buildIsoWithZone = (date: Date, time: string, zone: string) => {
	const dateLabel = dayjs(date).format("YYYY-MM-DD");
	const timeLabel = time || "00:00";
	return dayjs
		.tz(`${dateLabel} ${timeLabel}`, "YYYY-MM-DD HH:mm", zone)
		.toISOString();
};
