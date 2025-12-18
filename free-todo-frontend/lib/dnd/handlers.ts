/**
 * 拖拽处理器 - 策略模式分发
 * Drag Drop Handlers - Strategy Pattern Dispatch
 */

import { flushSync } from "react-dom";
import { updateTodoApiTodosTodoIdPut } from "@/lib/generated/todos/todos";
import { getQueryClient, queryKeys } from "@/lib/query";
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
 * 将待办拖到日历日期上，设置 deadline
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

	// 保留原有时间部分，只更新日期
	const existingDeadline = todo.deadline ? new Date(todo.deadline) : null;
	const newDeadline = new Date(date);

	if (existingDeadline) {
		// 保留原有的时分秒
		newDeadline.setHours(
			existingDeadline.getHours(),
			existingDeadline.getMinutes(),
			existingDeadline.getSeconds(),
		);
	} else {
		// 默认设置为上午9点
		newDeadline.setHours(9, 0, 0, 0);
	}

	const newDeadlineStr = newDeadline.toISOString();
	const queryClient = getQueryClient();

	// 取消正在进行的 todos 查询，避免竞态条件
	void queryClient.cancelQueries({ queryKey: queryKeys.todos.all });

	// 保存旧数据用于回滚
	const previousTodos = queryClient.getQueryData(queryKeys.todos.list());

	// 乐观更新：使用 flushSync 强制同步渲染，确保在 onDragEnd 返回前 UI 已更新
	// 这样可以避免 "先弹回再闪现" 的视觉 Bug
	flushSync(() => {
		queryClient.setQueryData<Array<{ id: string; deadline?: string }>>(
			queryKeys.todos.list(),
			(oldData) => {
				if (!oldData) return oldData;
				return oldData.map((t) =>
					t.id === todo.id ? { ...t, deadline: newDeadlineStr } : t,
				);
			},
		);
	});

	// 异步调用 API
	const todoId = Number.parseInt(todo.id, 10);
	void updateTodoApiTodosTodoIdPut(todoId, { deadline: newDeadlineStr })
		.then(() => {
			// API 成功后刷新缓存以确保数据一致性
			void queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
		})
		.catch((error) => {
			// API 失败时回滚到之前的数据
			console.error("[DnD] Failed to update deadline:", error);
			if (previousTodos) {
				queryClient.setQueryData(queryKeys.todos.list(), previousTodos);
			}
			void queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
		});

	return {
		success: true,
		message: `已将 "${todo.name}" 设置到 ${dropData.metadata.dateKey}`,
	};
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
		queryClient.setQueryData<
			Array<{ id: string; parentTodoId?: string | null }>
		>(queryKeys.todos.list(), (oldData) => {
			if (!oldData) return oldData;
			return oldData.map((t) =>
				t.id === todo.id ? { ...t, parentTodoId: parentTodoId || null } : t,
			);
		});

		const todoId = Number.parseInt(todo.id, 10);
		const parentId = parentTodoId ? Number.parseInt(parentTodoId, 10) : null;
		void updateTodoApiTodosTodoIdPut(todoId, { parent_todo_id: parentId })
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

// ============================================================================
// 注册内置处理器
// ============================================================================

registerHandler("TODO_CARD->CALENDAR_DATE", handleTodoToCalendarDate);
registerHandler("TODO_CARD->TODO_LIST", handleTodoToTodoList);
registerHandler("TODO_CARD->TODO_CARD_SLOT", handleTodoToTodoCardSlot);
registerHandler("TODO_CARD->TODO_DROP_ZONE", handleTodoToTodoDropZone);

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
