"use client";

/**
 * 日历面板组件
 * 使用全局 DndContext，支持从其他面板拖拽 Todo 到日期
 */

import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
	Calendar,
	ChevronLeft,
	ChevronRight,
	Plus,
	RotateCcw,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { PanelHeader } from "@/components/common/PanelHeader";
import { type DragData, type DropData, usePendingUpdate } from "@/lib/dnd";
import { useTranslations } from "@/lib/i18n";
import { useCreateTodo, useTodos } from "@/lib/query";
import { useLocaleStore } from "@/lib/store/locale";
import { useTodoStore } from "@/lib/store/todo-store";
import type { Todo, TodoStatus } from "@/lib/types/todo";
import { cn } from "@/lib/utils";

type CalendarView = "month" | "week" | "day";

interface CalendarTodo {
	todo: Todo;
	deadline: Date;
	dateKey: string;
}

interface CalendarDay {
	date: Date;
	inCurrentMonth?: boolean;
}

const DEFAULT_NEW_TIME = "09:00";

function startOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	return d;
}

function endOfDay(date: Date): Date {
	const d = new Date(date);
	d.setHours(23, 59, 59, 999);
	return d;
}

function addDays(date: Date, days: number): Date {
	const d = new Date(date);
	d.setDate(d.getDate() + days);
	return d;
}

function startOfWeek(date: Date): Date {
	const d = startOfDay(date);
	const day = d.getDay(); // Sunday=0
	const diff = (day + 6) % 7; // Monday as first day
	d.setDate(d.getDate() - diff);
	return d;
}

function startOfMonth(date: Date): Date {
	return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

function getWeekOfYear(date: Date): number {
	const d = new Date(date);
	d.setHours(0, 0, 0, 0);
	// Set to Thursday of current week (ISO week starts Monday)
	d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
	const yearStart = new Date(d.getFullYear(), 0, 1);
	const weekNumber = Math.ceil(
		((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
	);
	return weekNumber;
}

function toDateKey(date: Date): string {
	const y = date.getFullYear();
	const m = `${date.getMonth() + 1}`.padStart(2, "0");
	const d = `${date.getDate()}`.padStart(2, "0");
	return `${y}-${m}-${d}`;
}

function parseDeadline(deadline?: string): Date | null {
	if (!deadline) return null;
	// 如果 deadline 字符串没有时区信息（没有 Z 或 +/- 偏移），
	// 假设它是 UTC 时间并添加 Z 后缀，避免被解析为本地时间导致日期偏移
	let normalizedDeadline = deadline;
	if (
		deadline.includes("T") &&
		!deadline.includes("Z") &&
		!deadline.includes("+") &&
		!/\d{2}:\d{2}:\d{2}-/.test(deadline)
	) {
		normalizedDeadline = `${deadline}Z`;
	}
	const parsed = new Date(normalizedDeadline);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatHumanDate(date: Date): string {
	return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatTimeLabel(date: Date | null, allDayText: string): string {
	if (!date) return allDayText;
	const hh = `${date.getHours()}`.padStart(2, "0");
	const mm = `${date.getMinutes()}`.padStart(2, "0");
	return `${hh}:${mm}`;
}

function getStatusStyle(status: TodoStatus): string {
	switch (status) {
		case "completed":
			return "bg-green-500/15 text-green-600 border-green-500/30";
		case "canceled":
			return "bg-gray-500/15 text-gray-500 border-gray-500/30";
		case "draft":
			return "bg-orange-500/15 text-orange-600 border-orange-500/30";
		default:
			return "bg-blue-500/10 text-blue-600 border-blue-500/25";
	}
}

function getDeadlineSeverity(deadline: Date): "overdue" | "soon" | "normal" {
	const now = new Date();
	if (deadline.getTime() < now.getTime()) return "overdue";
	const diffHours = (deadline.getTime() - now.getTime()) / (1000 * 60 * 60);
	return diffHours <= 24 ? "soon" : "normal";
}

function buildMonthDays(currentDate: Date): CalendarDay[] {
	const start = startOfMonth(currentDate);
	const startGrid = startOfWeek(start);
	return Array.from({ length: 42 }, (_, idx) => {
		const date = addDays(startGrid, idx);
		return { date, inCurrentMonth: date.getMonth() === currentDate.getMonth() };
	});
}

function buildWeekDays(currentDate: Date): CalendarDay[] {
	const start = startOfWeek(currentDate);
	return Array.from({ length: 7 }, (_, idx) => ({ date: addDays(start, idx) }));
}

/**
 * 日历内的可拖拽 Todo 卡片
 * 使用 useDraggable 并传递类型化的 DragData
 */
function DraggableTodo({
	calendarTodo,
	onSelect,
}: {
	calendarTodo: CalendarTodo;
	onSelect: (todo: Todo) => void;
}) {
	// 获取正在进行乐观更新的 todo ID
	const pendingTodoId = usePendingUpdate();
	// 检查当前 todo 是否正在进行乐观更新
	const isPendingUpdate = pendingTodoId === calendarTodo.todo.id;

	// 构建类型化的拖拽数据
	const dragData: DragData = useMemo(
		() => ({
			type: "TODO_CARD" as const,
			payload: {
				todo: calendarTodo.todo,
				sourcePanel: "calendar",
			},
		}),
		[calendarTodo.todo],
	);

	// 使用带前缀的 id，避免与 TodoList 中的同一 todo 产生 id 冲突
	// 这样当在 TodoList 中拖动时，Calendar 中的对应 todo 不会跟着移动
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: `calendar-${calendarTodo.todo.id}`,
		data: dragData,
	});

	// 拖拽时或乐观更新期间，隐藏原始元素避免"弹回"效果
	// DragOverlay 会显示拖拽预览
	if (isDragging || isPendingUpdate) {
		return (
			<div
				ref={setNodeRef}
				className="opacity-0 pointer-events-none"
				aria-hidden="true"
			>
				<p className="truncate text-[12px] font-medium leading-tight">
					{calendarTodo.todo.name}
				</p>
			</div>
		);
	}

	return (
		<div
			ref={setNodeRef}
			{...attributes}
			{...listeners}
			onClick={() => onSelect(calendarTodo.todo)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelect(calendarTodo.todo);
				}
			}}
			role="button"
			tabIndex={0}
			className={cn(
				"group relative rounded px-1.5 py-1 text-xs transition-all truncate",
				getStatusStyle(calendarTodo.todo.status),
			)}
		>
			<p className="truncate text-[12px] font-medium leading-tight">
				{calendarTodo.todo.name}
			</p>
		</div>
	);
}

/**
 * 日历日期列 - 作为放置目标
 * 使用 useDroppable 并传递类型化的 DropData
 */
function DayColumn({
	day,
	todos,
	onSelectDay,
	onSelectTodo,
	view,
	todayText,
}: {
	day: CalendarDay;
	todos: CalendarTodo[];
	onSelectDay: (date: Date) => void;
	onSelectTodo: (todo: Todo) => void;
	view: CalendarView;
	todayText: string;
}) {
	const dateKey = toDateKey(day.date);

	// 构建类型化的放置区数据
	const dropData: DropData = useMemo(
		() => ({
			type: "CALENDAR_DATE" as const,
			metadata: {
				dateKey,
				date: day.date,
			},
		}),
		[dateKey, day.date],
	);

	const { isOver, setNodeRef } = useDroppable({
		id: `day-${dateKey}`,
		data: dropData,
	});

	const isToday = dateKey === toDateKey(new Date());

	return (
		<div
			ref={setNodeRef}
			onClick={() => onSelectDay(day.date)}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelectDay(day.date);
				}
			}}
			role="button"
			tabIndex={0}
			className={cn(
				"flex flex-col gap-1 border-r border-b border-border p-1.5 transition-colors",
				isOver && "bg-primary/5",
				day.inCurrentMonth === false && "opacity-40 bg-muted/20",
				isToday && "bg-primary/5",
				view === "month" ? "min-h-[120px]" : "min-h-[180px]",
			)}
		>
			<div className="flex items-center justify-between text-xs text-muted-foreground">
				<span
					className={cn(
						"inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-semibold",
						isToday && "bg-primary text-primary-foreground",
					)}
				>
					{day.date.getDate()}
				</span>
				{isToday && (
					<span className="text-[11px] text-primary">{todayText}</span>
				)}
			</div>

			<div className="flex flex-col gap-1">
				{todos.map((item) => (
					<DraggableTodo
						key={item.todo.id}
						calendarTodo={item}
						onSelect={onSelectTodo}
					/>
				))}
			</div>
		</div>
	);
}

function QuickCreateBar({
	targetDate,
	value,
	time,
	onChange,
	onTimeChange,
	onConfirm,
	onCancel,
	labels,
}: {
	targetDate: Date | null;
	value: string;
	time: string;
	onChange: (v: string) => void;
	onTimeChange: (v: string) => void;
	onConfirm: () => void;
	onCancel: () => void;
	labels: {
		createOnDate: string;
		closeCreate: string;
		inputTodoTitle: string;
		create: string;
	};
}) {
	if (!targetDate) return null;
	return (
		<div className="fixed bottom-24 left-1/2 z-40 w-full max-w-4xl -translate-x-1/2 px-3">
			<div className="flex flex-col gap-3 rounded-xl border bg-background/95 p-4 shadow-xl backdrop-blur">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Calendar className="h-4 w-4" />
						<span>
							{labels.createOnDate.replace(
								"{date}",
								formatHumanDate(targetDate),
							)}
						</span>
					</div>
					<button
						type="button"
						onClick={onCancel}
						className="rounded-md p-1 text-muted-foreground hover:bg-muted/50"
						aria-label={labels.closeCreate}
					>
						<X className="h-4 w-4" />
					</button>
				</div>
				<div className="flex flex-col gap-3 sm:flex-row sm:items-center">
					<input
						value={value}
						onChange={(e) => onChange(e.target.value)}
						placeholder={labels.inputTodoTitle}
						className="flex-1 rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
					/>
					<div className="flex items-center gap-2">
						<input
							type="time"
							value={time}
							onChange={(e) => onTimeChange(e.target.value)}
							className="rounded-md border px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
						/>
						<button
							type="button"
							onClick={onConfirm}
							disabled={!value.trim()}
							className={cn(
								"inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors",
								!value.trim() && "opacity-60",
							)}
						>
							<Plus className="h-4 w-4" />
							{labels.create}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

export function CalendarPanel() {
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);

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
		{ id: "month", label: t.calendar.monthView },
		{ id: "week", label: t.calendar.weekView },
		{ id: "day", label: t.calendar.dayView },
	];

	const WEEKDAY_LABELS = [
		t.calendar.weekdays.monday,
		t.calendar.weekdays.tuesday,
		t.calendar.weekdays.wednesday,
		t.calendar.weekdays.thursday,
		t.calendar.weekdays.friday,
		t.calendar.weekdays.saturday,
		t.calendar.weekdays.sunday,
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

	const monthDays = useMemo(() => buildMonthDays(currentDate), [currentDate]);
	const weekDays = useMemo(() => buildWeekDays(currentDate), [currentDate]);

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

	const renderMonthView = () => (
		<div className="grid grid-cols-7 border-l border-t border-border">
			{monthDays.map((day) => (
				<DayColumn
					key={toDateKey(day.date)}
					day={day}
					view="month"
					onSelectDay={handleSelectDay}
					onSelectTodo={(todo) => setSelectedTodoId(todo.id)}
					todos={groupedByDay.get(toDateKey(day.date)) || []}
					todayText={t.calendar.today}
				/>
			))}
		</div>
	);

	const renderWeekView = () => (
		<div className="grid grid-cols-7 border-l border-t border-border">
			{weekDays.map((day) => (
				<DayColumn
					key={toDateKey(day.date)}
					day={day}
					view="week"
					onSelectDay={handleSelectDay}
					onSelectTodo={(todo) => setSelectedTodoId(todo.id)}
					todos={groupedByDay.get(toDateKey(day.date)) || []}
					todayText={t.calendar.today}
				/>
			))}
		</div>
	);

	const renderDayView = () => {
		const key = toDateKey(currentDate);
		const todaysTodos = groupedByDay.get(key) || [];
		return (
			<div className="flex flex-col gap-3">
				<div className="flex flex-col gap-3">
					{todaysTodos.length === 0 ? (
						<div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
							{t.calendar.noTodosDue}
						</div>
					) : (
						todaysTodos.map((item) => (
							<div
								key={item.todo.id}
								className={cn(
									"group relative flex flex-col gap-1 rounded-lg border bg-card p-3 text-xs shadow-sm transition-all",
									getStatusStyle(item.todo.status),
								)}
								onClick={() => setSelectedTodoId(item.todo.id)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										setSelectedTodoId(item.todo.id);
									}
								}}
								role="button"
								tabIndex={0}
							>
								<div className="flex items-center justify-between gap-2">
									<p className="truncate text-base font-semibold">
										{item.todo.name}
									</p>
									<span
										className={cn(
											"shrink-0 text-sm font-medium",
											getDeadlineSeverity(item.deadline) === "overdue"
												? "text-red-600"
												: getDeadlineSeverity(item.deadline) === "soon"
													? "text-amber-600"
													: "text-muted-foreground",
										)}
									>
										{formatTimeLabel(item.deadline, t.calendar.allDay)}
									</span>
								</div>
								{item.todo.tags && item.todo.tags.length > 0 && (
									<div className="flex flex-wrap gap-1">
										{item.todo.tags.map((tag) => (
											<span
												key={tag}
												className="rounded-full bg-white/50 px-2 py-0.5 text-xs text-muted-foreground"
											>
												{tag}
											</span>
										))}
									</div>
								)}
							</div>
						))
					)}
				</div>
			</div>
		);
	};

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部标题栏 */}
			<PanelHeader icon={Calendar} title={t.calendar.title} />
			{/* 顶部工具栏 */}
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/30 px-4 py-3">
				<span className="text-sm font-medium text-foreground">
					{view === "month" &&
						t.calendar.yearMonth
							.replace("{year}", String(currentDate.getFullYear()))
							.replace("{month}", String(currentDate.getMonth() + 1))}
					{view === "week" &&
						t.calendar.yearMonthWeek
							.replace("{year}", String(currentDate.getFullYear()))
							.replace("{month}", String(currentDate.getMonth() + 1))
							.replace("{week}", String(getWeekOfYear(currentDate)))}
					{view === "day" &&
						t.calendar.yearMonthDay
							.replace("{year}", String(currentDate.getFullYear()))
							.replace("{month}", String(currentDate.getMonth() + 1))
							.replace("{day}", String(currentDate.getDate()))}
				</span>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => handleNavigate("prev")}
						className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-muted/60"
						aria-label={t.calendar.previous}
					>
						<ChevronLeft className="h-4 w-4" />
					</button>
					<button
						type="button"
						onClick={() => handleNavigate("today")}
						className="inline-flex items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/60"
					>
						<RotateCcw className="h-4 w-4" />
						{t.calendar.today}
					</button>
					<button
						type="button"
						onClick={() => handleNavigate("next")}
						className="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-card text-muted-foreground hover:bg-muted/60"
						aria-label={t.calendar.next}
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
						{t.calendar.create}
					</button>
				</div>
			</div>

			{/* 视图主体 */}
			<div className="flex-1 overflow-y-auto bg-card p-3">
				{view !== "day" && (
					<div className="grid grid-cols-7">
						{WEEKDAY_LABELS.map((label) => (
							<span
								key={label}
								className="py-2 text-center text-xs font-medium text-muted-foreground"
							>
								{t.calendar.weekPrefix}
								{label}
							</span>
						))}
					</div>
				)}
				<div>
					{view === "month" && renderMonthView()}
					{view === "week" && renderWeekView()}
					{view === "day" && renderDayView()}
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
				labels={{
					createOnDate: t.calendar.createOnDate,
					closeCreate: t.calendar.closeCreate,
					inputTodoTitle: t.calendar.inputTodoTitle,
					create: t.calendar.create,
				}}
			/>
		</div>
	);
}
