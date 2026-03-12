/**
 * Day timeline view.
 */

import { useTranslations } from "next-intl";
import type React from "react";
import { useMemo, useState } from "react";
import { useTodoMutations } from "@/lib/query";
import { useTodoStore } from "@/lib/store/todo-store";
import type { Todo } from "@/lib/types";
import { FloatingTodoCard } from "../components/FloatingTodoCard";
import { TimelineColumn } from "../components/TimelineColumn";
import { TimelineCreatePopover } from "../components/TimelineCreatePopover";
import type { TimelineItem } from "../types";
import {
	addMinutes,
	ceilToMinutes,
	clampMinutes,
	DEFAULT_DURATION_MINUTES,
	DEFAULT_NEW_TIME,
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
	setMinutesOnDate,
	toDateKey,
} from "../utils";

const SLOT_HEIGHT = 12;

interface ParsedTodo {
	todo: Todo;
	deadlineRaw?: string;
	deadline: Date | null;
	start: Date | null;
	end: Date | null;
}

export function DayView({
	currentDate,
	todos,
}: {
	currentDate: Date;
	todos: Todo[];
}) {
	const t = useTranslations("calendar");
	const { setSelectedTodoId } = useTodoStore();
	const { updateTodo, createTodo } = useTodoMutations();
	const [workingStart, setWorkingStart] = useState(DEFAULT_WORK_START_MINUTES);
	const [workingEnd, setWorkingEnd] = useState(DEFAULT_WORK_END_MINUTES);
	const pxPerMinute = SLOT_HEIGHT / MINUTES_PER_SLOT;
	const [timelineAnchor, setTimelineAnchor] = useState<{
		top: number;
		left: number;
	} | null>(null);
	const [createMode, setCreateMode] = useState<"timeline" | "all-day" | null>(
		null,
	);
	const [timelineTitle, setTimelineTitle] = useState("");
	const [timelineStart, setTimelineStart] = useState("");
	const [timelineEnd, setTimelineEnd] = useState("");
	const [timelineDate, setTimelineDate] = useState<Date | null>(null);
	const [timelinePreview, setTimelinePreview] = useState<{
		date: Date;
		startMinutes: number;
		endMinutes: number;
	} | null>(null);
	const [allDayPreview, setAllDayPreview] = useState<Date | null>(null);
	const weekDayLabels = [
		t("weekdays.monday"),
		t("weekdays.tuesday"),
		t("weekdays.wednesday"),
		t("weekdays.thursday"),
		t("weekdays.friday"),
		t("weekdays.saturday"),
		t("weekdays.sunday"),
	];
	const weekDayIndex = (currentDate.getDay() + 6) % 7;
	const dayHeaderLabel = `${t("weekPrefix")}${weekDayLabels[weekDayIndex]} ${currentDate.getDate()}`;
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

	const { timelineItems, allDayTodos } = useMemo(() => {
		const items: TimelineItem[] = [];
		const allDay: Todo[] = [];

		for (const entry of parsedTodos) {
			const anchor = entry.start ?? entry.end ?? entry.deadline;
			const hasTime = Boolean(entry.start || entry.end || entry.deadline);
			if (!hasTime) continue;
			if (!anchor || !isSameDay(anchor, currentDate)) continue;

			if (
				!entry.start &&
				!entry.end &&
				isAllDayDeadlineString(entry.deadlineRaw)
			) {
				allDay.push(entry.todo);
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
				items.push({
					todo: entry.todo,
					kind: "range",
					date: currentDate,
					startMinutes,
					endMinutes,
					timeLabel: formatTimeRangeLabel(startMinutes, endMinutes),
				});
				continue;
			}

			const deadlineMinutes = getMinutesFromDate(entry.deadline as Date);
			items.push({
				todo: entry.todo,
				kind: "deadline",
				date: currentDate,
				startMinutes: deadlineMinutes,
				endMinutes: deadlineMinutes + MINUTES_PER_SLOT,
				timeLabel: formatMinutesLabel(deadlineMinutes),
			});
		}

		items.sort((a, b) => a.startMinutes - b.startMinutes);
		return { timelineItems: items, allDayTodos: allDay };
	}, [currentDate, parsedTodos]);

	const { displayStart, displayEnd } = useMemo(() => {
		if (timelineItems.length === 0) {
			return { displayStart: workingStart, displayEnd: workingEnd };
		}
		const minStart = Math.min(...timelineItems.map((item) => item.startMinutes));
		const maxEnd = Math.max(
			...timelineItems.map((item) =>
				item.kind === "range" ? item.endMinutes : item.startMinutes,
			),
		);
		const autoStart = floorToMinutes(minStart);
		const autoEnd = ceilToMinutes(maxEnd);
		return {
			displayStart: Math.min(workingStart, autoStart),
			displayEnd: Math.max(workingEnd, autoEnd),
		};
	}, [timelineItems, workingEnd, workingStart]);

	const slotMinutes = useMemo(() => {
		const total = Math.max(
			1,
			Math.ceil((displayEnd - displayStart) / MINUTES_PER_SLOT),
		);
		return Array.from({ length: total }, (_, idx) => displayStart + idx * MINUTES_PER_SLOT);
	}, [displayEnd, displayStart]);

	const parseTimeInput = (value: string) => {
		const [hh, mm] = value.split(":").map((part) => Number(part));
		if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
		return clampMinutes(hh * 60 + mm, 0, maxTimelineMinutes);
	};

	const openTimelineCreateAt = ({
		date,
		minutes,
		anchorRect,
		clientY,
	}: {
		date: Date;
		minutes: number;
		anchorRect: DOMRect;
		clientY: number;
	}) => {
		if (typeof window === "undefined") return;
		const safeStart = Math.min(minutes, maxTimelineMinutes - MINUTES_PER_SLOT);
		const endMinutes = clampMinutes(
			safeStart + DEFAULT_DURATION_MINUTES,
			0,
			maxTimelineMinutes,
		);
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const preferredLeft = anchorRect.left + 16;
		const preferredTop = clientY + 8;
		const popoverWidth = 340;
		const popoverHeight = 260;
		const left = Math.min(
			Math.max(12, preferredLeft),
			viewportWidth - popoverWidth,
		);
		const top = Math.min(
			Math.max(12, preferredTop),
			viewportHeight - popoverHeight,
		);

		setCreateMode("timeline");
		setTimelineDate(date);
		setTimelineStart(formatMinutesLabel(safeStart));
		setTimelineEnd(formatMinutesLabel(endMinutes));
		setTimelineTitle("");
		setTimelineAnchor({ top, left });
		setTimelinePreview({
			date,
			startMinutes: safeStart,
			endMinutes,
		});
		setAllDayPreview(null);
	};

	const openAllDayCreateAt = (
		target: HTMLElement,
		eventTarget?: HTMLElement,
	) => {
		if (typeof window === "undefined") return;
		if (eventTarget?.closest("[data-all-day-card]")) {
			return;
		}
		const rect = target.getBoundingClientRect();
		const viewportWidth = window.innerWidth;
		const viewportHeight = window.innerHeight;
		const preferredLeft = rect.left + 16;
		const preferredTop = rect.bottom + 8;
		const popoverWidth = 340;
		const popoverHeight = 220;
		const left = Math.min(
			Math.max(12, preferredLeft),
			viewportWidth - popoverWidth,
		);
		const top = Math.min(
			Math.max(12, preferredTop),
			viewportHeight - popoverHeight,
		);

		setCreateMode("all-day");
		setTimelineDate(currentDate);
		setTimelineStart(DEFAULT_NEW_TIME);
		setTimelineEnd(DEFAULT_NEW_TIME);
		setTimelineTitle("");
		setTimelineAnchor({ top, left });
		setTimelinePreview(null);
		setAllDayPreview(currentDate);
	};

	const closeTimelineCreate = () => {
		setTimelineAnchor(null);
		setTimelineDate(null);
		setTimelineTitle("");
		setTimelineStart("");
		setTimelineEnd("");
		setCreateMode(null);
		setTimelinePreview(null);
		setAllDayPreview(null);
	};

	const handleCreateTimelineTodo = async () => {
		if (!timelineDate || !timelineTitle.trim()) return;
		if (createMode === "all-day") {
			const dateKey = toDateKey(timelineDate);
			try {
				await createTodo({
					name: timelineTitle.trim(),
					deadline: `${dateKey}T00:00:00`,
					status: "active",
				});
				closeTimelineCreate();
			} catch (error) {
				console.error("Failed to create all-day todo:", error);
			}
			return;
		}
		const startMinutes = parseTimeInput(timelineStart);
		let endMinutes = parseTimeInput(timelineEnd);
		if (startMinutes === null) return;
		if (endMinutes === null || endMinutes <= startMinutes) {
			endMinutes = clampMinutes(
				startMinutes + DEFAULT_DURATION_MINUTES,
				0,
				maxTimelineMinutes,
			);
		}
		if (endMinutes <= startMinutes) {
			endMinutes = clampMinutes(
				startMinutes + MINUTES_PER_SLOT,
				0,
				maxTimelineMinutes,
			);
		}
		const startDate = setMinutesOnDate(timelineDate, startMinutes);
		const endDate = setMinutesOnDate(timelineDate, endMinutes);
		try {
			await createTodo({
				name: timelineTitle.trim(),
				startTime: startDate.toISOString(),
				endTime: endDate.toISOString(),
				status: "active",
			});
			closeTimelineCreate();
		} catch (error) {
			console.error("Failed to create timeline todo:", error);
		}
	};

	const handleResize = async (
		todo: Todo,
		startMinutes: number,
		endMinutes: number,
		date: Date,
	) => {
		const startDate = setMinutesOnDate(date, startMinutes);
		const endDate = setMinutesOnDate(date, endMinutes);
		await updateTodo(todo.id, {
			startTime: startDate.toISOString(),
			endTime: endDate.toISOString(),
		});
	};

	const handleWorkingPointerDown = (
		edge: "start" | "end",
		event: React.PointerEvent<HTMLDivElement>,
	) => {
		event.preventDefault();
		event.stopPropagation();
		const container = event.currentTarget.closest(
			"[data-timeline-container]",
		) as HTMLDivElement | null;
		if (!container) return;

		const handleMove = (moveEvent: PointerEvent) => {
			const rect = container.getBoundingClientRect();
			if (!rect) return;
			const offset = moveEvent.clientY - rect.top;
			const rawMinutes =
				displayStart +
				Math.round((offset / pxPerMinute) / MINUTES_PER_SLOT) * MINUTES_PER_SLOT;
			const minutes = clampMinutes(rawMinutes, 0, 24 * 60);

			if (edge === "start") {
				setWorkingStart(Math.min(minutes, workingEnd - MINUTES_PER_SLOT));
			} else {
				setWorkingEnd(Math.max(minutes, workingStart + MINUTES_PER_SLOT));
			}
		};

		const handleUp = () => {
			window.removeEventListener("pointermove", handleMove);
			window.removeEventListener("pointerup", handleUp);
		};

		window.addEventListener("pointermove", handleMove);
		window.addEventListener("pointerup", handleUp);
	};

	return (
		<div className="relative flex flex-col gap-4">
			<div className="sticky top-0 z-20 space-y-3 bg-background/95 pb-3 backdrop-blur">
				<div className="rounded-xl border border-border bg-card/50 px-4 py-3 text-sm font-semibold text-foreground shadow-sm">
					{dayHeaderLabel}
				</div>
				<div
					className="rounded-xl border border-border bg-card/50 p-3 shadow-sm"
					onClick={(event) =>
						openAllDayCreateAt(
							event.currentTarget,
							event.target as HTMLElement,
						)
					}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							openAllDayCreateAt(event.currentTarget);
						}
					}}
					role="button"
					tabIndex={0}
				>
					<div className="mb-2 flex items-center justify-between text-xs font-semibold text-muted-foreground">
						<span>{t("allDay")}</span>
						<span className="text-[11px] text-muted-foreground">
							{allDayTodos.length}
						</span>
					</div>
					<div className="flex flex-wrap gap-2">
						{allDayTodos.map((todo) => (
							<FloatingTodoCard
								key={todo.id}
								todo={todo}
								onSelect={(selected) => setSelectedTodoId(selected.id)}
							/>
						))}
						{createMode === "all-day" &&
							allDayPreview &&
							isSameDay(allDayPreview, currentDate) && (
								<div className="rounded-lg border border-dashed border-primary/60 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary shadow-sm ring-2 ring-primary/30">
									{timelineTitle.trim() || t("inputTodoTitle")}
								</div>
							)}
					</div>
				</div>
			</div>

			<div className="rounded-xl border border-border bg-card/50 p-3 shadow-sm">
				<div className="mb-3 flex items-center justify-between text-xs text-muted-foreground">
					<span className="font-semibold">{t("workingHours")}</span>
					<span>
						{formatMinutesLabel(displayStart)}-{formatMinutesLabel(displayEnd)}
					</span>
				</div>
				<div className="flex">
					<div className="relative w-14 shrink-0 pr-2 text-[11px] text-muted-foreground">
						{slotMinutes
							.filter((minutes) => minutes % 60 === 0)
							.map((minutes) => (
								<span
									key={`label-${minutes}`}
									className="absolute left-0"
									style={{
										top: (minutes - displayStart) * pxPerMinute - 6,
									}}
								>
									{formatMinutesLabel(minutes)}
								</span>
							))}
					</div>
					<div
						className="relative flex-1"
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
						<TimelineColumn
							date={currentDate}
							items={timelineItems}
							displayStart={displayStart}
							slotMinutes={slotMinutes}
							slotHeight={SLOT_HEIGHT}
							pxPerMinute={pxPerMinute}
							preview={
								createMode === "timeline" && timelinePreview
									? {
											startMinutes: timelinePreview.startMinutes,
											endMinutes: timelinePreview.endMinutes,
											timeLabel: formatTimeRangeLabel(
												timelinePreview.startMinutes,
												timelinePreview.endMinutes,
											),
											title: timelineTitle.trim() || t("inputTodoTitle"),
										}
									: undefined
							}
							onSelect={(todo) => setSelectedTodoId(todo.id)}
							onResize={handleResize}
							onSlotPointerDown={openTimelineCreateAt}
							className="border-l border-border/60"
						/>
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
