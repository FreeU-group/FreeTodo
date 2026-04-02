/**
 * 拖拽处理器 - 策略模式分发
 * Drag Drop Handlers - Strategy Pattern Dispatch
 */

import { flushSync } from "react-dom";
import { extractErrorMessage } from "@/lib/errors";
import type { TodoListResponse, TodoResponse } from "@/lib/generated/schemas";
import {
	reorderTodosApiTodosReorderPost,
	updateTodoApiTodosTodoIdPut,
} from "@/lib/generated/todos/todos";
import { getClientTranslator } from "@/lib/i18n/runtime";
import { getQueryClient, queryKeys } from "@/lib/query";
import { useUiStore } from "@/lib/store/ui-store";
import { toastError } from "@/lib/toast";
import type {
	DragData,
	DragDropHandler,
	DragDropResult,
	DropData,
	HandlerKey,
} from "./types";

const handlerRegistry: Partial<Record<HandlerKey, DragDropHandler>> = {};
const getTodoListTranslator = () => getClientTranslator();

const normalizeTodoDate = (value?: string) => {
	if (!value) return null;
	let normalized = value;
	if (
		value.includes("T") &&
		!value.includes("Z") &&
		!value.includes("+") &&
		!/\d{2}:\d{2}:\d{2}-/.test(value)
	) {
		normalized = `${value}Z`;
	}
	const parsed = new Date(normalized);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const updateTodoCache = (
	todoId: number,
	updates: {
		deadline?: string;
		startTime?: string;
		endTime?: string;
	},
) => {
	const queryClient = getQueryClient();

	void queryClient.cancelQueries({ queryKey: queryKeys.todos.all });

	const previousTodos = queryClient.getQueryData(queryKeys.todos.list());

	flushSync(() => {
		queryClient.setQueryData<TodoListResponse>(
			queryKeys.todos.list(),
			(oldData) => {
				if (!oldData) return oldData;

				if (oldData && "todos" in oldData && Array.isArray(oldData.todos)) {
					const updatedTodos = oldData.todos.map((t: TodoResponse) => {
						if (t.id !== todoId) return t;
						const tRecord = t as unknown as Record<string, unknown>;
						const updated = {
							...t,
							...(updates.deadline ? { deadline: updates.deadline } : {}),
						} as Record<string, unknown>;
						if ("start_time" in tRecord) {
							updated.start_time = updates.startTime ?? tRecord.start_time;
						}
						if ("startTime" in tRecord) {
							updated.startTime = updates.startTime ?? tRecord.startTime;
						}
						if ("end_time" in tRecord) {
							updated.end_time = updates.endTime ?? tRecord.end_time;
						}
						if ("endTime" in tRecord) {
							updated.endTime = updates.endTime ?? tRecord.endTime;
						}
						return updated as unknown as TodoResponse;
					});
					return {
						...oldData,
						todos: updatedTodos,
					};
				}

				if (Array.isArray(oldData)) {
					return oldData.map((t) =>
						t.id === todoId
							? {
									...t,
									...(updates.deadline ? { deadline: updates.deadline } : {}),
									...(updates.startTime ? { startTime: updates.startTime } : {}),
									...(updates.endTime ? { endTime: updates.endTime } : {}),
								}
							: t,
					) as unknown as TodoListResponse;
				}

				return oldData;
			},
		);
	});

	return previousTodos;
};

export function registerHandler(key: HandlerKey, handler: DragDropHandler) {
	handlerRegistry[key] = handler;
}

export function getHandler(key: HandlerKey): DragDropHandler | undefined {
	return handlerRegistry[key];
}

/** TODO_CARD -> CALENDAR_DATE: set startTime/endTime with optimistic update */
const handleTodoToCalendarDate: DragDropHandler = (
	dragData,
	dropData,
): DragDropResult => {
	if (dragData.type !== "TODO_CARD" || dropData.type !== "CALENDAR_DATE") {
		return { success: false, message: "Invalid drag/drop type combination" };
	}

	const { todo } = dragData.payload;
	const { date } = dropData.metadata;

	const applyDate = (targetDate: Date, timeSource: Date) => {
		const updated = new Date(targetDate);
		updated.setHours(
			timeSource.getHours(),
			timeSource.getMinutes(),
			timeSource.getSeconds(),
			timeSource.getMilliseconds(),
		);
		return updated;
	};

	const existingStart = normalizeTodoDate(todo.startTime);
	const existingEnd = normalizeTodoDate(todo.endTime);
	const baseStart = existingStart;
	const durationMs =
		existingStart && existingEnd
			? existingEnd.getTime() - existingStart.getTime()
			: null;

	const newStart = baseStart
		? applyDate(date, baseStart)
		: applyDate(date, new Date(0));
	if (!baseStart) {
		// 默认设置为上午9点
		newStart.setHours(9, 0, 0, 0);
	}
	const newEnd = existingEnd
		? durationMs !== null
			? new Date(newStart.getTime() + durationMs)
			: applyDate(date, existingEnd)
		: null;

	const newStartStr = newStart ? newStart.toISOString() : undefined;
	const newEndStr = newEnd ? newEnd.toISOString() : undefined;
	const queryClient = getQueryClient();
	void queryClient.cancelQueries({ queryKey: queryKeys.todos.all });
	const previousTodos = queryClient.getQueryData(queryKeys.todos.list());

	flushSync(() => {
		queryClient.setQueryData<TodoListResponse>(
			queryKeys.todos.list(),
			(oldData) => {
				if (!oldData) return oldData;
				if (oldData && "todos" in oldData && Array.isArray(oldData.todos)) {
					return { ...oldData, todos: oldData.todos.map((t: TodoResponse) => {
						if (t.id !== todo.id) return t;
						const r = t as unknown as Record<string, unknown>;
						return { ...t,
							...("start_time" in r ? { start_time: newStartStr ?? r.start_time } : {}),
							...("startTime" in r ? { startTime: newStartStr ?? r.startTime } : {}),
							...("end_time" in r ? { end_time: newEndStr ?? r.end_time } : {}),
							...("endTime" in r ? { endTime: newEndStr ?? r.endTime } : {}),
						} as unknown as TodoResponse;
					}) };
				}
				if (Array.isArray(oldData)) {
					return oldData.map((t) => t.id === todo.id
						? { ...t, startTime: newStartStr ?? t.startTime, endTime: newEndStr ?? t.endTime } : t,
					) as unknown as TodoListResponse;
				}
				return oldData;
			},
		);
	});

	void updateTodoApiTodosTodoIdPut(todo.id, {
		...(newStartStr ? { start_time: newStartStr } : {}),
		...(newEndStr ? { end_time: newEndStr } : {}),
	})
		.then(() => { void getQueryClient().invalidateQueries({ queryKey: queryKeys.todos.all }); })
		.catch((error) => {
			console.error("[DnD] Failed to update schedule:", error);
			const tTodoList = getTodoListTranslator();
			toastError(
				tTodoList("todoList.updateFailed", {
					error: extractErrorMessage(
						error,
						tTodoList("todoList.unknownError"),
					),
				}),
			);
			if (previousTodos) {
				getQueryClient().setQueryData(queryKeys.todos.list(), previousTodos);
			}
			void getQueryClient().invalidateQueries({ queryKey: queryKeys.todos.all });
		});

	return {
		success: true,
		message: `已将 "${todo.name}" 设置到 ${dropData.metadata.dateKey}`,
	};
};

/** TODO_CARD -> CALENDAR_TIMELINE_SLOT */
const handleTodoToCalendarTimelineSlot: DragDropHandler = (
	dragData,
	dropData,
): DragDropResult => {
	if (dragData.type !== "TODO_CARD" || dropData.type !== "CALENDAR_TIMELINE_SLOT")
		return { success: false, message: "Invalid drag/drop type combination" };

	const { todo } = dragData.payload;
	const { date, minutes } = dropData.metadata;

	const slotDate = new Date(date);
	slotDate.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);

	const existingStart = normalizeTodoDate(todo.startTime);
	const existingEnd = normalizeTodoDate(todo.endTime);
	const existingDeadline = normalizeTodoDate(todo.deadline);
	const hasRange = Boolean(existingStart || existingEnd);

	const MINUTES_PER_SLOT = 15;
	const DEFAULT_DURATION_MINUTES = 30;

	const rawDuration = existingStart && existingEnd
		? Math.max((existingEnd.getTime() - existingStart.getTime()) / 60000, DEFAULT_DURATION_MINUTES)
		: DEFAULT_DURATION_MINUTES;
	const snappedDuration = Math.max(MINUTES_PER_SLOT, Math.round(rawDuration / MINUTES_PER_SLOT) * MINUTES_PER_SLOT);

	let newDeadline: Date | null = null;
	let newStart: Date | null = null;
	let newEnd: Date | null = null;

	if (hasRange) {
		newStart = slotDate;
		newEnd = new Date(slotDate.getTime() + snappedDuration * 60000);
	} else if (existingDeadline) {
		newDeadline = slotDate;
	} else {
		newStart = slotDate;
		newEnd = new Date(slotDate.getTime() + DEFAULT_DURATION_MINUTES * 60000);
	}

	const newDeadlineStr = newDeadline ? newDeadline.toISOString() : undefined;
	const newStartStr = newStart ? newStart.toISOString() : undefined;
	const newEndStr = newEnd ? newEnd.toISOString() : undefined;

	const previousTodos = updateTodoCache(todo.id, {
		...(newDeadlineStr ? { deadline: newDeadlineStr } : {}),
		...(newStartStr ? { startTime: newStartStr } : {}),
		...(newEndStr ? { endTime: newEndStr } : {}),
	});

	void updateTodoApiTodosTodoIdPut(todo.id, {
		...(newDeadlineStr ? { deadline: newDeadlineStr } : {}),
		...(newStartStr ? { startTime: newStartStr } : {}),
		...(newEndStr ? { endTime: newEndStr } : {}),
	})
		.then(() => {
			void getQueryClient().invalidateQueries({ queryKey: queryKeys.todos.all });
		})
		.catch((error) => {
			console.error("[DnD] Failed to update timeline slot:", error);
			const tTodoList = getTodoListTranslator();
			toastError(
				tTodoList("todoList.updateFailed", {
					error: extractErrorMessage(
						error,
						tTodoList("todoList.unknownError"),
					),
				}),
			);
			if (previousTodos) {
				getQueryClient().setQueryData(queryKeys.todos.list(), previousTodos);
			}
			void getQueryClient().invalidateQueries({ queryKey: queryKeys.todos.all });
		});

	return { success: true };
};

/** TODO_CARD -> TODO_LIST: internal reorder (actual sorting handled by TodoList component) */
const handleTodoToTodoList: DragDropHandler = (
	dragData,
	dropData,
): DragDropResult => {
	if (dragData.type !== "TODO_CARD" || dropData.type !== "TODO_LIST") {
		return { success: false, message: "Invalid drag/drop type combination" };
	}

	const { todo } = dragData.payload;
	const { parentTodoId } = dropData.metadata;

	if (parentTodoId !== undefined) {
		const queryClient = getQueryClient();
		void queryClient.cancelQueries({ queryKey: queryKeys.todos.all });
		const previousTodos = queryClient.getQueryData(queryKeys.todos.list());
		queryClient.setQueryData<TodoListResponse>(
			queryKeys.todos.list(),
			(oldData) => {
				if (!oldData) return oldData;
				if (oldData && "todos" in oldData && Array.isArray(oldData.todos)) {
					return { ...oldData, todos: oldData.todos.map((t: TodoResponse) =>
						t.id === todo.id ? { ...t, parent_todo_id: parentTodoId ?? null } : t,
					) };
				}
				if (Array.isArray(oldData)) {
					return oldData.map((t) =>
						t.id === todo.id ? { ...t, parentTodoId: parentTodoId ?? null } : t,
					) as unknown as TodoListResponse;
				}
				return oldData;
			},
		);

		void updateTodoApiTodosTodoIdPut(todo.id, {
			parent_todo_id: parentTodoId ?? null,
		})
			.then(() => {
				void queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
			})
			.catch((error) => {
				console.error("[DnD] Failed to update parent:", error);
				const tTodoList = getTodoListTranslator();
				toastError(
					tTodoList("todoList.reorderFailed", {
						error: extractErrorMessage(
							error,
							tTodoList("todoList.unknownError"),
						),
					}),
				);
				if (previousTodos) {
					queryClient.setQueryData(queryKeys.todos.list(), previousTodos);
				}
				void queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
			});
	}

	return { success: true };
};

/** TODO_CARD -> TODO_CARD_SLOT: insert before/after another todo */
const handleTodoToTodoCardSlot: DragDropHandler = (
	dragData,
	dropData,
): DragDropResult => {
	if (dragData.type !== "TODO_CARD" || dropData.type !== "TODO_CARD_SLOT") {
		return { success: false, message: "Invalid drag/drop type combination" };
	}

	const { todo: draggedTodo } = dragData.payload;
	const { todoId: targetTodoId, position } = dropData.metadata;

	if (draggedTodo.id === targetTodoId) {
		return { success: false, message: "Cannot drop todo onto itself" };
	}

	const queryClient = getQueryClient();
	const cachedData = queryClient.getQueryData<TodoListResponse>(queryKeys.todos.list());
	type CachedTodo = Record<string, unknown> & { id: number; order?: number };
	const allTodos = (cachedData?.todos ?? []) as unknown as CachedTodo[];
	const targetTodo = allTodos.find((t) => t.id === targetTodoId);
	if (!targetTodo) return { success: false, message: "Target todo not found" };

	const parentId = (targetTodo.parentTodoId ?? targetTodo.parent_todo_id ?? null) as number | null;
	const siblings = allTodos
		.filter((t) => (t.parentTodoId ?? t.parent_todo_id ?? null) === parentId && t.id !== draggedTodo.id)
		.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
	const targetIdx = siblings.findIndex((t) => t.id === targetTodoId);
	const insertIdx = position === "after" ? targetIdx + 1 : Math.max(0, targetIdx);
	siblings.splice(insertIdx, 0, { ...draggedTodo, id: draggedTodo.id } as CachedTodo);
	const reorderItems = siblings.map((t, i) => ({ id: t.id, order: i, parent_todo_id: parentId }));

	const previousTodos = queryClient.getQueryData(queryKeys.todos.list());
	const orderMap = new Map(reorderItems.map((r) => [r.id, r]));
	queryClient.setQueryData<TodoListResponse>(queryKeys.todos.list(), (old) => {
		if (!old || !("todos" in old) || !Array.isArray(old.todos)) return old;
		return { ...old, todos: old.todos.map((t: TodoResponse) => {
			const e = orderMap.get(t.id as number);
			return e ? { ...t, order: e.order, parentTodoId: e.parent_todo_id, parent_todo_id: e.parent_todo_id } : t;
		}) };
	});

	void reorderTodosApiTodosReorderPost({ items: reorderItems } as never)
		.then(() => { void queryClient.invalidateQueries({ queryKey: queryKeys.todos.all }); })
		.catch((error: unknown) => {
			console.error("[DnD] Failed to reorder via card slot:", error);
			if (previousTodos) queryClient.setQueryData(queryKeys.todos.list(), previousTodos);
			void queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
		});

	return { success: true, message: `Moved "${draggedTodo.name}" ${position} target` };
};

/** TODO_CARD -> TODO_DROP_ZONE: nest as child (actual API call handled by TodoList) */
const handleTodoToTodoDropZone: DragDropHandler = (
	dragData,
	dropData,
): DragDropResult => {
	if (dragData.type !== "TODO_CARD" || dropData.type !== "TODO_DROP_ZONE") {
		return { success: false, message: "Invalid drag/drop type combination" };
	}

	const { todo } = dragData.payload;
	const { position } = dropData.metadata;

	if (position === "nest") {
		return { success: true, message: `已将 "${todo.name}" 设置为子任务` };
	}
	return { success: false, message: "Unknown position" };
};

/** PANEL_HEADER -> PANEL_HEADER: swap panel positions */
const handlePanelHeaderToPanelHeader: DragDropHandler = (
	dragData,
	dropData,
): DragDropResult => {
	if (dragData.type !== "PANEL_HEADER" || dropData.type !== "PANEL_HEADER") {
		return { success: false, message: "Invalid drag/drop type combination" };
	}

	const { position: sourcePosition } = dragData.payload;
	const { position: targetPosition } = dropData.metadata;

	if (sourcePosition === targetPosition) {
		return { success: false, message: "Cannot swap panel with itself" };
	}

	useUiStore.getState().swapPanelPositions(sourcePosition, targetPosition);
	return { success: true, message: `已交换 ${sourcePosition} 和 ${targetPosition} 的位置` };
};

registerHandler("TODO_CARD->CALENDAR_DATE", handleTodoToCalendarDate);
registerHandler(
	"TODO_CARD->CALENDAR_TIMELINE_SLOT",
	handleTodoToCalendarTimelineSlot,
);
registerHandler("TODO_CARD->TODO_LIST", handleTodoToTodoList);
registerHandler("TODO_CARD->TODO_CARD_SLOT", handleTodoToTodoCardSlot);
registerHandler("TODO_CARD->TODO_DROP_ZONE", handleTodoToTodoDropZone);
registerHandler("PANEL_HEADER->PANEL_HEADER", handlePanelHeaderToPanelHeader);

export function dispatchDragDrop(
	dragData: DragData | undefined,
	dropData: DropData | undefined,
): DragDropResult {
	if (!dragData || !dropData) {
		return { success: false, message: "Missing drag or drop data" };
	}

	const key = `${dragData.type}->${dropData.type}` as HandlerKey;
	const handler = getHandler(key);

	if (!handler) {
		console.warn(`[DnD] No handler registered for: ${key}`);
		return { success: false, message: `No handler for ${key}` };
	}

	try {
		const result = handler(dragData, dropData);
		if (result.success) {
			console.log(`[DnD] ${key}: ${result.message || "Success"}`);
		} else {
			console.warn(`[DnD] ${key} failed: ${result.message}`);
		}
		return result;
	} catch (error) {
		console.error(`[DnD] Handler error for ${key}:`, error);
		return { success: false, message: String(error) };
	}
}
