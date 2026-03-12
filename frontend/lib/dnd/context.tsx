"use client";

/**
 * 全局拖拽上下文提供者
 * Global Drag and Drop Context Provider
 */

import {
	type CollisionDetection,
	closestCenter,
	DndContext,
	type DragCancelEvent,
	type DragEndEvent,
	type DragStartEvent,
	PointerSensor,
	pointerWithin,
	rectIntersection,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { createContext, useCallback, useContext, useState } from "react";
import { dispatchDragDrop } from "./handlers";
import { GlobalDragOverlay } from "./overlays";
import type {
	ActiveDragState,
	DragData,
	DropData,
	GlobalDndContextValue,
} from "./types";

// ============================================================================
// Context 创建
// ============================================================================

// 用于跟踪正在进行乐观更新的 todo，确保在数据同步前卡片保持隐藏
export const PendingUpdateContext = createContext<{
	pendingTodoId: number | null;
	setPendingTodoId: (id: number | null) => void;
} | null>(null);

const GlobalDndContext = createContext<GlobalDndContextValue | null>(null);

/**
 * 使用全局拖拽上下文
 */
export function useGlobalDnd(): GlobalDndContextValue {
	const context = useContext(GlobalDndContext);
	if (!context) {
		throw new Error("useGlobalDnd must be used within GlobalDndProvider");
	}
	return context;
}

/**
 * 安全获取全局拖拽上下文（可能为 null）
 */
export function useGlobalDndSafe(): GlobalDndContextValue | null {
	return useContext(GlobalDndContext);
}

/**
 * 获取正在进行乐观更新的 todo ID
 * 用于在数据同步完成前保持被拖拽的卡片隐藏
 */
export function usePendingUpdate() {
	const context = useContext(PendingUpdateContext);
	return context?.pendingTodoId ?? null;
}

// ============================================================================
// 自定义碰撞检测
// ============================================================================

/**
 * 自定义碰撞检测策略
 * 优先使用 pointerWithin，然后 rectIntersection，最后 closestCenter
 */
const customCollisionDetection: CollisionDetection = (args) => {
	// 首先尝试 pointerWithin（指针在目标内部）
	const pointerCollisions = pointerWithin(args);
	if (pointerCollisions.length > 0) {
		return pointerCollisions;
	}

	// 然后尝试 rectIntersection（矩形相交）
	const rectCollisions = rectIntersection(args);
	if (rectCollisions.length > 0) {
		return rectCollisions;
	}

	// 最后使用 closestCenter（最近中心点）
	return closestCenter(args);
};

// ============================================================================
// Provider 组件
// ============================================================================

interface GlobalDndProviderProps {
	children: React.ReactNode;
}

export function GlobalDndProvider({ children }: GlobalDndProviderProps) {
	const [activeDrag, setActiveDrag] = useState<ActiveDragState | null>(null);
	// 跟踪正在进行乐观更新的 todo ID，用于在数据同步完成前保持卡片隐藏
	const [pendingTodoId, setPendingTodoId] = useState<number | null>(null);

	// 配置传感器
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8, // 需要移动 8px 才触发拖拽，避免误触
			},
		}),
	);

	// 拖拽开始
	const handleDragStart = useCallback((event: DragStartEvent) => {
		const data = event.active.data.current as DragData | undefined;

		if (data) {
			// 保持原始 ID 类型，不做转换
			// Calendar 使用 "calendar-{id}" 格式，TodoList 使用数字 ID
			setActiveDrag({
				id: event.active.id,
				data,
			});
			console.log("[DnD] Drag started:", data.type, event.active.id);
		}
	}, []);

	// 拖拽结束
	const handleDragEnd = useCallback((event: DragEndEvent) => {
		const { active, over } = event;

		if (over) {
			const dragData = active.data.current as DragData | undefined;
			const dropData = over.data.current as DropData | undefined;

			console.log("[DnD] Drag ended:", {
				activeId: active.id,
				overId: over.id,
				dragType: dragData?.type,
				dropType: dropData?.type,
			});

			// 提取被拖拽的 todo ID，用于乐观更新期间保持卡片隐藏
			if (dragData?.type === "TODO_CARD") {
				const todoId = dragData.payload.todo.id;
				setPendingTodoId(todoId);
				// 在短暂延迟后清除 pending 状态，让 React Query 有时间传播更新
				setTimeout(() => {
					setPendingTodoId(null);
				}, 150);
			}

			// 分发到对应的处理器
			dispatchDragDrop(dragData, dropData);
		}

		setActiveDrag(null);
	}, []);

	// 拖拽取消
	const handleDragCancel = useCallback((event: DragCancelEvent) => {
		console.log("[DnD] Drag cancelled:", event.active.id);
		setActiveDrag(null);
	}, []);

	const contextValue: GlobalDndContextValue = {
		activeDrag,
	};

	const pendingUpdateValue = {
		pendingTodoId,
		setPendingTodoId,
	};

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={customCollisionDetection}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<PendingUpdateContext.Provider value={pendingUpdateValue}>
				<GlobalDndContext.Provider value={contextValue}>
					{children}
				</GlobalDndContext.Provider>
			</PendingUpdateContext.Provider>
			<GlobalDragOverlay activeDrag={activeDrag} />
		</DndContext>
	);
}

// ============================================================================
// 导出
// ============================================================================

export { GlobalDndContext };
