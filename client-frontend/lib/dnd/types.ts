/**
 * 跨面板拖拽系统类型定义
 * Cross-Panel Drag and Drop Type Definitions
 */

import type { UniqueIdentifier } from "@dnd-kit/core";
import type { Todo, TodoAttachment } from "@/lib/types";

// ============================================================================
// 拖拽源类型 (Drag Source Types)
// ============================================================================

/**
 * 可拖拽元素的类型，可扩展
 */
export type DragSourceType = "TODO_CARD" | "FILE" | "USER" | "PANEL_HEADER";

/**
 * 类型安全的拖拽数据 - 使用可辨识联合类型
 * Type-safe drag data using discriminated union
 */
export type DragData =
	| {
			type: "TODO_CARD";
			payload: {
				todo: Todo;
				depth?: number; // 用于侧边栏树形结构的缩进层级
				sourcePanel?: string; // 来源面板标识
			};
	  }
	| {
			type: "FILE";
			payload: {
				file: TodoAttachment;
				sourceTodoId?: number;
			};
	  }
	| {
			type: "USER";
			payload: {
				userId: string;
				userName: string;
			};
	  }
	| {
			type: "PANEL_HEADER";
			payload: {
				position: "panelA" | "panelB" | "panelC";
			};
	  };

// ============================================================================
// 放置目标类型 (Drop Target Types)
// ============================================================================

/**
 * 可放置区域的类型，可扩展
 */
export type DropTargetType =
	| "CALENDAR_DATE"
	| "CALENDAR_TIMELINE_SLOT"
	| "TODO_LIST"
	| "TODO_CARD_SLOT"
	| "TODO_DROP_ZONE"
	| "CHAT_WINDOW"
	| "PANEL_HEADER";

/**
 * 类型安全的放置区数据 - 使用可辨识联合类型
 * Type-safe drop data using discriminated union
 */
export type DropData =
	| {
			type: "CALENDAR_DATE";
			metadata: {
				dateKey: string; // 格式: YYYY-MM-DD
				date: Date;
			};
	  }
	| {
			type: "CALENDAR_TIMELINE_SLOT";
			metadata: {
				dateKey: string; // 格式: YYYY-MM-DD
				date: Date;
				minutes: number;
			};
	  }
	| {
			type: "TODO_LIST";
			metadata: {
				targetIndex?: number;
				parentTodoId?: number | null;
			};
	  }
	| {
			type: "TODO_CARD_SLOT";
			metadata: {
				todoId: number;
				position: "before" | "after";
			};
	  }
	| {
			type: "TODO_DROP_ZONE";
			metadata: {
				todoId: number;
				position: "nest"; // 设为子任务
			};
	  }
	| {
			type: "CHAT_WINDOW";
			metadata: {
				conversationId?: string;
			};
	  }
	| {
			type: "PANEL_HEADER";
			metadata: {
				position: "panelA" | "panelB" | "panelC";
			};
	  };

// ============================================================================
// 活动拖拽状态 (Active Drag State)
// ============================================================================

/**
 * 当前正在拖拽的元素状态
 * id 使用 dnd-kit 的 UniqueIdentifier 类型 (string | number)
 * 因为不同面板可能使用不同格式的 ID（如 calendar 使用 "calendar-{todoId}"）
 */
export interface ActiveDragState {
	id: UniqueIdentifier;
	data: DragData;
}

// ============================================================================
// 处理器相关类型 (Handler Types)
// ============================================================================

/**
 * 拖拽处理结果
 */
export interface DragDropResult {
	success: boolean;
	message?: string;
}

/**
 * 拖拽处理器的键类型
 * 格式: "SOURCE_TYPE->TARGET_TYPE"
 */
export type HandlerKey = `${DragSourceType}->${DropTargetType}`;

/**
 * 拖拽处理器函数签名
 */
export type DragDropHandler = (
	dragData: DragData,
	dropData: DropData,
) => DragDropResult;

// ============================================================================
// 上下文类型 (Context Types)
// ============================================================================

/**
 * 全局拖拽上下文值
 */
export interface GlobalDndContextValue {
	activeDrag: ActiveDragState | null;
}

// ============================================================================
// 类型守卫 (Type Guards)
// ============================================================================

/**
 * 检查是否为 TODO_CARD 类型的拖拽数据
 */
export function isTodoCardDragData(
	data: DragData,
): data is Extract<DragData, { type: "TODO_CARD" }> {
	return data.type === "TODO_CARD";
}

/**
 * 检查是否为 CALENDAR_DATE 类型的放置数据
 */
export function isCalendarDateDropData(
	data: DropData,
): data is Extract<DropData, { type: "CALENDAR_DATE" }> {
	return data.type === "CALENDAR_DATE";
}

/**
 * 检查是否为 TODO_LIST 类型的放置数据
 */
export function isTodoListDropData(
	data: DropData,
): data is Extract<DropData, { type: "TODO_LIST" }> {
	return data.type === "TODO_LIST";
}

/**
 * 检查是否为 TODO_DROP_ZONE 类型的放置数据
 */
export function isTodoDropZoneDropData(
	data: DropData,
): data is Extract<DropData, { type: "TODO_DROP_ZONE" }> {
	return data.type === "TODO_DROP_ZONE";
}
