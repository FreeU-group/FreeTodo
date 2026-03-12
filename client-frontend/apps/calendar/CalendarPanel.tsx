"use client";

/**
 * 日历面板组件
 * 使用全局 DndContext，支持从其他面板拖拽 Todo 到日期
 */

import { Calendar, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { useCreateTodo, useTodos } from "@/lib/query";
import { normalizeReminderOffsets } from "@/lib/reminders";
import { useTodoStore } from "@/lib/store/todo-store";
import { cn } from "@/lib/utils";
import { QuickCreatePopover } from "./components/QuickCreatePopover";
import { useMonthScroll } from "./hooks/useMonthScroll";
import type { CalendarTodo, CalendarView } from "./types";
import {
	addDays,
	addMonths,
	DEFAULT_NEW_TIME,
	endOfDay,
	getWeekOfYear,
	parseScheduleTime,
	startOfDay,
	startOfMonth,
	startOfWeek,
	toDateKey,
} from "./utils";
import { DayView } from "./views/DayView";
import { MonthScroller } from "./views/MonthScroller";
import { WeekView } from "./views/WeekView";

export function CalendarPanel() {
	const t = useTranslations("calendar");

	// 从 TanStack Query 获取 todos 数据
	const { data: todos = [] } = useTodos();

	// 从 TanStack Query 获取创建 todo 的 mutation
	const createTodoMutation = useCreateTodo();

	// 从 Zustand 获取 UI 状态
	const { setSelectedTodoId } = useTodoStore();

	const [view, setView] = useState<CalendarView>("month");
	const [currentDate, setCurrentDate] = useState<Date>(startOfDay(new Date()));
	const [quickTargetDate, setQuickTargetDate] = useState<Date | null>(null);
	const [quickTitle, setQuickTitle] = useState("");
	const [quickTime, setQuickTime] = useState(DEFAULT_NEW_TIME);
	const [quickReminderOffsets, setQuickReminderOffsets] = useState<number[]>(
		normalizeReminderOffsets(undefined),
	);
	const [quickAnchorRect, setQuickAnchorRect] = useState<DOMRect | null>(null);
	const {
		monthItems,
		monthScrollRef,
		handleLoadMoreMonths,
		requestMonthScroll,
		shouldIgnoreActiveMonthChange,
	} = useMonthScroll({ currentDate, view });

	const VIEW_OPTIONS: { id: CalendarView; label: string }[] = [
		{ id: "month", label: t("monthView") },
		{ id: "week", label: t("weekView") },
		{ id: "day", label: t("dayView") },
	];

	const WEEKDAY_LABELS = [
		t("weekdays.monday"),
		t("weekdays.tuesday"),
		t("weekdays.wednesday"),
		t("weekdays.thursday"),
		t("weekdays.friday"),
		t("weekdays.saturday"),
		t("weekdays.sunday"),
	];

	const range = useMemo(() => {
		if (view === "month") {
			if (monthItems.length > 0) {
				const first = monthItems[0];
				const last = monthItems[monthItems.length - 1];
				const start = startOfWeek(startOfMonth(first));
				const end = endOfDay(addDays(startOfWeek(startOfMonth(last)), 41));
				return { start, end };
			}
			const start = startOfWeek(startOfMonth(currentDate));
			const end = endOfDay(addDays(start, 41));
			return { start, end };
		}
		if (view === "week") {
			const start = startOfWeek(currentDate);
			const end = endOfDay(addDays(start, 6));
			return { start, end };
		}
		const start = startOfDay(currentDate);
		const end = endOfDay(currentDate);
		return { start, end };
	}, [currentDate, monthItems, view]);

	const todosWithSchedule: CalendarTodo[] = useMemo(() => {
		const items: CalendarTodo[] = [];
		for (const todo of todos) {
			const startRaw = todo.startTime ?? todo.endTime;
			const startTime = parseScheduleTime(startRaw);
			if (!startTime) continue;
			const endTime = parseScheduleTime(todo.endTime ?? undefined);
			const startDay = startOfDay(startTime);
			const endDay = startOfDay(endTime ?? startTime);
			for (
				let day = startDay;
				day.getTime() <= endDay.getTime();
				day = addDays(day, 1)
			) {
				const dayValue = new Date(day);
				items.push({
					todo,
					startTime,
					endTime,
					dateKey: toDateKey(dayValue),
					day: dayValue,
					isAllDay: todo.isAllDay ?? false,
				});
			}
		}
		return items.sort(
			(a: CalendarTodo, b: CalendarTodo) =>
				a.startTime.getTime() - b.startTime.getTime(),
		);
	}, [todos]);

	const todosInRange = useMemo(
		() =>
			todosWithSchedule.filter(
				(item) =>
					item.day.getTime() >= range.start.getTime() &&
					item.day.getTime() <= range.end.getTime(),
			),
		[range.end, range.start, todosWithSchedule],
	);

	const groupedByDay = useMemo(() => {
		const map = new Map<string, CalendarTodo[]>();
		for (const item of todosInRange) {
			const key = item.dateKey;
			if (!map.has(key)) {
				map.set(key, [item]);
			} else {
				map.get(key)?.push(item);
			}
		}
		return map;
	}, [todosInRange]);

	const handleNavigate = (direction: "prev" | "next" | "today") => {
		if (direction === "today") {
			const today = startOfDay(new Date());
			if (view === "month") {
				const target = startOfMonth(today);
				requestMonthScroll(target);
				setCurrentDate(target);
			} else {
				setCurrentDate(today);
			}
			return;
		}

		if (view === "month") {
			const nextMonth =
				direction === "prev"
					? addMonths(startOfMonth(currentDate), -1)
					: addMonths(startOfMonth(currentDate), 1);
			requestMonthScroll(nextMonth);
			setCurrentDate(nextMonth);
			return;
		}

		const delta = view === "week" ? 7 : 1;
		const offset = direction === "prev" ? -delta : delta;
		setCurrentDate((prev) => startOfDay(addDays(prev, offset)));
	};

	const handleSelectDay = (
		date: Date,
		anchorEl?: HTMLDivElement | null,
		inCurrentMonth?: boolean,
	) => {
		const target = startOfDay(date);
		setQuickTargetDate(target);
		setQuickAnchorRect(anchorEl?.getBoundingClientRect() ?? null);
		if (view === "month" && inCurrentMonth === false) {
			return;
		}
		setCurrentDate(target);
	};

	const handleQuickCreate = async () => {
		if (!quickTargetDate || !quickTitle.trim()) return;
		const [hh, mm] = quickTime.split(":").map((n) => Number.parseInt(n, 10));
		const startTime = startOfDay(quickTargetDate);
		startTime.setHours(hh || 0, mm || 0, 0, 0);
		try {
			await createTodoMutation.mutateAsync({
				name: quickTitle.trim(),
				startTime: startTime.toISOString(),
				reminderOffsets: quickReminderOffsets,
				status: "active",
			});
			setQuickTitle("");
			setQuickTargetDate(null);
			setQuickAnchorRect(null);
			setQuickReminderOffsets(normalizeReminderOffsets(undefined));
		} catch (err) {
			console.error("Failed to create todo:", err);
		}
	};

	const renderQuickCreate = (date: Date, _className: string) => {
		if (!quickTargetDate) return null;
		if (toDateKey(date) !== toDateKey(quickTargetDate)) return null;
		const top = quickAnchorRect ? quickAnchorRect.top + 28 : 120;
		const left = quickAnchorRect ? quickAnchorRect.left + 4 : 16;
		const closePopover = () => {
			setQuickTargetDate(null);
			setQuickTitle("");
			setQuickAnchorRect(null);
			setQuickReminderOffsets(normalizeReminderOffsets(undefined));
		};

		return createPortal(
			<>
				<div
					className="fixed inset-0 z-40"
					aria-hidden
					onPointerDown={(event) => {
						event.preventDefault();
						event.stopPropagation();
						closePopover();
					}}
				/>
				<div
					className="fixed z-[9999] w-72 max-w-[90vw] pointer-events-auto"
					style={{ top, left }}
					data-quick-create
				>
					<QuickCreatePopover
						targetDate={quickTargetDate}
						value={quickTitle}
						time={quickTime}
						reminderOffsets={quickReminderOffsets}
						onChange={setQuickTitle}
						onTimeChange={setQuickTime}
						onReminderChange={setQuickReminderOffsets}
						onConfirm={handleQuickCreate}
						onCancel={closePopover}
					/>
				</div>
			</>,
			document.body,
		);
	};

	const handleActiveMonthChange = useCallback(
		(month: Date) => {
			if (view !== "month") return;
			const currentMonth = startOfMonth(currentDate);
			if (shouldIgnoreActiveMonthChange(month)) return;
			if (
				currentMonth.getFullYear() === month.getFullYear() &&
				currentMonth.getMonth() === month.getMonth()
			) {
				return;
			}
			setCurrentDate(month);
		},
		[currentDate, shouldIgnoreActiveMonthChange, view],
	);

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部标题栏 */}
			<PanelHeader icon={Calendar} title={t("title")} />
			{/* 顶部工具栏 */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
				<span className="text-sm font-medium text-foreground">
					{view === "month" &&
						t("yearMonth", {
							year: currentDate.getFullYear(),
							month: `${currentDate.getMonth() + 1}`.padStart(2, "0"),
						})}
					{view === "week" &&
						t("yearMonthWeek", {
							year: currentDate.getFullYear(),
							month: `${currentDate.getMonth() + 1}`.padStart(2, "0"),
							week: getWeekOfYear(currentDate),
						})}
					{view === "day" &&
						t("yearMonthDay", {
							year: currentDate.getFullYear(),
							month: `${currentDate.getMonth() + 1}`.padStart(2, "0"),
							day: `${currentDate.getDate()}`.padStart(2, "0"),
						})}
				</span>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => handleNavigate("prev")}
						className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-muted/60"
						aria-label={t("previous")}
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<button
						type="button"
						onClick={() => handleNavigate("today")}
						className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
					>
						<RotateCcw className="h-4 w-4" />
						{t("today")}
					</button>
					<button
						type="button"
						onClick={() => handleNavigate("next")}
						className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-muted/60"
						aria-label={t("next")}
					>
						<ChevronRight className="h-4 w-4" />
					</button>
				</div>
				<div className="flex items-center gap-2">
					{VIEW_OPTIONS.map((option) => (
						<button
							key={option.id}
							type="button"
							onClick={() => setView(option.id)}
							className={cn(
								"rounded-md px-3 py-2 text-sm font-medium transition-colors",
								view === option.id
									? "bg-primary text-primary-foreground shadow-sm"
									: "bg-card text-muted-foreground hover:bg-muted/60",
							)}
						>
							{option.label}
						</button>
					))}
					{/* <button
						type="button"
						onClick={() => {
							setQuickTargetDate(startOfDay(currentDate));
							setQuickAnchorRect(null);
						}}
						className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
					>
						<Plus className="h-4 w-4" />
						{t("create")}
					</button> */}
				</div>
			</div>

			{/* 视图主体 */}
			<div
				ref={monthScrollRef}
				className="flex-1 overflow-y-auto bg-background p-3"
			>
					{view === "month" && (
						<div className="grid grid-cols-7">
							{WEEKDAY_LABELS.map((label) => (
								<span
								key={label}
								className="py-2 text-center text-xs font-medium text-muted-foreground"
							>
								{t("weekPrefix")}
								{label}
							</span>
						))}
					</div>
				)}
				<div>
					{view === "month" && (
						<MonthScroller
							months={
								monthItems.length > 0
									? monthItems
									: [startOfMonth(currentDate)]
							}
							activeMonth={startOfMonth(currentDate)}
							groupedByDay={groupedByDay}
							onSelectDay={handleSelectDay}
							onSelectTodo={(todo) => setSelectedTodoId(todo.id)}
							todayText={t("today")}
							renderQuickCreate={(date) =>
								renderQuickCreate(date, "absolute left-1 top-7 z-20 w-72 max-w-[90vw]")
							}
							onLoadMore={handleLoadMoreMonths}
							onActiveMonthChange={handleActiveMonthChange}
							scrollRef={monthScrollRef}
						/>
					)}
					{view === "week" && (
						<WeekView
							currentDate={currentDate}
							todos={todos}
							onSelectDay={handleSelectDay}
							onSelectTodo={(todo) => setSelectedTodoId(todo.id)}
							todayText={t("today")}
						/>
					)}
					{view === "day" && (
						<DayView
							currentDate={currentDate}
							todos={todos}
						/>
					)}
				</div>
			</div>
		</div>
	);
}
