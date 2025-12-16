/**
 * 拖拽处理器 - 策略模式分发
 * Drag Drop Handlers - Strategy Pattern Dispatch
 */

import { useTodoStore } from "@/lib/store/todo-store";
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

	// 获取 store 的 updateTodo 方法
	const { updateTodo } = useTodoStore.getState();

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

	updateTodo(todo.id, { deadline: newDeadline.toISOString() });

	return {
		success: true,
		message: `已将 "${todo.name}" 设置到 ${dropData.metadata.dateKey}`,
	};
};

/**
 * TODO_CARD -> TODO_LIST
 * 待办在列表内重新排序
 * 注意：内部排序由 TodoList 组件通过 useDndMonitor 处理
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
		const { updateTodo } = useTodoStore.getState();
		updateTodo(todo.id, { parentTodoId });
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

// ============================================================================
// 注册内置处理器
// ============================================================================

registerHandler("TODO_CARD->CALENDAR_DATE", handleTodoToCalendarDate);
registerHandler("TODO_CARD->TODO_LIST", handleTodoToTodoList);
registerHandler("TODO_CARD->TODO_CARD_SLOT", handleTodoToTodoCardSlot);

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
