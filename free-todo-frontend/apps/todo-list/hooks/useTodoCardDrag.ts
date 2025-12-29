import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { useMemo } from "react";
import type { DragData } from "@/lib/dnd";
import { useGlobalDndSafe } from "@/lib/dnd";
import { useTodos } from "@/lib/query";
import type { Todo } from "@/lib/types";

interface UseTodoCardDragParams {
	todo: Todo;
	depth: number;
	isOverlay: boolean;
}

export function useTodoCardDrag({
	todo,
	depth,
	isOverlay,
}: UseTodoCardDragParams) {
	const { data: todos = [] } = useTodos();

	// 构建类型化的拖拽数据
	const dragData: DragData = useMemo(
		() => ({
			type: "TODO_CARD" as const,
			payload: {
				todo,
				depth,
				sourcePanel: "todoList",
			},
		}),
		[todo, depth],
	);

	const sortable = useSortable({
		id: todo.id,
		disabled: isOverlay,
		data: dragData,
	});

	const attributes = isOverlay ? {} : sortable.attributes;
	const listeners = isOverlay ? {} : sortable.listeners;
	const setNodeRef = sortable.setNodeRef;
	const transform = sortable.transform;
	const transition = sortable.transition;
	const isSortableDragging = sortable.isDragging;

	// 放置区域：用于将其他 todo 设为此 todo 的子任务
	const nestDroppable = useDroppable({
		id: `${todo.id}-nest`,
		disabled: isOverlay,
		data: {
			type: "TODO_DROP_ZONE",
			metadata: {
				todoId: todo.id,
				position: "nest",
			},
		},
	});

	// 获取全局拖拽状态
	const dndContext = useGlobalDndSafe();
	const isOtherDragging =
		dndContext?.activeDrag !== null &&
		dndContext?.activeDrag?.id !== todo.id &&
		dndContext?.activeDrag?.data?.type === "TODO_CARD";

	// 检查当前拖拽的 todo 是否是此 todo 的子孙（防止循环引用）
	const isDescendantDragging = useMemo(() => {
		if (!dndContext?.activeDrag?.data) return false;
		const draggedData = dndContext.activeDrag.data;
		if (draggedData.type !== "TODO_CARD") return false;
		const draggedTodo = draggedData.payload.todo;

		// 检查当前 todo 是否是被拖拽 todo 的子孙
		const checkIsDescendant = (
			potentialParentId: number,
			potentialChildId: number,
		): boolean => {
			let current = todos.find((t: Todo) => t.id === potentialChildId);
			while (current?.parentTodoId) {
				if (current.parentTodoId === potentialParentId) return true;
				current = todos.find((t: Todo) => t.id === current?.parentTodoId);
			}
			return false;
		};

		return checkIsDescendant(draggedTodo.id, todo.id);
	}, [dndContext?.activeDrag, todos, todo.id]);

	// 是否显示放置区域
	const showNestDropZone =
		isOtherDragging && !isDescendantDragging && !isSortableDragging;

	return {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isSortableDragging,
		nestDroppable,
		showNestDropZone,
	};
}
