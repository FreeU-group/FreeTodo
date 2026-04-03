"use client";

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
import { cn } from "@/lib/utils";
import { buildCalendarMonthDays, CalendarGrid, MonthNavigation, WeekdayHeader } from "./DateOnlyPickerCalendar";
import type { CalendarDay } from "./date-picker-utils";

interface DateOnlyPickerPopoverProps {
	anchorRef: RefObject<HTMLElement | null>;
	selectedDate: Date | null;
	onSelectDate: (date: Date) => void;
	onClose: () => void;
}

const POPOVER_MARGIN = 8;

export function DateOnlyPickerPopover({
	anchorRef,
	selectedDate,
	onSelectDate,
	onClose,
}: DateOnlyPickerPopoverProps) {
	const popoverRef = useRef<HTMLDivElement>(null);
	const tCalendar = useTranslations("calendar");
	const [currentMonth, setCurrentMonth] = useState<Date>(
		() => selectedDate ?? new Date(),
	);

	useEffect(() => {
		if (selectedDate) {
			setCurrentMonth(selectedDate);
		}
	}, [selectedDate]);

	const monthDays = useMemo(
		() => buildCalendarMonthDays(currentMonth),
		[currentMonth],
	);

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
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (anchorRef.current?.contains(target)) return;
			if (popoverRef.current?.contains(target)) return;
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
	}, [anchorRef, onClose]);

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

	const handleSelectDate = (day: CalendarDay) => {
		onSelectDate(day.date);
		onClose();
		if (day.date.getMonth() !== currentMonth.getMonth()) {
			setCurrentMonth(day.date);
		}
	};

	if (typeof document === "undefined") {
		return null;
	}

	return createPortal(
		<div className="fixed inset-0 z-[10000] pointer-events-none">
			<div
				ref={popoverRef}
				className={cn(
					"pointer-events-auto w-[320px] max-w-[90vw] overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-[0_30px_60px_-40px_oklch(var(--primary)/0.4)]",
				)}
				style={{ position: "absolute", left: -9999, top: -9999 }}
			>
				<div className="px-4 py-3">
					<MonthNavigation
						currentMonth={currentMonth}
						onPrevMonth={handlePrevMonth}
						onNextMonth={handleNextMonth}
						tCalendar={tCalendar}
					/>
					<WeekdayHeader tCalendar={tCalendar} />
					<CalendarGrid
						monthDays={monthDays}
						selectedDate={selectedDate}
						onSelectDate={handleSelectDate}
					/>
				</div>
			</div>
		</div>,
		document.body,
	);
}
