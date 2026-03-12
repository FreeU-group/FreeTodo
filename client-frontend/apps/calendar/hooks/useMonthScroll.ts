import { useCallback, useEffect, useRef, useState } from "react";
import type { CalendarView } from "../types";
import { addMonths, startOfMonth } from "../utils";

type ScrollDirection = "prev" | "next";

function getMonthKey(date: Date) {
	return `${date.getFullYear()}-${date.getMonth()}`;
}

export function useMonthScroll({
	currentDate,
	view,
}: {
	currentDate: Date;
	view: CalendarView;
}) {
	const [monthItems, setMonthItems] = useState<Date[]>(() => {
		const base = startOfMonth(new Date());
		return [
			addMonths(base, -2),
			addMonths(base, -1),
			base,
			addMonths(base, 1),
			addMonths(base, 2),
		];
	});
	const monthScrollRef = useRef<HTMLDivElement>(null);
	const pendingScrollAdjust = useRef<{
		prevHeight: number;
		prevScrollTop: number;
	} | null>(null);
	const pendingScrollToMonth = useRef<Date | null>(null);
	const manualScrollTargetKey = useRef<string | null>(null);
	const pendingScrollRaf = useRef<number | null>(null);
	const manualScrollReleaseTimer = useRef<number | null>(null);

	const attemptScrollToPending = useCallback(() => {
		const target = pendingScrollToMonth.current;
		if (!target) return false;
		const key = getMonthKey(target);
		const el = document.querySelector(`[data-month-key="${key}"]`);
		if (!el) return false;
		(el as HTMLElement).scrollIntoView({
			block: "start",
			behavior: "smooth",
		});
		pendingScrollToMonth.current = null;
		return true;
	}, []);

	const scheduleScrollToPending = useCallback(() => {
		if (pendingScrollRaf.current) {
			cancelAnimationFrame(pendingScrollRaf.current);
		}
		let retries = 30;
		const tick = () => {
			if (attemptScrollToPending()) return;
			if (retries <= 0) {
				manualScrollTargetKey.current = null;
				return;
			}
			retries -= 1;
			pendingScrollRaf.current = requestAnimationFrame(tick);
		};
		tick();
	}, [attemptScrollToPending]);

	useEffect(() => {
		if (view !== "month") return;
		setMonthItems((prev) => {
			const target = startOfMonth(currentDate);
			if (prev.length === 0) {
				return [
					addMonths(target, -2),
					addMonths(target, -1),
					target,
					addMonths(target, 1),
					addMonths(target, 2),
				];
			}

			const hasTarget = prev.some(
				(item) =>
					item.getFullYear() === target.getFullYear() &&
					item.getMonth() === target.getMonth(),
			);
			if (hasTarget) return prev;

			const first = prev[0];
			const last = prev[prev.length - 1];
			const targetIndex = target.getFullYear() * 12 + target.getMonth();
			const firstIndex = first.getFullYear() * 12 + first.getMonth();
			const lastIndex = last.getFullYear() * 12 + last.getMonth();

			if (targetIndex < firstIndex) {
				const monthsToAdd: Date[] = [];
				let cursor = startOfMonth(first);
				while (
					cursor.getFullYear() * 12 + cursor.getMonth() > targetIndex
				) {
					cursor = addMonths(cursor, -1);
					monthsToAdd.unshift(cursor);
				}
				return [...monthsToAdd, ...prev];
			}

			if (targetIndex > lastIndex) {
				const monthsToAdd: Date[] = [];
				let cursor = startOfMonth(last);
				while (
					cursor.getFullYear() * 12 + cursor.getMonth() < targetIndex
				) {
					cursor = addMonths(cursor, 1);
					monthsToAdd.push(cursor);
				}
				return [...prev, ...monthsToAdd];
			}

			return prev;
		});
	}, [currentDate, view]);

	useEffect(() => {
		if (monthItems.length === 0) return;
		if (!pendingScrollAdjust.current) return;
		const container = monthScrollRef.current;
		if (!container) return;
		const { prevHeight, prevScrollTop } = pendingScrollAdjust.current;
		pendingScrollAdjust.current = null;
		requestAnimationFrame(() => {
			const nextHeight = container.scrollHeight;
			container.scrollTop = prevScrollTop + (nextHeight - prevHeight);
		});
	}, [monthItems.length]);

	useEffect(() => {
		if (view !== "month") return;
		if (monthItems.length === 0) return;
		if (!pendingScrollToMonth.current) return;
		scheduleScrollToPending();
		return () => {
			if (pendingScrollRaf.current) {
				cancelAnimationFrame(pendingScrollRaf.current);
			}
		};
	}, [monthItems.length, scheduleScrollToPending, view]);

	const handleLoadMoreMonths = useCallback(
		(direction: ScrollDirection) => {
			if (direction === "prev" && monthScrollRef.current) {
				pendingScrollAdjust.current = {
					prevHeight: monthScrollRef.current.scrollHeight,
					prevScrollTop: monthScrollRef.current.scrollTop,
				};
			}
			setMonthItems((prev) => {
				if (prev.length === 0) return prev;
				if (direction === "prev") {
					const first = prev[0];
					return [addMonths(first, -1), ...prev];
				}
				const last = prev[prev.length - 1];
				return [...prev, addMonths(last, 1)];
			});
		},
		[],
	);

	const requestMonthScroll = useCallback(
		(target: Date) => {
			const key = getMonthKey(target);
			manualScrollTargetKey.current = key;
			pendingScrollToMonth.current = target;
			scheduleScrollToPending();
			if (manualScrollReleaseTimer.current) {
				window.clearTimeout(manualScrollReleaseTimer.current);
			}
			manualScrollReleaseTimer.current = window.setTimeout(() => {
				manualScrollTargetKey.current = null;
			}, 1200);
		},
		[scheduleScrollToPending],
	);

	const shouldIgnoreActiveMonthChange = useCallback((month: Date) => {
		const nextKey = getMonthKey(month);
		if (
			manualScrollTargetKey.current &&
			manualScrollTargetKey.current !== nextKey
		) {
			return true;
		}
		if (manualScrollTargetKey.current === nextKey) {
			manualScrollTargetKey.current = null;
		}
		return false;
	}, []);

	return {
		monthItems,
		monthScrollRef,
		handleLoadMoreMonths,
		requestMonthScroll,
		shouldIgnoreActiveMonthChange,
	};
}
