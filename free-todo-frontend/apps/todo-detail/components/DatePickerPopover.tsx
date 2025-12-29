"use client";

import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocaleStore } from "@/lib/store/locale";
import { cn } from "@/lib/utils";

interface DatePickerPopoverProps {
	value?: string;
	onChange: (value?: string) => void;
	onClose: () => void;
}

// 农历数据和算法（简化版）
const LUNAR_INFO = [
	0x04bd8, 0x04ae0, 0x0a570, 0x054d5, 0x0d260, 0x0d950, 0x16554, 0x056a0,
	0x09ad0, 0x055d2, 0x04ae0, 0x0a5b6, 0x0a4d0, 0x0d250, 0x1d255, 0x0b540,
	0x0d6a0, 0x0ada2, 0x095b0, 0x14977, 0x04970, 0x0a4b0, 0x0b4b5, 0x06a50,
	0x06d40, 0x1ab54, 0x02b60, 0x09570, 0x052f2, 0x04970, 0x06566, 0x0d4a0,
	0x0ea50, 0x16a95, 0x05ad0, 0x02b60, 0x186e3, 0x092e0, 0x1c8d7, 0x0c950,
	0x0d4a0, 0x1d8a6, 0x0b550, 0x056a0, 0x1a5b4, 0x025d0, 0x092d0, 0x0d2b2,
	0x0a950, 0x0b557, 0x06ca0, 0x0b550, 0x15355, 0x04da0, 0x0a5b0, 0x14573,
	0x052b0, 0x0a9a8, 0x0e950, 0x06aa0, 0x0aea6, 0x0ab50, 0x04b60, 0x0aae4,
	0x0a570, 0x05260, 0x0f263, 0x0d950, 0x05b57, 0x056a0, 0x096d0, 0x04dd5,
	0x04ad0, 0x0a4d0, 0x0d4d4, 0x0d250, 0x0d558, 0x0b540, 0x0b6a0, 0x195a6,
	0x095b0, 0x049b0, 0x0a974, 0x0a4b0, 0x0b27a, 0x06a50, 0x06d40, 0x0af46,
	0x0ab60, 0x09570, 0x04af5, 0x04970, 0x064b0, 0x074a3, 0x0ea50, 0x06b58,
	0x05ac0, 0x0ab60, 0x096d5, 0x092e0, 0x0c960, 0x0d954, 0x0d4a0, 0x0da50,
	0x07552, 0x056a0, 0x0abb7, 0x025d0, 0x092d0, 0x0cab5, 0x0a950, 0x0b4a0,
	0x0baa4, 0x0ad50, 0x055d9, 0x04ba0, 0x0a5b0, 0x15176, 0x052b0, 0x0a930,
	0x07954, 0x06aa0, 0x0ad50, 0x05b52, 0x04b60, 0x0a6e6, 0x0a4e0, 0x0d260,
	0x0ea65, 0x0d530, 0x05aa0, 0x076a3, 0x096d0, 0x04afb, 0x04ad0, 0x0a4d0,
	0x1d0b6, 0x0d250, 0x0d520, 0x0dd45, 0x0b5a0, 0x056d0, 0x055b2, 0x049b0,
	0x0a577, 0x0a4b0, 0x0aa50, 0x1b255, 0x06d20, 0x0ada0, 0x14b63, 0x09370,
	0x049f8, 0x04970, 0x064b0, 0x168a6, 0x0ea50, 0x06aa0, 0x1a6c4, 0x0aae0,
	0x092e0, 0x0d2e3, 0x0c960, 0x0d557, 0x0d4a0, 0x0da50, 0x05d55, 0x056a0,
	0x0a6d0, 0x055d4, 0x052d0, 0x0a9b8, 0x0a950, 0x0b4a0, 0x0b6a6, 0x0ad50,
	0x055a0, 0x0aba4, 0x0a5b0, 0x052b0, 0x0b273, 0x06930, 0x07337, 0x06aa0,
	0x0ad50, 0x14b55, 0x04b60, 0x0a570, 0x054e4, 0x0d160, 0x0e968, 0x0d520,
	0x0daa0, 0x16aa6, 0x056d0, 0x04ae0, 0x0a9d4, 0x0a2d0, 0x0d150, 0x0f252,
	0x0d520,
];

const LUNAR_MONTH = [
	"正",
	"二",
	"三",
	"四",
	"五",
	"六",
	"七",
	"八",
	"九",
	"十",
	"冬",
	"腊",
];
const LUNAR_DAY = [
	"初一",
	"初二",
	"初三",
	"初四",
	"初五",
	"初六",
	"初七",
	"初八",
	"初九",
	"初十",
	"十一",
	"十二",
	"十三",
	"十四",
	"十五",
	"十六",
	"十七",
	"十八",
	"十九",
	"二十",
	"廿一",
	"廿二",
	"廿三",
	"廿四",
	"廿五",
	"廿六",
	"廿七",
	"廿八",
	"廿九",
	"三十",
];

// 节气数据
const SOLAR_TERMS = [
	"小寒",
	"大寒",
	"立春",
	"雨水",
	"惊蛰",
	"春分",
	"清明",
	"谷雨",
	"立夏",
	"小满",
	"芒种",
	"夏至",
	"小暑",
	"大暑",
	"立秋",
	"处暑",
	"白露",
	"秋分",
	"寒露",
	"霜降",
	"立冬",
	"小雪",
	"大雪",
	"冬至",
];

// 节气日期（近似值，实际需要精确计算）
const SOLAR_TERM_DAYS: Record<string, number[]> = {
	"1": [6, 20],
	"2": [4, 19],
	"3": [6, 21],
	"4": [5, 20],
	"5": [6, 21],
	"6": [6, 21],
	"7": [7, 23],
	"8": [8, 23],
	"9": [8, 23],
	"10": [8, 24],
	"11": [8, 22],
	"12": [7, 22],
};

function lYearDays(y: number) {
	let i: number;
	let sum = 348;
	for (i = 0x8000; i > 0x8; i >>= 1) {
		sum += LUNAR_INFO[y - 1900] & i ? 1 : 0;
	}
	return sum + leapDays(y);
}

function leapMonth(y: number) {
	return LUNAR_INFO[y - 1900] & 0xf;
}

function leapDays(y: number) {
	if (leapMonth(y)) {
		return LUNAR_INFO[y - 1900] & 0x10000 ? 30 : 29;
	}
	return 0;
}

function monthDays(y: number, m: number) {
	return LUNAR_INFO[y - 1900] & (0x10000 >> m) ? 30 : 29;
}

function getLunarDate(date: Date): {
	month: number;
	day: number;
	isLeap: boolean;
} {
	let i: number;
	let leap = 0;
	let temp = 0;
	const baseDate = new Date(1900, 0, 31);
	let offset = Math.floor((date.getTime() - baseDate.getTime()) / 86400000);

	for (i = 1900; i < 2101 && offset > 0; i++) {
		temp = lYearDays(i);
		offset -= temp;
	}
	if (offset < 0) {
		offset += temp;
		i--;
	}

	const year = i;
	leap = leapMonth(i);
	let isLeap = false;

	for (i = 1; i < 13 && offset > 0; i++) {
		if (leap > 0 && i === leap + 1 && !isLeap) {
			--i;
			isLeap = true;
			temp = leapDays(year);
		} else {
			temp = monthDays(year, i);
		}
		if (isLeap && i === leap + 1) {
			isLeap = false;
		}
		offset -= temp;
	}

	if (offset === 0 && leap > 0 && i === leap + 1) {
		if (isLeap) {
			isLeap = false;
		} else {
			isLeap = true;
			--i;
		}
	}
	if (offset < 0) {
		offset += temp;
		--i;
	}

	return { month: i, day: offset + 1, isLeap };
}

function getLunarDayText(date: Date): string {
	const lunar = getLunarDate(date);
	const month = date.getMonth() + 1;
	const day = date.getDate();

	// 检查节气
	const termDays = SOLAR_TERM_DAYS[String(month)];
	if (termDays) {
		const termIndex = (month - 1) * 2;
		if (day === termDays[0]) {
			return SOLAR_TERMS[termIndex];
		}
		if (day === termDays[1]) {
			return SOLAR_TERMS[termIndex + 1];
		}
	}

	// 农历初一显示月份
	if (lunar.day === 1) {
		return `${lunar.isLeap ? "闰" : ""}${LUNAR_MONTH[lunar.month - 1]}月`;
	}

	return LUNAR_DAY[lunar.day - 1];
}

// 节假日数据
interface HolidayInfo {
	name: string;
	isHoliday?: boolean; // true=休, false=班
}

function getHolidayInfo(date: Date): HolidayInfo | null {
	const year = date.getFullYear();
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const key = `${month}-${day}`;

	// 2025年节假日示例
	if (year === 2025) {
		const holidays: Record<string, HolidayInfo> = {
			"1-1": { name: "元旦", isHoliday: true },
			"1-2": { name: "", isHoliday: true },
			"1-3": { name: "", isHoliday: true },
			"1-4": { name: "", isHoliday: true },
			"12-24": { name: "平安夜" },
			"12-25": { name: "圣诞节" },
		};
		return holidays[key] || null;
	}

	return null;
}

function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

function startOfWeek(date: Date): Date {
	const d = startOfDay(date);
	const day = d.getDay();
	const diff = (day + 6) % 7;
	d.setDate(d.getDate() - diff);
	return d;
}

function startOfMonth(date: Date): Date {
	return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function toDateKey(date: Date): string {
	const y = date.getFullYear();
	const m = `${date.getMonth() + 1}`.padStart(2, "0");
	const d = `${date.getDate()}`.padStart(2, "0");
	return `${y}-${m}-${d}`;
}

interface CalendarDay {
	date: Date;
	inCurrentMonth: boolean;
	isToday: boolean;
	lunarText: string;
	holiday?: HolidayInfo;
}

function buildMonthDays(currentDate: Date): CalendarDay[] {
	const start = startOfMonth(currentDate);
	const startGrid = startOfWeek(start);
	const today = toDateKey(new Date());

	return Array.from({ length: 42 }, (_, idx) => {
		const date = addDays(startGrid, idx);
		return {
			date,
			inCurrentMonth: date.getMonth() === currentDate.getMonth(),
			isToday: toDateKey(date) === today,
			lunarText: getLunarDayText(date),
			holiday: getHolidayInfo(date) || undefined,
		};
	});
}

const WEEKDAY_KEYS = [
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
	"sunday",
] as const;
type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export function DatePickerPopover({
	value,
	onChange,
	onClose,
}: DatePickerPopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);
	const { locale } = useLocaleStore();
	const tCalendar = useTranslations("calendar");
	const tDatePicker = useTranslations("datePicker");
	const [currentMonth, setCurrentMonth] = useState<Date>(() => {
		if (value) {
			const d = new Date(value);
			return Number.isNaN(d.getTime()) ? new Date() : d;
		}
		return new Date();
	});
	const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
		if (value) {
			const d = new Date(value);
			return Number.isNaN(d.getTime()) ? new Date() : d;
		}
		// 如果没有值，默认选中今天
		return new Date();
	});
	const [selectedTime, setSelectedTime] = useState<string>(() => {
		if (value) {
			const d = new Date(value);
			if (!Number.isNaN(d.getTime())) {
				const hh = `${d.getHours()}`.padStart(2, "0");
				const mm = `${d.getMinutes()}`.padStart(2, "0");
				return `${hh}:${mm}`;
			}
		}
		return "";
	});

	const monthDays = useMemo(() => buildMonthDays(currentMonth), [currentMonth]);
	const showLunar = locale === "zh";

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				popoverRef.current &&
				!popoverRef.current.contains(event.target as Node)
			) {
				onClose();
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				onClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [onClose]);

	const handlePrevMonth = () => {
		setCurrentMonth((prev) => {
			const d = new Date(prev);
			d.setMonth(d.getMonth() - 1);
			return d;
		});
	};

	const handleNextMonth = () => {
		setCurrentMonth((prev) => {
			const d = new Date(prev);
			d.setMonth(d.getMonth() + 1);
			return d;
		});
	};

	const handleToday = () => {
		const today = new Date();
		setCurrentMonth(today);
		setSelectedDate(today);
	};

	const handleSelectDate = (day: CalendarDay) => {
		setSelectedDate(day.date);
	};

	const handleConfirm = () => {
		if (!selectedDate) {
			onClose();
			return;
		}

		const result = new Date(selectedDate);
		// 如果用户设置了时间，则使用设置的时间；否则不设置时间（保持为0:00:00）
		if (selectedTime) {
			const [hh, mm] = selectedTime
				.split(":")
				.map((n) => Number.parseInt(n, 10));
			result.setHours(hh || 0, mm || 0, 0, 0);
		} else {
			// 用户没有设置时间，只设置日期，时间保持为0:00:00
			result.setHours(0, 0, 0, 0);
		}

		onChange(result.toISOString());
		onClose();
	};

	const handleClear = () => {
		onChange(undefined);
		onClose();
	};

	return (
		<div
			ref={popoverRef}
			className="absolute left-0 top-full z-50 mt-2 w-[320px] rounded-xl border border-border bg-popover text-popover-foreground shadow-xl"
		>
			{/* 月份导航 */}
			<div className="flex items-center justify-between px-4 py-2">
				<span className="text-sm font-medium">
					{tCalendar("yearMonth", {
						year: currentMonth.getFullYear(),
						month: currentMonth.getMonth() + 1,
					})}
				</span>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={handlePrevMonth}
						className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<button
						type="button"
						onClick={handleToday}
						className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
					>
						<span className="flex h-4 w-4 items-center justify-center text-xs">
							○
						</span>
					</button>
					<button
						type="button"
						onClick={handleNextMonth}
						className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
					>
						<ChevronRight className="h-4 w-4" />
					</button>
				</div>
			</div>

			{/* 星期标题 */}
			<div className="grid grid-cols-7 px-2">
				{WEEKDAY_KEYS.map((key, idx) => (
					<span
						key={key}
						className={cn(
							"py-1 text-center text-xs font-medium",
							idx >= 5 ? "text-muted-foreground/70" : "text-muted-foreground",
						)}
					>
						{tCalendar(`weekdays.${key}` as `weekdays.${WeekdayKey}`)}
					</span>
				))}
			</div>

			{/* 日历网格 */}
			<div className="grid grid-cols-7 gap-0.5 px-2 pb-2">
				{monthDays.map((day, idx) => {
					const isSelected =
						selectedDate && toDateKey(day.date) === toDateKey(selectedDate);
					const dayOfWeek = (idx % 7) + 1;
					const isWeekend = dayOfWeek >= 6;

					return (
						<button
							key={toDateKey(day.date)}
							type="button"
							onClick={() => handleSelectDate(day)}
							className={cn(
								"relative flex flex-col items-center rounded-lg py-1 transition-colors",
								!day.inCurrentMonth && "opacity-40",
								isSelected
									? "bg-primary text-primary-foreground"
									: day.isToday
										? "bg-primary/10 text-primary"
										: "hover:bg-muted/50",
							)}
						>
							<span
								className={cn(
									"text-sm font-medium",
									isWeekend && !isSelected && "text-muted-foreground/80",
								)}
							>
								{day.date.getDate()}
							</span>
							<span
								className={cn(
									"text-[10px] leading-tight",
									isSelected
										? "text-primary-foreground/80"
										: day.lunarText.includes("月") ||
												SOLAR_TERMS.includes(day.lunarText)
											? "text-orange-500"
											: "text-muted-foreground/60",
								)}
							>
								{showLunar ? day.lunarText : ""}
							</span>
							{day.holiday?.isHoliday !== undefined && (
								<span
									className={cn(
										"absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[8px] font-bold",
										day.holiday.isHoliday
											? "bg-green-500 text-white"
											: "bg-orange-500 text-white",
									)}
								>
									{day.holiday.isHoliday ? "休" : "班"}
								</span>
							)}
						</button>
					);
				})}
			</div>

			{/* 时间选项 */}
			<div className="px-4 py-3">
				<div className="flex w-full items-center justify-between text-sm text-muted-foreground">
					<div className="flex items-center gap-2">
						<Clock className="h-4 w-4" />
						<span>{tDatePicker("time")}</span>
					</div>
					<input
						type="time"
						value={selectedTime}
						onChange={(e) => setSelectedTime(e.target.value)}
						className="rounded border border-border bg-transparent px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
					/>
				</div>
			</div>

			{/* 底部按钮 */}
			<div className="flex items-center gap-2 p-3">
				<button
					type="button"
					onClick={handleClear}
					className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
				>
					{tDatePicker("clear")}
				</button>
				<button
					type="button"
					onClick={handleConfirm}
					className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
				>
					{tDatePicker("confirm")}
				</button>
			</div>
		</div>
	);
}
