/**
 * Floating (unscheduled) todo card.
 */

import { useDraggable } from "@dnd-kit/core";
import { useMemo } from "react";
import { TodoContextMenu } from "@/components/common/context-menu/TodoContextMenu";
import { type DragData, usePendingUpdate } from "@/lib/dnd";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getStatusStyle } from "../types";

export function FloatingTodoCard({
	todo,
	onSelect,
}: {
	todo: Todo;
	onSelect: (todo: Todo) => void;
}) {
	const pendingTodoId = usePendingUpdate();
	const isPendingUpdate = pendingTodoId === todo.id;

	const dragData: DragData = useMemo(
		() => ({
			type: "TODO_CARD" as const,
			payload: {
				todo,
				sourcePanel: "calendar",
			},
		}),
		[todo],
	);

	const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
		id: `calendar-floating-${todo.id}`,
		data: dragData,
	});

	if (isDragging || isPendingUpdate) {
		return (
			<div ref={setNodeRef} className="opacity-0 pointer-events-none" />
		);
	}

	return (
		<TodoContextMenu todoId={todo.id}>
			<button
				ref={setNodeRef}
				type="button"
				{...attributes}
				{...listeners}
				onClick={(event) => {
					event.stopPropagation();
					onSelect(todo);
				}}
				className={cn(
					"rounded-lg border border-border/70 px-3 py-2 text-xs font-medium shadow-sm transition",
					"cursor-grab active:cursor-grabbing",
					"hover:-translate-y-[1px] hover:ring-1 hover:ring-primary/20",
					getStatusStyle(todo.status),
				)}
				data-all-day-card
			>
				{todo.name}
			</button>
		</TodoContextMenu>
	);
}
