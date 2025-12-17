"use client";

/**
 * Todo 列表主组件
 * 使用全局 DndContext，通过 useDndMonitor 监听拖拽事件处理内部排序
 */

import { type DragEndEvent, useDndMonitor } from "@dnd-kit/core";
import type React from "react";
import { useCallback, useState } from "react";
import type { DragData } from "@/lib/dnd";
import { useTodoMutations, useTodos } from "@/lib/query";
import { useTodoStore } from "@/lib/store/todo-store";
import type { CreateTodoInput } from "@/lib/types/todo";
import { useOrderedTodos } from "./hooks/useOrderedTodos";
import { NewTodoInlineForm } from "./NewTodoInlineForm";
import { TodoToolbar } from "./TodoToolbar";
import { TodoTreeList } from "./TodoTreeList";

export function TodoList() {
	// 从 TanStack Query 获取 todos 数据
	const { data: todos = [], isLoading, error } = useTodos();

	// 从 TanStack Query 获取 mutation 操作
	const { createTodo } = useTodoMutations();

	// 从 Zustand 获取 UI 状态
	const {
		selectedTodoIds,
		setSelectedTodoId,
		toggleTodoSelection,
		collapsedTodoIds,
	} = useTodoStore();

	const [searchQuery, setSearchQuery] = useState("");
	const [newTodoName, setNewTodoName] = useState("");

	const { filteredTodos, orderedTodos } = useOrderedTodos(
		todos,
		searchQuery,
		collapsedTodoIds,
	);

	// 处理内部排序 - 当 TODO_CARD 在列表内移动时
	// 注意：重排序操作需要更新后端，这里暂时只更新本地视图顺序
	const handleInternalReorder = useCallback(
		(event: DragEndEvent) => {
			const { active, over } = event;

			if (!over || active.id === over.id) return;

			// 检查是否是 TODO_CARD 类型的拖拽
			const dragData = active.data.current as DragData | undefined;
			if (dragData?.type !== "TODO_CARD") return;

			// 检查是否放在了另一个 TODO 上（内部排序）
			const overIdStr = String(over.id);
			const isInternalDrop = orderedTodos.some(
				({ todo }) => todo.id === overIdStr,
			);

			if (isInternalDrop) {
				// 注意：排序逻辑需要通过 mutation 更新后端
				// 目前暂时在此打印日志，后续可以添加 reorder mutation
				const oldIndex = orderedTodos.findIndex(
					({ todo }) => todo.id === active.id,
				);
				const newIndex = orderedTodos.findIndex(
					({ todo }) => todo.id === over.id,
				);

				if (oldIndex !== -1 && newIndex !== -1) {
					console.log("Reorder:", active.id, "from", oldIndex, "to", newIndex);
					// TODO: 实现 reorder mutation
				}
			}
		},
		[orderedTodos],
	);

	// 使用 useDndMonitor 监听全局拖拽事件
	useDndMonitor({
		onDragEnd: handleInternalReorder,
	});

	const handleSelect = (
		todoId: string,
		event: React.MouseEvent<HTMLDivElement>,
	) => {
		const isMulti = event.metaKey || event.ctrlKey;
		if (isMulti) {
			toggleTodoSelection(todoId);
		} else {
			setSelectedTodoId(todoId);
		}
	};

	const handleCreateTodo = async (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		if (!newTodoName.trim()) return;

		const input: CreateTodoInput = {
			name: newTodoName.trim(),
		};

		try {
			await createTodo(input);
			setNewTodoName("");
		} catch (err) {
			console.error("Failed to create todo:", err);
		}
	};

	// 加载状态
	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
			</div>
		);
	}

	// 错误状态
	if (error) {
		return (
			<div className="flex h-full items-center justify-center text-destructive">
				加载失败: {error.message}
			</div>
		);
	}

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-background dark:bg-background">
			<TodoToolbar searchQuery={searchQuery} onSearch={setSearchQuery} />

			<div className="flex-1 overflow-y-auto">
				<div className="px-6 py-4 pb-4">
					<NewTodoInlineForm
						value={newTodoName}
						onChange={setNewTodoName}
						onSubmit={handleCreateTodo}
						onCancel={() => setNewTodoName("")}
					/>
				</div>

				{filteredTodos.length === 0 ? (
					<div className="flex h-[200px] items-center justify-center px-4 text-sm text-muted-foreground">
						暂无待办事项
					</div>
				) : (
					<TodoTreeList
						orderedTodos={orderedTodos}
						selectedTodoIds={selectedTodoIds}
						onSelect={handleSelect}
						onSelectSingle={(id) => setSelectedTodoId(id)}
					/>
				)}
			</div>
		</div>
	);
}
