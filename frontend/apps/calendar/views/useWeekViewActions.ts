/**
 * Shared handlers/state for WeekView timeline interactions.
 */

import { useState } from "react";
import type { CreateTodoInput, Todo, UpdateTodoInput } from "@/lib/types";
import {
	clampMinutes,
	DEFAULT_DURATION_MINUTES,
	DEFAULT_NEW_TIME,
	formatMinutesLabel,
	isSameDay,
	MINUTES_PER_SLOT,
	setMinutesOnDate,
	toDateKey,
} from "../utils";

interface UseWeekViewActionsParams {
	currentDate: Date;
	createTodo: (input: CreateTodoInput) => Promise<unknown>;
	updateTodo: (id: number, input: UpdateTodoInput) => Promise<unknown>;
	displayStart: number;
	pxPerMinute: number;
	workingStart: number;
	workingEnd: number;
	setWorkingStart: (value: number) => void;
	setWorkingEnd: (value: number) => void;
	maxTimelineMinutes: number;
}

export function useWeekViewActions({
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
}: UseWeekViewActionsParams) {
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
		const safeStart = Math.min(
			minutes,
			maxTimelineMinutes - MINUTES_PER_SLOT,
		);
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
		date: Date,
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
		setTimelineDate(date);
		setTimelineStart(DEFAULT_NEW_TIME);
		setTimelineEnd(DEFAULT_NEW_TIME);
		setTimelineTitle("");
		setTimelineAnchor({ top, left });
		setTimelinePreview(null);
		setAllDayPreview(date);
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
		const targetDate = isSameDay(date, currentDate)
			? currentDate
			: date;
		const startDate = setMinutesOnDate(targetDate, startMinutes);
		const endDate = setMinutesOnDate(targetDate, endMinutes);
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

	return {
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
	};
}
