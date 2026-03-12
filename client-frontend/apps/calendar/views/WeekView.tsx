/**
 * Week timeline view.
 */

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useTodoMutations } from "@/lib/query";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FloatingTodoCard } from "../components/FloatingTodoCard";
import { TimelineColumn } from "../components/TimelineColumn";
import { TimelineCreatePopover } from "../components/TimelineCreatePopover";
import type { TimelineItem } from "../types";
import {
	addMinutes,
	buildWeekDays,
	ceilToMinutes,
	DEFAULT_DURATION_MINUTES,
	DEFAULT_WORK_END_MINUTES,
	DEFAULT_WORK_START_MINUTES,
	floorToMinutes,
	formatMinutesLabel,
	formatTimeRangeLabel,
	getMinutesFromDate,
	isAllDayDeadlineString,
	isSameDay,
	MINUTES_PER_SLOT,
	parseTodoDateTime,
	toDateKey,
} from "../utils";
import { useWeekViewActions } from "./useWeekViewActions";

const SLOT_HEIGHT = 12;

interface ParsedTodo {
	todo: Todo;
	deadlineRaw?: string;
	deadline: Date | null;
	start: Date | null;
	end: Date | null;
}

export function WeekView({
	currentDate,
	todos,
	onSelectDay,
	onSelectTodo,
	todayText,
}: {
	currentDate: Date;
	todos: Todo[];
	onSelectDay: (
		date: Date,
		anchorEl?: HTMLDivElement | null,
		inCurrentMonth?: boolean,
	) => void;
	onSelectTodo: (todo: Todo) => void;
	todayText: string;
}) {
	const t = useTranslations("calendar");
	const weekDayLabels = [
		t("weekdays.monday"),
		t("weekdays.tuesday"),
		t("weekdays.wednesday"),
		t("weekdays.thursday"),
		t("weekdays.friday"),
		t("weekdays.saturday"),
		t("weekdays.sunday"),
	];
	const { updateTodo, createTodo } = useTodoMutations();
	const [workingStart, setWorkingStart] = useState(DEFAULT_WORK_START_MINUTES);
	const [workingEnd, setWorkingEnd] = useState(DEFAULT_WORK_END_MINUTES);
	const pxPerMinute = SLOT_HEIGHT / MINUTES_PER_SLOT;
	const weekDays = buildWeekDays(currentDate);
	const maxTimelineMinutes = 24 * 60 - MINUTES_PER_SLOT;

	const parsedTodos = useMemo<ParsedTodo[]>(
		() =>
			todos.map((todo) => ({
				todo,
				deadlineRaw: todo.deadline,
				deadline: parseTodoDateTime(todo.deadline),
				start: parseTodoDateTime(todo.startTime),
				end: parseTodoDateTime(todo.endTime),
			})),
		[todos],
	);

	const { itemsByDay, allDayByDay, allTimelineItems } = useMemo(() => {
		const map = new Map<string, TimelineItem[]>();
		const allDay = new Map<string, Todo[]>();
		for (const day of weekDays) {
			const key = toDateKey(day.date);
			map.set(key, []);
			allDay.set(key, []);
		}

		const allItems: TimelineItem[] = [];

		for (const entry of parsedTodos) {
			const anchor = entry.start ?? entry.end ?? entry.deadline;
			const hasTime = Boolean(entry.start || entry.end || entry.deadline);
			if (!hasTime) continue;
			if (!anchor) continue;
			const dayKey = toDateKey(anchor);
			if (!map.has(dayKey)) continue;

			if (
				!entry.start &&
				!entry.end &&
				isAllDayDeadlineString(entry.deadlineRaw)
			) {
				allDay.get(dayKey)?.push(entry.todo);
				continue;
			}

			if (entry.start || entry.end) {
				const start =
					entry.start ?? addMinutes(entry.end as Date, -DEFAULT_DURATION_MINUTES);
				const end = entry.end ?? addMinutes(start, DEFAULT_DURATION_MINUTES);
				const startMinutes = getMinutesFromDate(start);
				const endMinutes = Math.max(
					startMinutes + MINUTES_PER_SLOT,
					getMinutesFromDate(end),
				);
				const item: TimelineItem = {
					todo: entry.todo,
					kind: "range",
					date: anchor,
					startMinutes,
					endMinutes,
					timeLabel: formatTimeRangeLabel(startMinutes, endMinutes),
				};
				map.get(dayKey)?.push(item);
				allItems.push(item);
				continue;
			}

			const deadlineMinutes = getMinutesFromDate(entry.deadline as Date);
			const item: TimelineItem = {
				todo: entry.todo,
				kind: "deadline",
				date: anchor,
				startMinutes: deadlineMinutes,
				endMinutes: deadlineMinutes + MINUTES_PER_SLOT,
				timeLabel: formatMinutesLabel(deadlineMinutes),
			};
			map.get(dayKey)?.push(item);
			allItems.push(item);
		}

		for (const list of map.values()) {
			list.sort((a, b) => a.startMinutes - b.startMinutes);
		}

		return { itemsByDay: map, allDayByDay: allDay, allTimelineItems: allItems };
	}, [parsedTodos, weekDays]);

	const { displayStart, displayEnd } = useMemo(() => {
		if (allTimelineItems.length === 0) {
			return { displayStart: workingStart, displayEnd: workingEnd };
		}
		const minStart = Math.min(
			...allTimelineItems.map((item) => item.startMinutes),
		);
		const maxEnd = Math.max(
			...allTimelineItems.map((item) =>
				item.kind === "range" ? item.endMinutes : item.startMinutes,
			),
		);
		const autoStart = floorToMinutes(minStart);
		const autoEnd = ceilToMinutes(maxEnd);
		return {
			displayStart: Math.min(workingStart, autoStart),
			displayEnd: Math.max(workingEnd, autoEnd),
		};
	}, [allTimelineItems, workingEnd, workingStart]);

	const slotMinutes = useMemo(() => {
		const total = Math.max(
			1,
			Math.ceil((displayEnd - displayStart) / MINUTES_PER_SLOT),
		);
		return Array.from({ length: total }, (_, idx) => displayStart + idx * MINUTES_PER_SLOT);
	}, [displayEnd, displayStart]);

	const {
		timelineAnchor,
		createMode,
		timelineTitle,
		timelineStart,
		timelineEnd,
		timelineDate,
		timelinePreview,
		allDayPreview,
		setTimelineTitle,
		setTimelineStart,
		setTimelineEnd,
		openTimelineCreateAt,
		openAllDayCreateAt,
		closeTimelineCreate,
		handleCreateTimelineTodo,
		handleResize,
		handleWorkingPointerDown,
	} = useWeekViewActions({
		currentDate,
		createTodo,
		updateTodo,
		displayStart,
		pxPerMinute,
		workingStart,
		workingEnd,
		setWorkingStart,
		setWorkingEnd,
		maxTimelineMinutes,
	});

	return (
		<div className="flex flex-col gap-3">
			<div className="sticky top-0 z-20 space-y-3 bg-background/95 pb-3 backdrop-blur">
				<div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] overflow-hidden rounded-xl border border-border/70">
					<div className="bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground">
						{t("weekView")}
					</div>
					{weekDays.map((day, index) => {
						const dateKey = toDateKey(day.date);
						const isToday = isSameDay(day.date, new Date());
						return (
							<div
								key={dateKey}
								className={cn(
									"flex items-center justify-between gap-2 border-l border-border/70 bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground",
									isToday && "text-primary",
								)}
								onClick={(event) => {
									onSelectDay(day.date, event.currentTarget, true);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										onSelectDay(day.date, event.currentTarget, true);
									}
								}}
								role="button"
								tabIndex={0}
							>
								<span>
									{t("weekPrefix")}
									{weekDayLabels[index]} {day.date.getDate()}
								</span>
								{isToday && (
									<span className="text-[11px] font-medium">{todayText}</span>
								)}
							</div>
						);
					})}
				</div>

				<div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] overflow-hidden rounded-xl border border-border/70">
					<div className="border-r border-border/70 bg-card/50 px-3 py-2 text-xs font-semibold text-muted-foreground">
						{t("allDay")}
					</div>
					{weekDays.map((day) => {
						const dateKey = toDateKey(day.date);
						const allDayTodos = allDayByDay.get(dateKey) || [];
						return (
							<div
								key={dateKey}
								className="border-l border-border/70 bg-card/50 px-3 py-2"
								onClick={(event) =>
									openAllDayCreateAt(
										day.date,
										event.currentTarget,
										event.target as HTMLElement,
									)
								}
								onKeyDown={(event) => {
									if (event.key === "Enter" || event.key === " ") {
										event.preventDefault();
										openAllDayCreateAt(day.date, event.currentTarget);
									}
								}}
								role="button"
								tabIndex={0}
							>
								<div className="flex flex-wrap gap-2">
									{allDayTodos.map((todo) => (
										<FloatingTodoCard
											key={todo.id}
											todo={todo}
											onSelect={onSelectTodo}
										/>
									))}
									{createMode === "all-day" &&
										allDayPreview &&
										isSameDay(allDayPreview, day.date) && (
											<div className="rounded-lg border border-dashed border-primary/60 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary shadow-sm ring-2 ring-primary/30">
												{timelineTitle.trim() || t("inputTodoTitle")}
											</div>
										)}
								</div>
							</div>
						);
					})}
				</div>
			</div>

			<div className="rounded-xl border border-border/70 bg-card/50">
				<div className="flex items-center justify-between border-b border-border/70 px-3 py-2 text-xs text-muted-foreground">
					<span className="font-semibold">{t("workingHours")}</span>
					<span>
						{formatMinutesLabel(displayStart)}-{formatMinutesLabel(displayEnd)}
					</span>
				</div>
				<div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))]">
					<div className="relative border-r border-border/70 px-3 text-[11px] text-muted-foreground">
						{slotMinutes
							.filter((minutes) => minutes % 60 === 0)
							.map((minutes) => (
								<span
									key={`label-${minutes}`}
									className="absolute left-3"
									style={{
										top: (minutes - displayStart) * pxPerMinute - 6,
									}}
								>
									{formatMinutesLabel(minutes)}
								</span>
							))}
					</div>
					<div
						className="relative col-span-7"
						style={{ height: slotMinutes.length * SLOT_HEIGHT }}
						data-timeline-container
					>
						<div
							className="absolute left-0 right-0 z-10 h-1 cursor-row-resize bg-primary/40"
							style={{
								top: (workingStart - displayStart) * pxPerMinute,
							}}
							onPointerDown={(event) =>
								handleWorkingPointerDown("start", event)
							}
						/>
						<div
							className="absolute left-0 right-0 z-10 h-1 cursor-row-resize bg-primary/40"
							style={{
								top: (workingEnd - displayStart) * pxPerMinute,
							}}
							onPointerDown={(event) => handleWorkingPointerDown("end", event)}
						/>
						<div className="grid h-full grid-cols-7">
							{weekDays.map((day) => {
								const dateKey = toDateKey(day.date);
								return (
									<div
										key={dateKey}
										className="border-l border-border/60"
									>
										<TimelineColumn
											date={day.date}
											items={itemsByDay.get(dateKey) || []}
											displayStart={displayStart}
											slotMinutes={slotMinutes}
											slotHeight={SLOT_HEIGHT}
											pxPerMinute={pxPerMinute}
											preview={
												createMode === "timeline" &&
												timelinePreview &&
												isSameDay(timelinePreview.date, day.date)
													? {
															startMinutes: timelinePreview.startMinutes,
															endMinutes: timelinePreview.endMinutes,
															timeLabel: formatTimeRangeLabel(
																timelinePreview.startMinutes,
																timelinePreview.endMinutes,
															),
															title:
																timelineTitle.trim() ||
																t("inputTodoTitle"),
														}
													: undefined
											}
											onSelect={onSelectTodo}
											onResize={handleResize}
											onSlotPointerDown={openTimelineCreateAt}
										/>
									</div>
								);
							})}
						</div>
					</div>
				</div>
			</div>
			<TimelineCreatePopover
				targetDate={timelineDate}
				value={timelineTitle}
				startTime={timelineStart}
				endTime={timelineEnd}
				showTimeFields={createMode !== "all-day"}
				anchorPoint={timelineAnchor}
				onChange={setTimelineTitle}
				onStartTimeChange={setTimelineStart}
				onEndTimeChange={setTimelineEnd}
				onConfirm={handleCreateTimelineTodo}
				onCancel={closeTimelineCreate}
			/>
		</div>
	);
}
