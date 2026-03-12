/**
 * 拖拽处理器 - 策略模式分发
 * Drag Drop Handlers - Strategy Pattern Dispatch
 */

import { flushSync } from "react-dom";
import type { TodoListResponse, TodoResponse } from "@/lib/generated/schemas";
import { updateTodoApiTodosTodoIdPut } from "@/lib/generated/todos/todos";
import { getQueryClient, queryKeys } from "@/lib/query";
import { useUiStore } from "@/lib/store/ui-store";
import type {
	DragData,
	DragDropHandler,
	DragDropResult,
	DropData,
	HandlerKey,
} from "./types";

// ============================================================================
// 处理器注册表 (Handler Registry)
// ============================================================================

/**
 * 策略模式处理器映射表
 * 键格式: "SOURCE_TYPE->TARGET_TYPE"
 */
const handlerRegistry: Partial<Record<HandlerKey, DragDropHandler>> = {};

// Normalize date strings that may lack timezone info.
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

/**
 * 注册拖拽处理器
 */
export function registerHandler(key: HandlerKey, handler: DragDropHandler) {
	handlerRegistry[key] = handler;
}

/**
 * 获取处理器
 */
export function getHandler(key: HandlerKey): DragDropHandler | undefined {
	return handlerRegistry[key];
}

// ============================================================================
// 内置处理器 (Built-in Handlers)
// ============================================================================

/**
 * TODO_CARD -> CALENDAR_DATE
 * 将待办拖到日历日期上，设置 startTime/endTime
 * 使用乐观更新：先更新前端缓存，再调用 API
 */
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

	// 取消正在进行的 todos 查询，避免竞态条件
	void queryClient.cancelQueries({ queryKey: queryKeys.todos.all });

	// 保存旧数据用于回滚
	const previousTodos = queryClient.getQueryData(queryKeys.todos.list());

	// 乐观更新：使用 flushSync 强制同步渲染，确保在 onDragEnd 返回前 UI 已更新
	// 这样可以避免 "先弹回再闪现" 的视觉 Bug
	flushSync(() => {
		queryClient.setQueryData<TodoListResponse>(
			queryKeys.todos.list(),
			(oldData) => {
				if (!oldData) return oldData;

				// 处理原始 API 响应结构 { total, todos: TodoResponse[] }
				if (oldData && "todos" in oldData && Array.isArray(oldData.todos)) {
					const updatedTodos = oldData.todos.map((t: TodoResponse) => {
						if (t.id === todo.id) {
							const tRecord = t as unknown as Record<string, unknown>;
							const updated = {
								...t,
							} as Record<string, unknown>;
							if ("start_time" in tRecord) {
								updated.start_time = newStartStr ?? tRecord.start_time;
							}
							if ("startTime" in tRecord) {
								updated.startTime = newStartStr ?? tRecord.startTime;
							}
							if ("end_time" in tRecord) {
								updated.end_time = newEndStr ?? tRecord.end_time;
							}
							if ("endTime" in tRecord) {
								updated.endTime = newEndStr ?? tRecord.endTime;
							}
							return updated as unknown as TodoResponse;
						}
						return t;
					});
					return {
						...oldData,
						todos: updatedTodos,
					};
				}

				// 向后兼容：如果是数组格式（不应该发生，但为了安全）
				if (Array.isArray(oldData)) {
					return oldData.map((t) =>
						t.id === todo.id
							? {
									...t,
									startTime: newStartStr ?? t.startTime,
									endTime: newEndStr ?? t.endTime,
								}
							: t,
					) as unknown as TodoListResponse;
				}

				return oldData;
			},
		);
	});

	// 异步调用 API
	void updateTodoApiTodosTodoIdPut(todo.id, {
		...(newStartStr ? { start_time: newStartStr } : {}),
		...(newEndStr ? { end_time: newEndStr } : {}),
	})
		.then(() => {
			// API 成功后刷新缓存以确保数据一致性
			void getQueryClient().invalidateQueries({ queryKey: queryKeys.todos.all });
		})
		.catch((error) => {
			// API 失败时回滚到之前的数据
			console.error("[DnD] Failed to update schedule:", error);
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

/**
 * TODO_CARD -> CALENDAR_TIMELINE_SLOT
 * Move todo into timeline slot (deadline or start/end).
 */
const handleTodoToCalendarTimelineSlot: DragDropHandler = (
	dragData,
	dropData,
): DragDropResult => {
	if (
		dragData.type !== "TODO_CARD" ||
		dropData.type !== "CALENDAR_TIMELINE_SLOT"
	) {
		return { success: false, message: "Invalid drag/drop type combination" };
	}

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

	const getDurationMinutes = () => {
		if (existingStart && existingEnd) {
			const diff = (existingEnd.getTime() - existingStart.getTime()) / 60000;
			if (Number.isFinite(diff) && diff > 0) return diff;
		}
		return DEFAULT_DURATION_MINUTES;
	};

	const rawDuration = getDurationMinutes();
	const snappedDuration = Math.max(
		MINUTES_PER_SLOT,
		Math.round(rawDuration / MINUTES_PER_SLOT) * MINUTES_PER_SLOT,
	);

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
			if (previousTodos) {
				getQueryClient().setQueryData(queryKeys.todos.list(), previousTodos);
			}
			void getQueryClient().invalidateQueries({ queryKey: queryKeys.todos.all });
		});

	return { success: true };
};

/**
 * TODO_CARD -> TODO_LIST
 * 待办在列表内重新排序
 * 注意：内部排序由 TodoList 组件通过 useDndMonitor 处理
 * 使用乐观更新：先更新前端缓存，再调用 API
 */
const handleTodoToTodoList: DragDropHandler = (
	dragData,
	dropData,
): DragDropResult => {
	if (dragData.type !== "TODO_CARD" || dropData.type !== "TODO_LIST") {
		return { success: false, message: "Invalid drag/drop type combination" };
	}

	const { todo } = dragData.payload;
	const { parentTodoId } = dropData.metadata;

	// 如果指定了父级 ID，更新父子关系
	if (parentTodoId !== undefined) {
		const queryClient = getQueryClient();

		// 取消正在进行的 todos 查询
		void queryClient.cancelQueries({ queryKey: queryKeys.todos.all });

		// 保存旧数据用于回滚
		const previousTodos = queryClient.getQueryData(queryKeys.todos.list());

		// 乐观更新：立即更新前端缓存（使用与 useTodos 相同的 key）
		queryClient.setQueryData<TodoListResponse>(
			queryKeys.todos.list(),
			(oldData) => {
				if (!oldData) return oldData;

				// 处理原始 API 响应结构 { total, todos: TodoResponse[] }
				if (oldData && "todos" in oldData && Array.isArray(oldData.todos)) {
					const updatedTodos = oldData.todos.map((t: TodoResponse) => {
						if (t.id === todo.id) {
							return {
								...t,
								parent_todo_id: parentTodoId ?? null,
							};
						}
						return t;
					});
					return {
						...oldData,
						todos: updatedTodos,
					};
				}

				// 向后兼容：如果是数组格式（不应该发生，但为了安全）
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
				if (previousTodos) {
					queryClient.setQueryData(queryKeys.todos.list(), previousTodos);
				}
				void queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
			});
	}

	// 注意：列表内部排序由 TodoList 组件的 useDndMonitor 处理
	return { success: true };
};

/**
 * TODO_CARD -> TODO_CARD_SLOT
 * 待办拖到另一个待办的前面或后面
 */
const handleTodoToTodoCardSlot: DragDropHandler = (
	dragData,
	dropData,
): DragDropResult => {
	if (dragData.type !== "TODO_CARD" || dropData.type !== "TODO_CARD_SLOT") {
		return { success: false, message: "Invalid drag/drop type combination" };
	}

	// TODO: 实现插入逻辑
	return { success: true };
};

/**
 * TODO_CARD -> TODO_DROP_ZONE
 * 将待办设置为另一个待办的子任务
 * 注意：实际的父子关系设置由 TodoList 组件处理，这里主要做记录
 */
const handleTodoToTodoDropZone: DragDropHandler = (
	dragData,
	dropData,
): DragDropResult => {
	if (dragData.type !== "TODO_CARD" || dropData.type !== "TODO_DROP_ZONE") {
		return { success: false, message: "Invalid drag/drop type combination" };
	}

	const { todo } = dragData.payload;
	const { todoId, position } = dropData.metadata;

	if (position === "nest") {
		console.log(`[DnD] 设置 "${todo.name}" 为 todo ${todoId} 的子任务`);
		// 实际的 API 调用由 TodoList 组件的 handleInternalReorder 处理
		return {
			success: true,
			message: `已将 "${todo.name}" 设置为子任务`,
		};
	}

	return { success: false, message: "Unknown position" };
};

/**
 * PANEL_HEADER -> PANEL_HEADER
 * 交换两个面板的位置（功能分配）
 */
const handlePanelHeaderToPanelHeader: DragDropHandler = (
	dragData,
	dropData,
): DragDropResult => {
	if (dragData.type !== "PANEL_HEADER" || dropData.type !== "PANEL_HEADER") {
		return { success: false, message: "Invalid drag/drop type combination" };
	}

	const { position: sourcePosition } = dragData.payload;
	const { position: targetPosition } = dropData.metadata;

	// 如果源位置和目标位置相同，不需要交换
	if (sourcePosition === targetPosition) {
		return { success: false, message: "Cannot swap panel with itself" };
	}

	// 交换面板位置
	useUiStore.getState().swapPanelPositions(sourcePosition, targetPosition);

	return {
		success: true,
		message: `已交换 ${sourcePosition} 和 ${targetPosition} 的位置`,
	};
};

// ============================================================================
// 注册内置处理器
// ============================================================================

registerHandler("TODO_CARD->CALENDAR_DATE", handleTodoToCalendarDate);
registerHandler(
	"TODO_CARD->CALENDAR_TIMELINE_SLOT",
	handleTodoToCalendarTimelineSlot,
);
registerHandler("TODO_CARD->TODO_LIST", handleTodoToTodoList);
registerHandler("TODO_CARD->TODO_CARD_SLOT", handleTodoToTodoCardSlot);
registerHandler("TODO_CARD->TODO_DROP_ZONE", handleTodoToTodoDropZone);
registerHandler("PANEL_HEADER->PANEL_HEADER", handlePanelHeaderToPanelHeader);

// ============================================================================
// 分发函数 (Dispatch Function)
// ============================================================================

/**
 * 分发拖拽事件到对应的处理器
 */
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
