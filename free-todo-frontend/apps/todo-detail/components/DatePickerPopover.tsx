"use client";

import { ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocaleStore } from "@/lib/store/locale";
import { cn } from "@/lib/utils";
import {
	buildMonthDays,
	type CalendarDay,
	toDateKey,
	WEEKDAY_KEYS,
	type WeekdayKey,
} from "../utils";
import { SOLAR_TERMS } from "../utils/lunar-utils";

interface DatePickerPopoverProps {
	value?: string;
	onChange: (value?: string) => void;
	onClose: () => void;
}

/**
 * 日期选择器弹出组件
 * 支持选择日期和时间，显示农历信息和节假日标记
 */
export function DatePickerPopover({
	value,
	onChange,
	onClose,
}: DatePickerPopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);
	const { locale } = useLocaleStore();
	const tCalendar = useTranslations("calendar");
	const tDatePicker = useTranslations("datePicker");

	// 当前显示的月份
	const [currentMonth, setCurrentMonth] = useState<Date>(() => {
		if (value) {
			const d = new Date(value);
			return Number.isNaN(d.getTime()) ? new Date() : d;
		}
		return new Date();
	});

	// 选中的日期
	const [selectedDate, setSelectedDate] = useState<Date | null>(() => {
		if (value) {
			const d = new Date(value);
			return Number.isNaN(d.getTime()) ? new Date() : d;
		}
		// 如果没有值，默认选中今天
		return new Date();
	});

	// 选中的时间
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

	// 构建月历数据
	const monthDays = useMemo(() => buildMonthDays(currentMonth), [currentMonth]);

	// 是否显示农历
	const showLunar = locale === "zh";

	// 点击外部关闭
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

	// 上一月
	const handlePrevMonth = () => {
		setCurrentMonth((prev) => {
			const d = new Date(prev);
			d.setMonth(d.getMonth() - 1);
			return d;
		});
	};

	// 下一月
	const handleNextMonth = () => {
		setCurrentMonth((prev) => {
			const d = new Date(prev);
			d.setMonth(d.getMonth() + 1);
			return d;
		});
	};

	// 回到今天
	const handleToday = () => {
		const today = new Date();
		setCurrentMonth(today);
		setSelectedDate(today);
	};

	// 选择日期
	const handleSelectDate = (day: CalendarDay) => {
		setSelectedDate(day.date);
	};

	// 确认选择
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

	// 清除日期
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
			<MonthNavigation
				currentMonth={currentMonth}
				onPrevMonth={handlePrevMonth}
				onNextMonth={handleNextMonth}
				onToday={handleToday}
				tCalendar={tCalendar}
			/>

			{/* 星期标题 */}
			<WeekdayHeader tCalendar={tCalendar} />

			{/* 日历网格 */}
			<CalendarGrid
				monthDays={monthDays}
				selectedDate={selectedDate}
				showLunar={showLunar}
				onSelectDate={handleSelectDate}
			/>

			{/* 时间选项 */}
			<TimeInput
				selectedTime={selectedTime}
				onTimeChange={setSelectedTime}
				tDatePicker={tDatePicker}
			/>

			{/* 底部按钮 */}
			<ActionButtons
				onClear={handleClear}
				onConfirm={handleConfirm}
				tDatePicker={tDatePicker}
			/>
		</div>
	);
}

// ============== 子组件 ==============

interface MonthNavigationProps {
	currentMonth: Date;
	onPrevMonth: () => void;
	onNextMonth: () => void;
	onToday: () => void;
	tCalendar: ReturnType<typeof useTranslations<"calendar">>;
}

/** 月份导航组件 */
function MonthNavigation({
	currentMonth,
	onPrevMonth,
	onNextMonth,
	onToday,
	tCalendar,
}: MonthNavigationProps) {
	return (
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
					onClick={onPrevMonth}
					className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
				>
					<ChevronLeft className="h-4 w-4" />
				</button>
				<button
					type="button"
					onClick={onToday}
					className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
				>
					<span className="flex h-4 w-4 items-center justify-center text-xs">
						○
					</span>
				</button>
				<button
					type="button"
					onClick={onNextMonth}
					className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
				>
					<ChevronRight className="h-4 w-4" />
				</button>
			</div>
		</div>
	);
}

interface WeekdayHeaderProps {
	tCalendar: ReturnType<typeof useTranslations<"calendar">>;
}

/** 星期标题组件 */
function WeekdayHeader({ tCalendar }: WeekdayHeaderProps) {
	return (
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
	);
}

interface CalendarGridProps {
	monthDays: CalendarDay[];
	selectedDate: Date | null;
	showLunar: boolean;
	onSelectDate: (day: CalendarDay) => void;
}

/** 日历网格组件 */
function CalendarGrid({
	monthDays,
	selectedDate,
	showLunar,
	onSelectDate,
}: CalendarGridProps) {
	return (
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
						onClick={() => onSelectDate(day)}
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
											SOLAR_TERMS.includes(
												day.lunarText as (typeof SOLAR_TERMS)[number],
											)
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
	);
}

interface TimeInputProps {
	selectedTime: string;
	onTimeChange: (time: string) => void;
	tDatePicker: ReturnType<typeof useTranslations<"datePicker">>;
}

/** 时间输入组件 */
function TimeInput({ selectedTime, onTimeChange, tDatePicker }: TimeInputProps) {
	return (
		<div className="px-4 py-3">
			<div className="flex w-full items-center justify-between text-sm text-muted-foreground">
				<div className="flex items-center gap-2">
					<Clock className="h-4 w-4" />
					<span>{tDatePicker("time")}</span>
				</div>
				<input
					type="time"
					value={selectedTime}
					onChange={(e) => onTimeChange(e.target.value)}
					className="rounded border border-border bg-transparent px-2 py-0.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
				/>
			</div>
		</div>
	);
}

interface ActionButtonsProps {
	onClear: () => void;
	onConfirm: () => void;
	tDatePicker: ReturnType<typeof useTranslations<"datePicker">>;
}

/** 操作按钮组件 */
function ActionButtons({
	onClear,
	onConfirm,
	tDatePicker,
}: ActionButtonsProps) {
	return (
		<div className="flex items-center gap-2 p-3">
			<button
				type="button"
				onClick={onClear}
				className="flex-1 rounded-lg border border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
			>
				{tDatePicker("clear")}
			</button>
			<button
				type="button"
				onClick={onConfirm}
				className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
			>
				{tDatePicker("confirm")}
			</button>
		</div>
	);
}
