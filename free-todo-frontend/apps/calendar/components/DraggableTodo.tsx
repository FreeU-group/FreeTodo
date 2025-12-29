/**
 * 日历内的可拖拽 Todo 卡片
 * 使用 useDraggable 并传递类型化的 DragData
 */

import { useDraggable } from "@dnd-kit/core";
import { useMemo } from "react";
import { TodoContextMenu } from "@/components/common/context-menu/TodoContextMenu";
import { type DragData, usePendingUpdate } from "@/lib/dnd";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { CalendarTodo } from "../types";
import { getStatusStyle } from "../types";

export function DraggableTodo({
	calendarTodo,
	onSelect,
}: {
	calendarTodo: CalendarTodo;
	onSelect: (todo: Todo) => void;
}) {
	// 获取正在进行乐观更新的 todo ID
	const pendingTodoId = usePendingUpdate();
	// 检查当前 todo 是否正在进行乐观更新
	const isPendingUpdate = pendingTodoId === calendarTodo.todo.id;

	// 构建类型化的拖拽数据
	const dragData: DragData = useMemo(
		() => ({
			type: "TODO_CARD" as const,
			payload: {
				todo: calendarTodo.todo,
				sourcePanel: "calendar",
			},
		}),
		[calendarTodo.todo],
	);

	// 使用带前缀的 id，避免与 TodoList 中的同一 todo 产生 id 冲突
	// 这样当在 TodoList 中拖动时，Calendar 中的对应 todo 不会跟着移动
	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: `calendar-${calendarTodo.todo.id}`,
		data: dragData,
	});

	// 拖拽时或乐观更新期间，隐藏原始元素避免"弹回"效果
	// DragOverlay 会显示拖拽预览
	if (isDragging || isPendingUpdate) {
		return (
			<div
				ref={setNodeRef}
				className="opacity-0 pointer-events-none"
				aria-hidden="true"
			>
				<p className="truncate text-[12px] font-medium leading-tight">
					{calendarTodo.todo.name}
				</p>
			</div>
		);
	}

	return (
		<TodoContextMenu todoId={calendarTodo.todo.id}>
			<div
				ref={setNodeRef}
				{...attributes}
				{...listeners}
				onClick={() => onSelect(calendarTodo.todo)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onSelect(calendarTodo.todo);
					}
				}}
				role="button"
				tabIndex={0}
				className={cn(
					"group relative rounded px-1.5 py-1 text-xs transition-all truncate",
					getStatusStyle(calendarTodo.todo.status),
				)}
			>
				<p className="truncate text-[12px] font-medium leading-tight">
					{calendarTodo.todo.name}
				</p>
			</div>
		</TodoContextMenu>
	);
}
