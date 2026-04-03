"use client";

/**
 * Todo 树形列表组件
 * 使用 SortableContext 实现列表内排序
 * DndContext 由全局 GlobalDndProvider 提供
 */

import {
	SortableContext,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type React from "react";
import { useGlobalDndSafe } from "@/lib/dnd";
import type { OrderedTodo } from "./hooks/useOrderedTodos";
import { TodoCard } from "./TodoCard";

interface TodoTreeListProps {
	orderedTodos: OrderedTodo[];
	selectedTodoIds: number[];
	onSelect: (todoId: number, event: React.MouseEvent<HTMLDivElement>) => void;
	onSelectSingle: (todoId: number) => void;
}

export function TodoTreeList({
	orderedTodos,
	selectedTodoIds,
	onSelect,
	onSelectSingle,
}: TodoTreeListProps) {
	// 从全局上下文获取活动拖拽状态
	const dndContext = useGlobalDndSafe();
	const activeId = dndContext?.activeDrag?.id ?? null;

	return (
		<SortableContext
			items={orderedTodos.map(({ todo }) => todo.id)}
			strategy={verticalListSortingStrategy}
		>
			<div className="px-4 pb-6 flex flex-col gap-0">
				{orderedTodos.map(({ todo, depth }) => (
					<div
						key={todo.id}
						style={{ marginLeft: depth * 16 }}
						className={depth > 0 ? "relative" : undefined}
					>
						<TodoCard
							todo={todo}
							depth={depth}
							isDragging={activeId === todo.id}
							selected={selectedTodoIds.includes(todo.id)}
							hasMultipleSelection={selectedTodoIds.length > 1}
							onSelect={(event) => onSelect(todo.id, event)}
							onSelectSingle={() => onSelectSingle(todo.id)}
						/>
					</div>
				))}
			</div>
		</SortableContext>
	);
}
