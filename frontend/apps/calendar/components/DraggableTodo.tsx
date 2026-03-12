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
import { formatTimeLabel } from "../utils";

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
				onClick={(event) => {
					event.stopPropagation();
					onSelect(calendarTodo.todo);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						e.stopPropagation();
						onSelect(calendarTodo.todo);
					}
				}}
				role="button"
				tabIndex={0}
				className={cn(
					"group relative rounded-md px-2 py-1 text-xs transition-all duration-200 ease-out",
					"cursor-grab active:cursor-grabbing",
					"hover:-translate-y-[1px] hover:ring-1 hover:ring-primary/20 hover:shadow-[0_8px_18px_-12px_oklch(var(--primary)/0.45)]",
					"active:translate-y-0 active:scale-[0.98]",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
					getStatusStyle(calendarTodo.todo.status),
				)}
			>
				<div className="flex items-center justify-between gap-2">
					<p className="truncate text-[12px] font-medium leading-tight transition-colors group-hover:text-foreground">
						{calendarTodo.todo.name}
					</p>
					<span className="shrink-0 text-[10px] text-muted-foreground">
						{formatTimeLabel(calendarTodo.startTime, "--:--")}
					</span>
				</div>
			</div>
		</TodoContextMenu>
	);
}
