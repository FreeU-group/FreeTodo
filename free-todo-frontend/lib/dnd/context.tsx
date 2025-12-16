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
			setActiveDrag({
				id: String(event.active.id),
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

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={customCollisionDetection}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
			onDragCancel={handleDragCancel}
		>
			<GlobalDndContext.Provider value={contextValue}>
				{children}
			</GlobalDndContext.Provider>
			<GlobalDragOverlay activeDrag={activeDrag} />
		</DndContext>
	);
}

// ============================================================================
// 导出
// ============================================================================

export { GlobalDndContext };
