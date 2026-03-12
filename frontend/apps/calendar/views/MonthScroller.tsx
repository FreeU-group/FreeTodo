/**
 * 月视图滚动容器（无限滚动）
 */

import type React from "react";
import { useEffect, useMemo, useRef } from "react";
import type { Todo } from "@/lib/types";
import { DayColumn } from "../components/DayColumn";
import type { CalendarDay, CalendarTodo } from "../types";
import {
	addDays,
	endOfMonth,
	startOfMonth,
	startOfWeek,
	toDateKey,
} from "../utils";

type WeekKey = string;

function getWeekKey(date: Date): WeekKey {
	return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function MonthScroller({
	months,
	activeMonth,
	groupedByDay,
	onSelectDay,
	onSelectTodo,
	todayText,
	renderQuickCreate,
	onLoadMore,
	onActiveMonthChange,
	scrollRef,
}: {
	months: Date[];
	activeMonth: Date;
	groupedByDay: Map<string, CalendarTodo[]>;
	onSelectDay: (
		date: Date,
		anchorEl?: HTMLDivElement | null,
		inCurrentMonth?: boolean,
	) => void;
	onSelectTodo: (todo: Todo) => void;
	todayText: string;
	renderQuickCreate?: (date: Date) => React.ReactNode;
	onLoadMore: (direction: "prev" | "next") => void;
	onActiveMonthChange: (month: Date) => void;
	scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
	const FOCUS_HEIGHT_RATIO = 0.5; // 视窗内的“阅读焦点”高度比例
	const monthsCount = months.length;
	const topSentinelRef = useRef<HTMLDivElement | null>(null);
	const bottomSentinelRef = useRef<HTMLDivElement | null>(null);
	const weekRefs = useRef<Map<WeekKey, HTMLDivElement>>(new Map());
	const rafRef = useRef<number | null>(null);
	const loadingRef = useRef(false);
	const activeMonthKey = `${activeMonth.getFullYear()}-${activeMonth.getMonth()}`;

	const weeks = useMemo(() => {
		if (months.length === 0) return [];
		const first = months[0];
		const last = months[months.length - 1];
		const start = startOfWeek(startOfMonth(first));
		const end = startOfWeek(endOfMonth(last));
		const list: Date[] = [];
		for (
			let cursor = start;
			cursor.getTime() <= end.getTime();
			cursor = addDays(cursor, 7)
		) {
			list.push(cursor);
		}
		return list;
	}, [months]);

	useEffect(() => {
		if (monthsCount === 0) return;
		loadingRef.current = false;
	}, [monthsCount]);

	useEffect(() => {
		const container = scrollRef.current;
		if (!container) return;

		const updateActiveMonth = () => {
			const containerRect = container.getBoundingClientRect();
			const focusY =
				containerRect.top + containerRect.height * FOCUS_HEIGHT_RATIO;
			let focusWeek: Date | null = null;
			let closestWeek: Date | null = null;
			let minDistance = Number.POSITIVE_INFINITY;

			for (const weekStart of weeks) {
				const key = getWeekKey(weekStart);
				const el = weekRefs.current.get(key);
				if (!el) continue;
				const rect = el.getBoundingClientRect();
				if (rect.top <= focusY && rect.bottom >= focusY) {
					focusWeek = weekStart;
					break;
				}
				const distance = Math.abs(rect.top - focusY);
				if (distance < minDistance) {
					minDistance = distance;
					closestWeek = weekStart;
				}
			}

			const targetWeek = focusWeek ?? closestWeek;
			if (targetWeek) {
				const midWeek = addDays(targetWeek, 3);
				const nextMonth = startOfMonth(midWeek);
				const nextKey = `${nextMonth.getFullYear()}-${nextMonth.getMonth()}`;
				if (activeMonthKey === nextKey) return;
				onActiveMonthChange(nextMonth);
			}
		};

		const onScroll = () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
			}
			rafRef.current = requestAnimationFrame(updateActiveMonth);
		};

		container.addEventListener("scroll", onScroll, { passive: true });
		updateActiveMonth();

		return () => {
			container.removeEventListener("scroll", onScroll);
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
			}
		};
	}, [activeMonthKey, onActiveMonthChange, scrollRef, weeks]);

	useEffect(() => {
		const container = scrollRef.current;
		if (!container) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (loadingRef.current) return;
				for (const entry of entries) {
					if (!entry.isIntersecting) continue;
					loadingRef.current = true;
					if (entry.target === topSentinelRef.current) {
						onLoadMore("prev");
					}
					if (entry.target === bottomSentinelRef.current) {
						onLoadMore("next");
					}
					break;
				}
			},
			{
				root: container,
				rootMargin: "200px 0px",
				threshold: 0.01,
			},
		);

		if (topSentinelRef.current) {
			observer.observe(topSentinelRef.current);
		}
		if (bottomSentinelRef.current) {
			observer.observe(bottomSentinelRef.current);
		}

		return () => observer.disconnect();
	}, [onLoadMore, scrollRef]);

	if (weeks.length === 0) {
		return null;
	}

	return (
		<div className="space-y-0">
			<div ref={topSentinelRef} aria-hidden className="h-px" />
			<div className="border-l border-t border-border">
				{weeks.map((weekStart) => {
					const weekKey = getWeekKey(weekStart);
					const days: CalendarDay[] = Array.from({ length: 7 }, (_, idx) => {
						const date = addDays(weekStart, idx);
						const inCurrentMonth =
							`${date.getFullYear()}-${date.getMonth()}` === activeMonthKey;
						return { date, inCurrentMonth };
					});
					const monthStartInWeek = days.find((day) => day.date.getDate() === 1);
					const monthKey = monthStartInWeek
						? `${monthStartInWeek.date.getFullYear()}-${monthStartInWeek.date.getMonth()}`
						: undefined;

					return (
						<div
							key={weekKey}
							data-week-key={weekKey}
							data-month-key={monthKey}
							ref={(el) => {
								if (el) {
									weekRefs.current.set(weekKey, el);
								} else {
									weekRefs.current.delete(weekKey);
								}
							}}
							className="grid grid-cols-7"
						>
							{days.map((day) => (
								<DayColumn
									key={toDateKey(day.date)}
									day={day}
									view="month"
									onSelectDay={onSelectDay}
									onSelectTodo={onSelectTodo}
									todos={groupedByDay.get(toDateKey(day.date)) || []}
									todayText={todayText}
									renderQuickCreate={renderQuickCreate}
								/>
							))}
						</div>
					);
				})}
			</div>
			<div ref={bottomSentinelRef} aria-hidden className="h-px" />
		</div>
	);
}
