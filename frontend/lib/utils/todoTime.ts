import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);

const TZ_SUFFIX = /(Z|[+-]\d{2}:?\d{2})$/i;

export const resolveTodoTimeZone = (timeZone?: string) =>
	timeZone || dayjs.tz.guess();

const hasExplicitTimeZone = (value: string) => TZ_SUFFIX.test(value);

export const parseTodoDateTime = (value?: string, timeZone?: string) => {
	if (!value) return null;
	const zone = resolveTodoTimeZone(timeZone);
	const trimmed = value.trim();
	const parsed = hasExplicitTimeZone(trimmed)
		? dayjs(trimmed)
		: dayjs.tz(trimmed, zone);
	if (!parsed.isValid()) return null;
	return parsed.tz(zone);
};

export const formatTodoDateTime = (
	value?: string,
	timeZone?: string,
	format = "YYYY-MM-DD HH:mm",
) => {
	const zoned = parseTodoDateTime(value, timeZone);
	return zoned ? zoned.format(format) : "";
};

export const formatTodoDateOnly = (value?: string, timeZone?: string) =>
	formatTodoDateTime(value, timeZone, "YYYY-MM-DD");

export const formatTodoTimeOnly = (value?: string, timeZone?: string) =>
	formatTodoDateTime(value, timeZone, "HH:mm");

export const toTodoDate = (value?: string, timeZone?: string) => {
	const zoned = parseTodoDateTime(value, timeZone);
	return zoned ? zoned.toDate() : null;
};

export const formatTodoIntl = (
	value: string,
	timeZone: string | undefined,
	locale: string,
	options: Intl.DateTimeFormatOptions,
) => {
	const zoned = parseTodoDateTime(value, timeZone);
	if (!zoned) return "";
	const zone = resolveTodoTimeZone(timeZone);
	return new Intl.DateTimeFormat(locale, {
		...options,
		timeZone: zone,
	}).format(zoned.toDate());
};
