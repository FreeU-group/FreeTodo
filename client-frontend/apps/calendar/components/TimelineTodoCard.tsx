/**
 * Draggable timeline todo card.
 */

import { useDraggable } from "@dnd-kit/core";
import type React from "react";
import { useMemo } from "react";
import { TodoContextMenu } from "@/components/common/context-menu/TodoContextMenu";
import { type DragData, usePendingUpdate } from "@/lib/dnd";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getStatusStyle } from "../types";

export function TimelineTodoCard({
	todo,
	top,
	height,
	timeLabel,
	variant,
	onSelect,
	onResizeStart,
	onResizeEnd,
}: {
	todo: Todo;
	top: number;
	height: number;
	timeLabel: string;
	variant: "deadline" | "range";
	onSelect: (todo: Todo) => void;
	onResizeStart?: (event: React.PointerEvent<HTMLButtonElement>) => void;
	onResizeEnd?: (event: React.PointerEvent<HTMLButtonElement>) => void;
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
		id: `calendar-${todo.id}`,
		data: dragData,
	});

	if (isDragging || isPendingUpdate) {
		return (
			<div
				ref={setNodeRef}
				className="absolute left-2 right-2 opacity-0 pointer-events-none"
				style={{ top, height }}
				aria-hidden="true"
			/>
		);
	}

	return (
		<TodoContextMenu todoId={todo.id}>
			<div
				ref={setNodeRef}
				{...attributes}
				{...listeners}
				onClick={(event) => {
					event.stopPropagation();
					onSelect(todo);
				}}
				onKeyDown={(event) => {
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						event.stopPropagation();
						onSelect(todo);
					}
				}}
				role="button"
				tabIndex={0}
				data-timeline-item
				className={cn(
					"group absolute left-2 right-2 flex flex-col gap-1 rounded-lg border px-2 py-1 text-xs shadow-sm transition-all duration-200 ease-out",
					"cursor-grab active:cursor-grabbing",
					"hover:-translate-y-[1px] hover:ring-1 hover:ring-primary/20 hover:shadow-[0_10px_22px_-16px_oklch(var(--primary)/0.45)]",
					"active:translate-y-0 active:scale-[0.99]",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
					getStatusStyle(todo.status),
				)}
				style={{ top, height }}
			>
				{variant === "range" && (onResizeStart || onResizeEnd) && (
					<div className="absolute inset-x-0 -top-1 flex justify-center">
						<button
							type="button"
							onPointerDown={(event) => {
								event.stopPropagation();
								onResizeStart?.(event);
							}}
							className={cn(
								"h-2 w-10 rounded-full bg-foreground/40 opacity-0 transition-opacity group-hover:opacity-100",
								"focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
							)}
							aria-label="Resize start"
						/>
					</div>
				)}
				<div className="flex flex-col gap-0.5">
					<p className="truncate text-[12px] font-semibold">{todo.name}</p>
					<span className="text-[11px] text-muted-foreground">
						{timeLabel}
					</span>
				</div>
				{todo.tags && todo.tags.length > 0 && (
					<div className="flex flex-wrap gap-1">
						{todo.tags.slice(0, 2).map((tag) => (
							<span
								key={tag}
								className="rounded-full bg-white/50 px-2 py-0.5 text-[10px] text-muted-foreground"
							>
								{tag}
							</span>
						))}
						{todo.tags.length > 2 && (
							<span className="text-[10px] text-muted-foreground">
								+{todo.tags.length - 2}
							</span>
						)}
					</div>
				)}
				{variant === "range" && (onResizeStart || onResizeEnd) && (
					<div className="absolute inset-x-0 -bottom-1 flex justify-center">
						<button
							type="button"
							onPointerDown={(event) => {
								event.stopPropagation();
								onResizeEnd?.(event);
							}}
							className={cn(
								"h-2 w-10 rounded-full bg-foreground/40 opacity-0 transition-opacity group-hover:opacity-100",
								"focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
							)}
							aria-label="Resize end"
						/>
					</div>
				)}
			</div>
		</TodoContextMenu>
	);
}
