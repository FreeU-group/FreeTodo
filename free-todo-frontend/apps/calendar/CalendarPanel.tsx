"use client";

/**
 * 日历面板组件
 * 使用全局 DndContext，支持从其他面板拖拽 Todo 到日期
 */

import {
	Calendar,
	ChevronLeft,
	ChevronRight,
	Plus,
	RotateCcw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { useCreateTodo, useTodos } from "@/lib/query";
import { useTodoStore } from "@/lib/store/todo-store";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { QuickCreateBar } from "./components/QuickCreateBar";
import type { CalendarTodo, CalendarView } from "./types";
import {
	addDays,
	DEFAULT_NEW_TIME,
	endOfDay,
	getWeekOfYear,
	parseDeadline,
	startOfDay,
	startOfMonth,
	startOfWeek,
	toDateKey,
} from "./utils";
import { DayView } from "./views/DayView";
import { MonthView } from "./views/MonthView";
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
	}, [currentDate, view]);

	const todosWithDeadline: CalendarTodo[] = useMemo(() => {
		return todos
			.map((todo: Todo) => {
				const parsed = parseDeadline(todo.deadline);
				if (!parsed) return null;
				return {
					todo,
					deadline: parsed,
					dateKey: toDateKey(parsed),
				};
			})
			.filter((item): item is CalendarTodo => item !== null)
			.sort(
				(a: CalendarTodo, b: CalendarTodo) =>
					a.deadline.getTime() - b.deadline.getTime(),
			);
	}, [todos]);

	const todosInRange = useMemo(
		() =>
			todosWithDeadline.filter(
				(item) =>
					item.deadline.getTime() >= range.start.getTime() &&
					item.deadline.getTime() <= range.end.getTime(),
			),
		[range.end, range.start, todosWithDeadline],
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
			setCurrentDate(startOfDay(new Date()));
			return;
		}

		const delta = view === "month" ? 30 : view === "week" ? 7 : 1;
		const offset = direction === "prev" ? -delta : delta;
		setCurrentDate((prev) => startOfDay(addDays(prev, offset)));
	};

	const handleSelectDay = (date: Date) => {
		setCurrentDate(startOfDay(date));
		setQuickTargetDate(startOfDay(date));
	};

	const handleQuickCreate = async () => {
		if (!quickTargetDate || !quickTitle.trim()) return;
		const [hh, mm] = quickTime.split(":").map((n) => Number.parseInt(n, 10));
		const deadline = startOfDay(quickTargetDate);
		deadline.setHours(hh || 0, mm || 0, 0, 0);
		try {
			await createTodoMutation.mutateAsync({
				name: quickTitle.trim(),
				deadline: deadline.toISOString(),
				status: "active",
			});
			setQuickTitle("");
			setQuickTargetDate(null);
		} catch (err) {
			console.error("Failed to create todo:", err);
		}
	};

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部标题栏 */}
			<PanelHeader icon={Calendar} title={t("title")} />
			{/* 顶部工具栏 */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
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
					<button
						type="button"
						onClick={() => setQuickTargetDate(startOfDay(currentDate))}
						className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90"
					>
						<Plus className="h-4 w-4" />
						{t("create")}
					</button>
				</div>
			</div>

			{/* 视图主体 */}
			<div className="flex-1 overflow-y-auto bg-background p-3">
				{view !== "day" && (
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
						<MonthView
							currentDate={currentDate}
							groupedByDay={groupedByDay}
							onSelectDay={handleSelectDay}
							onSelectTodo={(todo) => setSelectedTodoId(todo.id)}
							todayText={t("today")}
						/>
					)}
					{view === "week" && (
						<WeekView
							currentDate={currentDate}
							groupedByDay={groupedByDay}
							onSelectDay={handleSelectDay}
							onSelectTodo={(todo) => setSelectedTodoId(todo.id)}
							todayText={t("today")}
						/>
					)}
					{view === "day" && (
						<DayView currentDate={currentDate} todos={todosInRange} />
					)}
				</div>
			</div>

			{/* 快捷创建 */}
			<QuickCreateBar
				targetDate={quickTargetDate}
				value={quickTitle}
				time={quickTime}
				onChange={setQuickTitle}
				onTimeChange={setQuickTime}
				onConfirm={handleQuickCreate}
				onCancel={() => {
					setQuickTargetDate(null);
					setQuickTitle("");
				}}
			/>
		</div>
	);
}
