"use client";

import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { normalizeReminderOffsets } from "@/lib/reminders";
import { useLocaleStore } from "@/lib/store/locale";
import type { UpdateTodoInput } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
	buildMonthDays,
	type CalendarDay,
	startOfDay,
} from "../utils";
import { CalendarGrid, MonthNavigation, WeekdayHeader } from "./DatePickerCalendar";
import { DatePickerSidePanel } from "./DatePickerSidePanel";
import {
	addMinutes,
	buildIsoWithZone,
	DEFAULT_RANGE_MINUTES,
	DEFAULT_TIME,
	getTimeZoneOptions,
	resolveTimeZone,
	toCalendarDate,
	toTimeValue,
} from "./datePickerUtils";

interface DatePickerPopoverProps {
	anchorRef: RefObject<HTMLElement | null>;
	startTime?: string;
	endTime?: string;
	timeZone?: string;
	isAllDay?: boolean;
	reminderOffsets?: number[] | null;
	rrule?: string | null;
	onSave: (input: UpdateTodoInput) => void;
	onClose: () => void;
}

const POPOVER_MARGIN = 8;

type TabKey = "date" | "range";

type DateTarget = "start" | "end";

export function DatePickerPopover({
	anchorRef,
	startTime,
	endTime,
	timeZone,
	isAllDay,
	reminderOffsets,
	rrule,
	onSave,
	onClose,
}: DatePickerPopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);
	const { locale } = useLocaleStore();
	const tCalendar = useTranslations("calendar");
	const tDatePicker = useTranslations("datePicker");
	const tReminder = useTranslations("reminder");
	const tTodoDetail = useTranslations("todoDetail");

	const initialTimeZone = useMemo(
		() => resolveTimeZone(timeZone),
		[timeZone],
	);
	const initialStartDate = useMemo(
		() => toCalendarDate(startTime ?? endTime, initialTimeZone),
		[startTime, endTime, initialTimeZone],
	);
	const initialEndDate = useMemo(
		() => toCalendarDate(endTime, initialTimeZone),
		[endTime, initialTimeZone],
	);

	const [activeTab, setActiveTab] = useState<TabKey>(() =>
		endTime ? "range" : "date",
	);
	const [activeDateTarget, setActiveDateTarget] = useState<DateTarget>(() =>
		endTime ? "end" : "start",
	);
	const [currentMonth, setCurrentMonth] = useState<Date>(
		() => initialStartDate ?? new Date(),
	);
	const [selectedStartDate, setSelectedStartDate] = useState<Date | null>(
		() => initialStartDate,
	);
	const [selectedEndDate, setSelectedEndDate] = useState<Date | null>(
		() => initialEndDate,
	);
	const [startTimeInput, setStartTimeInput] = useState<string>(() =>
		isAllDay ? "" : toTimeValue(startTime, initialTimeZone),
	);
	const [endTimeInput, setEndTimeInput] = useState<string>(() => {
		const endValue = toTimeValue(endTime, initialTimeZone);
		if (endValue) return endValue;
		const startValue = toTimeValue(startTime, initialTimeZone);
		return startValue ? addMinutes(startValue, DEFAULT_RANGE_MINUTES) : "";
	});
	const [draftReminderOffsets, setDraftReminderOffsets] = useState<number[]>(
		() => normalizeReminderOffsets(reminderOffsets),
	);
	const [draftRrule, setDraftRrule] = useState<string | null>(() => rrule ?? null);
	const [draftTimeZone, setDraftTimeZone] = useState<string>(initialTimeZone);

	useEffect(() => {
		if (activeTab === "date") {
			setActiveDateTarget("start");
		}
	}, [activeTab]);

	const monthDays = useMemo(
		() => buildMonthDays(currentMonth),
		[currentMonth],
	);
	const showLunar = locale === "zh";

	const timeZoneOptions = useMemo(() => {
		const options = getTimeZoneOptions();
		if (!draftTimeZone) return options;
		if (options.includes(draftTimeZone)) return options;
		return [draftTimeZone, ...options];
	}, [draftTimeZone]);

	const updatePosition = useCallback(() => {
		if (typeof window === "undefined") return;
		const anchor = anchorRef.current;
		const popover = popoverRef.current;
		if (!anchor || !popover) return;

		const anchorRect = anchor.getBoundingClientRect();
		const popoverRect = popover.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;

		let left = anchorRect.left;
		let top = anchorRect.bottom + POPOVER_MARGIN;

		if (left + popoverRect.width > viewportWidth - POPOVER_MARGIN) {
			left = viewportWidth - popoverRect.width - POPOVER_MARGIN;
		}
		if (left < POPOVER_MARGIN) {
			left = POPOVER_MARGIN;
		}
		if (top + popoverRect.height > viewportHeight - POPOVER_MARGIN) {
			top = anchorRect.top - popoverRect.height - POPOVER_MARGIN;
		}
		if (top < POPOVER_MARGIN) {
			top = POPOVER_MARGIN;
		}

		popover.style.left = `${Math.round(left)}px`;
		popover.style.top = `${Math.round(top)}px`;
	}, [anchorRef]);

	useEffect(() => {
		updatePosition();
		const handleResize = () => updatePosition();
		window.addEventListener("resize", handleResize);
		window.addEventListener("scroll", handleResize, true);

		return () => {
			window.removeEventListener("resize", handleResize);
			window.removeEventListener("scroll", handleResize, true);
		};
	}, [updatePosition]);

	useEffect(() => {
		const raf = window.requestAnimationFrame(updatePosition);
		return () => window.cancelAnimationFrame(raf);
	}, [updatePosition]);

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (popoverRef.current?.contains(target)) {
				return;
			}
			onClose();
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
			const next = new Date(prev);
			next.setMonth(next.getMonth() - 1);
			return next;
		});
	};

	const handleNextMonth = () => {
		setCurrentMonth((prev) => {
			const next = new Date(prev);
			next.setMonth(next.getMonth() + 1);
			return next;
		});
	};

	const handleToday = () => {
		const today = new Date();
		setCurrentMonth(today);
		setSelectedStartDate(today);
		if (activeTab === "range" && activeDateTarget === "end") {
			setSelectedEndDate(today);
		}
	};

	const handleSelectDate = (day: CalendarDay) => {
		if (activeTab === "range" && activeDateTarget === "end") {
			setSelectedEndDate(day.date);
			if (!selectedStartDate) {
				setSelectedStartDate(day.date);
			} else if (startOfDay(day.date) < startOfDay(selectedStartDate)) {
				setSelectedStartDate(day.date);
			}
		} else {
			setSelectedStartDate(day.date);
			if (
				selectedEndDate &&
				startOfDay(selectedEndDate) < startOfDay(day.date)
			) {
				setSelectedEndDate(day.date);
			}
		}
		if (day.date.getMonth() !== currentMonth.getMonth()) {
			setCurrentMonth(day.date);
		}
	};

	const handleClear = () => {
		onSave({
			startTime: null,
			endTime: null,
			reminderOffsets: [],
			rrule: null,
			timeZone: null,
			isAllDay: null,
		});
		onClose();
	};

	const handleSave = () => {
		if (!selectedStartDate) return;
		const payload: UpdateTodoInput = {
			reminderOffsets: draftReminderOffsets,
			rrule: draftRrule,
			timeZone: draftTimeZone,
		};
		const zone = resolveTimeZone(draftTimeZone);

		if (activeTab === "date") {
			const timeValue = startTimeInput || "00:00";
			payload.startTime = buildIsoWithZone(selectedStartDate, timeValue, zone);
			payload.endTime = null;
			payload.isAllDay = !startTimeInput;
		} else {
			const effectiveEndDate = selectedEndDate ?? selectedStartDate;
			const startValue = startTimeInput || DEFAULT_TIME;
			const endValue = endTimeInput || addMinutes(startValue, DEFAULT_RANGE_MINUTES);
			payload.startTime = buildIsoWithZone(selectedStartDate, startValue, zone);
			payload.endTime = buildIsoWithZone(effectiveEndDate, endValue, zone);
			payload.isAllDay = false;
		}

		onSave(payload);
		onClose();
	};

	const canSave = useMemo(() => {
		if (!selectedStartDate) return false;
		if (activeTab === "range") {
			return Boolean(startTimeInput && endTimeInput);
		}
		return true;
	}, [activeTab, endTimeInput, selectedStartDate, startTimeInput]);

	if (typeof document === "undefined") {
		return null;
	}

	return createPortal(
		<div className="fixed inset-0 z-[10000] pointer-events-none">
			<div
				ref={popoverRef}
				className={cn(
					"pointer-events-auto w-[620px] max-w-[95vw] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-[0_40px_80px_-40px_oklch(var(--primary)/0.5)]",
				)}
				style={{ position: "absolute", left: -9999, top: -9999 }}
			>
				<div className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-3">
					<div className="flex rounded-full bg-muted/60 p-1 text-xs">
						<button
							type="button"
							onClick={() => setActiveTab("date")}
							className={cn(
								"px-3 py-1.5 rounded-full font-medium transition",
								activeTab === "date"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{tDatePicker("dateTab")}
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("range")}
							className={cn(
								"px-3 py-1.5 rounded-full font-medium transition",
								activeTab === "range"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground",
							)}
						>
							{tDatePicker("rangeTab")}
						</button>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition hover:bg-muted/60 hover:text-foreground"
						aria-label={tTodoDetail("cancel")}
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				<div className="grid grid-cols-[1fr_240px] gap-0">
					<div className="px-4 py-3">
						<MonthNavigation
							currentMonth={currentMonth}
							onPrevMonth={handlePrevMonth}
							onNextMonth={handleNextMonth}
							onToday={handleToday}
							tCalendar={tCalendar}
						/>
						<WeekdayHeader tCalendar={tCalendar} />
						<CalendarGrid
							monthDays={monthDays}
							selectedDate={selectedStartDate}
							rangeStart={activeTab === "range" ? selectedStartDate : null}
							rangeEnd={activeTab === "range" ? selectedEndDate : null}
							showLunar={showLunar}
							onSelectDate={handleSelectDate}
						/>
					</div>

					<DatePickerSidePanel
						activeTab={activeTab}
						activeDateTarget={activeDateTarget}
						selectedStartDate={selectedStartDate}
						selectedEndDate={selectedEndDate}
						startTimeInput={startTimeInput}
						endTimeInput={endTimeInput}
						onStartTimeChange={setStartTimeInput}
						onEndTimeChange={setEndTimeInput}
						onActiveDateTargetChange={setActiveDateTarget}
						draftReminderOffsets={draftReminderOffsets}
						onReminderOffsetsChange={setDraftReminderOffsets}
						draftRrule={draftRrule}
						onRruleChange={setDraftRrule}
						timeZoneOptions={timeZoneOptions}
						draftTimeZone={draftTimeZone}
						onTimeZoneChange={setDraftTimeZone}
						tDatePicker={tDatePicker}
						tReminder={tReminder}
					/>
				</div>

				<div className="flex items-center gap-2 border-t border-border/70 p-3">
					<button
						type="button"
						onClick={handleClear}
						className="flex-1 rounded-lg border border-border py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
					>
						{tTodoDetail("clear")}
					</button>
					<button
						type="button"
						onClick={handleSave}
						disabled={!canSave}
						className={cn(
							"flex-1 rounded-lg bg-primary py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90",
							!canSave && "cursor-not-allowed opacity-60",
						)}
					>
						{tTodoDetail("save")}
					</button>
				</div>
			</div>
		</div>,
		document.body,
	);
}
