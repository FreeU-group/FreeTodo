"use client";

/**
 * Todo 列表主组件
 * 使用全局 DndContext，通过 useDndMonitor 监听拖拽事件处理内部排序
 */

import { type DragEndEvent, useDndMonitor } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useTranslations } from "next-intl";
import type React from "react";
import { useCallback, useState } from "react";
import { MultiTodoContextMenu } from "@/components/common/context-menu/MultiTodoContextMenu";
import type { DragData } from "@/lib/dnd";
import { useTodoMutations, useTodos } from "@/lib/query";
import type { ReorderTodoItem } from "@/lib/query/todos";
import { useTodoStore } from "@/lib/store/todo-store";
import type { CreateTodoInput, Todo } from "@/lib/types";
import type { TodoFilterState } from "./components/TodoFilter";
import { useOrderedTodos } from "./hooks/useOrderedTodos";
import { NewTodoInlineForm } from "./NewTodoInlineForm";
import { TodoToolbar } from "./TodoToolbar";
import { TodoTreeList } from "./TodoTreeList";

export function TodoList() {
	const tTodoList = useTranslations("todoList");
	// 从 TanStack Query 获取 todos 数据
	const { data: todos = [], isLoading, error } = useTodos();

	// 从 TanStack Query 获取 mutation 操作
	const { createTodo, reorderTodos } = useTodoMutations();

	// 从 Zustand 获取 UI 状态
	const {
		selectedTodoIds,
		setSelectedTodoId,
		setSelectedTodoIds,
		toggleTodoSelection,
		collapsedTodoIds,
		anchorTodoId,
		setAnchorTodoId,
	} = useTodoStore();

	const [searchQuery, setSearchQuery] = useState("");
	const [newTodoName, setNewTodoName] = useState("");
	const [filter, setFilter] = useState<TodoFilterState>({
		status: "all",
		tag: "all",
		dueTime: "all",
	});

	const { filteredTodos, orderedTodos } = useOrderedTodos(
		todos,
		searchQuery,
		collapsedTodoIds,
		filter,
	);

	// 处理内部排序 - 当 TODO_CARD 在列表内移动时
	const handleInternalReorder = useCallback(
		async (event: DragEndEvent) => {
			const { active, over } = event;

			if (!over || active.id === over.id) return;

			// 检查是否是 TODO_CARD 类型的拖拽
			const dragData = active.data.current as DragData | undefined;
			if (dragData?.type !== "TODO_CARD") return;

			const activeId = Number(active.id);
			const overId = Number(over.id);

			// 获取拖拽的 todo
			const activeTodo = todos.find((t: Todo) => t.id === activeId);

			if (!activeTodo) return;

			// 检查放置数据类型
			const overData = over.data.current as
				| DragData
				| { type: string; metadata?: { position?: string; todoId?: number } }
				| undefined;

			// 情况1: 拖放到 todo 上设置父子关系（通过特殊放置区域）
			if (overData?.type === "TODO_DROP_ZONE") {
				const metadata = (
					overData as { metadata?: { position?: string; todoId?: number } }
				)?.metadata;
				const position = metadata?.position;
				// 从放置区域的 metadata 中获取目标 todo ID
				const targetTodoId = metadata?.todoId;

				if (position === "nest" && targetTodoId !== undefined) {
					// 设置为子任务
					// 防止将任务设置为自己的子任务或子孙的子任务
					const isDescendant = (
						parentId: number,
						childId: number,
						allTodos: Todo[],
					): boolean => {
						let current = allTodos.find((t) => t.id === childId);
						while (current?.parentTodoId) {
							if (current.parentTodoId === parentId) return true;
							current = allTodos.find((t) => t.id === current?.parentTodoId);
						}
						return false;
					};

					if (
						activeId !== targetTodoId &&
						!isDescendant(activeId, targetTodoId, todos)
					) {
						try {
							// 获取目标父任务下的子任务
							const siblings = todos.filter(
								(t: Todo) => t.parentTodoId === targetTodoId,
							);
							// 计算新的 order
							const maxOrder = Math.max(
								0,
								...siblings.map((t: Todo) => t.order ?? 0),
							);
							const newOrder = maxOrder + 1;

							await reorderTodos([
								{
									id: activeId,
									order: newOrder,
									parentTodoId: targetTodoId,
								},
							]);
						} catch (err) {
							console.error("Failed to set parent-child relationship:", err);
						}
					}
					return;
				}
			}

			// 情况2: 常规列表内排序
			const overTodo = todos.find((t: Todo) => t.id === overId);
			if (!overTodo) return;

			const isInternalDrop = orderedTodos.some(
				({ todo }) => todo.id === overId,
			);

			if (isInternalDrop) {
				const oldIndex = orderedTodos.findIndex(
					({ todo }) => todo.id === activeId,
				);
				const newIndex = orderedTodos.findIndex(
					({ todo }) => todo.id === overId,
				);

				if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
					// 检查是否是同级排序（同一个父级）
					const isSameLevel = activeTodo.parentTodoId === overTodo.parentTodoId;

					if (isSameLevel) {
						// 同级排序：更新同级 todos 的 order
						const parentId = activeTodo.parentTodoId;
						const siblings = todos.filter(
							(t: Todo) => t.parentTodoId === parentId,
						);

						// 找到在 orderedTodos 中的索引
						const siblingIds = siblings.map((t: Todo) => t.id);
						const oldSiblingIndex = siblingIds.indexOf(activeId);
						const newSiblingIndex = siblingIds.indexOf(overId);

						if (oldSiblingIndex !== -1 && newSiblingIndex !== -1) {
							// 重新排列数组
							const reorderedSiblings = arrayMove(
								siblings,
								oldSiblingIndex,
								newSiblingIndex,
							);

							// 构建更新请求
							const reorderItems: ReorderTodoItem[] = reorderedSiblings.map(
								(todo: Todo, index: number) => ({
									id: todo.id,
									order: index,
								}),
							);

							try {
								await reorderTodos(reorderItems);
							} catch (err) {
								console.error("Failed to reorder todos:", err);
							}
						}
					} else {
						// 跨级移动：将任务移动到目标位置附近，并更新父级关系
						const newParentId = overTodo.parentTodoId;
						const newSiblings = todos.filter(
							(t: Todo) => t.parentTodoId === newParentId && t.id !== activeId,
						);

						// 找到插入位置
						const overSiblingIndex = newSiblings.findIndex(
							(t: Todo) => t.id === overId,
						);
						const insertIndex =
							overSiblingIndex !== -1 ? overSiblingIndex : newSiblings.length;

						// 在目标位置插入
						const reorderedSiblings = [...newSiblings];
						reorderedSiblings.splice(insertIndex, 0, activeTodo);

						// 构建更新请求
						const reorderItems: ReorderTodoItem[] = reorderedSiblings.map(
							(todo: Todo, index: number) => ({
								id: todo.id,
								order: index,
								...(todo.id === activeId ? { parentTodoId: newParentId } : {}),
							}),
						);

						try {
							await reorderTodos(reorderItems);
						} catch (err) {
							console.error("Failed to move todo:", err);
						}
					}
				}
			}
		},
		[orderedTodos, todos, reorderTodos],
	);

	// 使用 useDndMonitor 监听全局拖拽事件
	useDndMonitor({
		onDragEnd: handleInternalReorder,
	});

	const handleSelect = (
		todoId: number,
		event: React.MouseEvent<HTMLDivElement>,
	) => {
		const isShift = event.shiftKey;
		const isMulti = event.metaKey || event.ctrlKey;

		// Shift 键范围选择
		if (isShift && !isMulti) {
			// 如果有锚点，进行范围选择
			if (anchorTodoId !== null) {
				// 找到锚点和当前点击的 todo 在 orderedTodos 中的索引
				const anchorIndex = orderedTodos.findIndex(
					({ todo }) => todo.id === anchorTodoId,
				);
				const currentIndex = orderedTodos.findIndex(
					({ todo }) => todo.id === todoId,
				);

				// 如果两个索引都有效
				if (anchorIndex !== -1 && currentIndex !== -1) {
					// 确定范围（从较小的索引到较大的索引）
					const startIndex = Math.min(anchorIndex, currentIndex);
					const endIndex = Math.max(anchorIndex, currentIndex);

					// 选择范围内的所有 todo
					const rangeTodoIds = orderedTodos
						.slice(startIndex, endIndex + 1)
						.map(({ todo }) => todo.id);

					setSelectedTodoIds(rangeTodoIds);
					return;
				}
			}

			// 如果没有锚点或找不到索引，只选择当前 todo 并设置为锚点
			setSelectedTodoId(todoId);
			setAnchorTodoId(todoId);
			return;
		}

		// Ctrl/Cmd 键多选
		if (isMulti && !isShift) {
			toggleTodoSelection(todoId);
			// 多选时不改变锚点，保持上一次单独点击的锚点
			return;
		}

		// 普通单击：只选择当前 todo
		setSelectedTodoId(todoId);
		setAnchorTodoId(todoId);
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
		const errorMessage =
			error instanceof Error ? error.message : String(error) || "Unknown error";
		return (
			<div className="flex h-full items-center justify-center text-destructive">
				{tTodoList("loadFailed", { error: errorMessage })}
			</div>
		);
	}

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-background dark:bg-background">
			<TodoToolbar
				searchQuery={searchQuery}
				onSearch={setSearchQuery}
				todos={todos}
				filter={filter}
				onFilterChange={setFilter}
			/>

			<MultiTodoContextMenu selectedTodoIds={selectedTodoIds}>
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
							{tTodoList("noTodos")}
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
			</MultiTodoContextMenu>
		</div>
	);
}
