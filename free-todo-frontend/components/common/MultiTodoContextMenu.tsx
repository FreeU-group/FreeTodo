"use client";

import { Trash2, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTodoMutations, useTodos } from "@/lib/query";
import { useTodoStore } from "@/lib/store/todo-store";
import type { Todo } from "@/lib/types";

interface MultiTodoContextMenuProps {
	selectedTodoIds: number[];
	children: React.ReactElement;
}

export function MultiTodoContextMenu({
	selectedTodoIds,
	children,
}: MultiTodoContextMenuProps) {
	// 从 TanStack Query 获取 mutation 操作和 todos 数据
	const { data: todos = [] } = useTodos();
	const { deleteTodo, updateTodo } = useTodoMutations();

	// 从 Zustand 获取 UI 状态操作
	const { onTodoDeleted, clearTodoSelection } = useTodoStore();

	// 右键菜单状态
	const [contextMenu, setContextMenu] = useState({
		open: false,
		x: 0,
		y: 0,
	});
	const menuRef = useRef<HTMLDivElement | null>(null);

	// 右键菜单：点击外部、滚动或按下 ESC 时关闭
	useEffect(() => {
		if (!contextMenu.open) return;

		const handleClose = () => {
			setContextMenu((state) =>
				state.open ? { ...state, open: false } : state,
			);
		};

		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (menuRef.current?.contains(target)) {
				return;
			}
			handleClose();
		};

		const handleEscape = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				handleClose();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleEscape);
		document.addEventListener("scroll", handleClose, true);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape);
			document.removeEventListener("scroll", handleClose, true);
		};
	}, [contextMenu.open]);

	const openContextMenu = (event: React.MouseEvent) => {
		// 只在有多个选中时才显示菜单
		if (selectedTodoIds.length <= 1) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		const menuWidth = 180;
		const menuHeight = 100;
		const viewportWidth =
			typeof window !== "undefined" ? window.innerWidth : menuWidth;
		const viewportHeight =
			typeof window !== "undefined" ? window.innerHeight : menuHeight;

		const x = Math.min(Math.max(event.clientX, 8), viewportWidth - menuWidth);
		const y = Math.min(Math.max(event.clientY, 8), viewportHeight - menuHeight);

		setContextMenu({
			open: true,
			x,
			y,
		});
	};

	const handleCancel = async () => {
		try {
			// 批量取消所有选中的 todo（更新状态为 canceled）
			await Promise.all(
				selectedTodoIds.map((id) =>
					updateTodo(id, { status: "canceled" }).catch((err) => {
						console.error(`Failed to cancel todo ${id}:`, err);
					}),
				),
			);
		} catch (err) {
			console.error("Failed to cancel todos:", err);
		}
		setContextMenu((state) => ({ ...state, open: false }));
		clearTodoSelection();
	};

	const handleDelete = async () => {
		try {
			// 递归查找所有子任务 ID
			const findAllChildIds = (
				parentId: number,
				allTodos: Todo[],
			): number[] => {
				const childIds: number[] = [];
				const children = allTodos.filter(
					(t: Todo) => t.parentTodoId === parentId,
				);
				for (const child of children) {
					childIds.push(child.id);
					childIds.push(...findAllChildIds(child.id, allTodos));
				}
				return childIds;
			};

			const selectedSet = new Set(selectedTodoIds);

			// 找出"根"选中项：父任务不在选中列表中的 todo
			// 只需要删除这些根项，后端会级联删除子任务
			const rootIdsToDelete: number[] = [];
			for (const id of selectedTodoIds) {
				const todo = todos.find((t) => t.id === id);
				// 如果没有父任务，或者父任务不在选中列表中，则为根项
				if (!todo?.parentTodoId || !selectedSet.has(todo.parentTodoId)) {
					rootIdsToDelete.push(id);
				}
			}

			// 收集所有要从 UI 中移除的 ID（包括子任务，用于清理状态）
			const allIdsToRemove = new Set<number>();
			for (const id of selectedTodoIds) {
				allIdsToRemove.add(id);
				const childIds = findAllChildIds(id, todos);
				for (const childId of childIds) {
					allIdsToRemove.add(childId);
				}
			}

			// 只删除根项，后端会级联删除子任务
			await Promise.all(
				rootIdsToDelete.map((id) =>
					deleteTodo(id).catch((err) => {
						console.error(`Failed to delete todo ${id}:`, err);
					}),
				),
			);

			// 清理 UI 状态
			onTodoDeleted(Array.from(allIdsToRemove));
		} catch (err) {
			console.error("Failed to delete todos:", err);
		}
		setContextMenu((state) => ({ ...state, open: false }));
		clearTodoSelection();
	};

	// 克隆子元素并添加 onContextMenu 处理器
	const childWithContextMenu = React.cloneElement(children, {
		onContextMenu: openContextMenu,
	} as React.HTMLAttributes<HTMLElement>);

	return (
		<>
			{childWithContextMenu}

			{contextMenu.open &&
				selectedTodoIds.length > 1 &&
				typeof document !== "undefined" &&
				createPortal(
					<div className="fixed inset-0 z-120 pointer-events-none">
						<div
							ref={menuRef}
							className="pointer-events-auto min-w-[170px] rounded-md border border-border bg-background shadow-lg"
							style={{
								top: contextMenu.y,
								left: contextMenu.x,
								position: "absolute",
							}}
						>
							<div className="px-3 py-2 text-xs text-muted-foreground border-b border-border">
								已选中 {selectedTodoIds.length} 项
							</div>
							<button
								type="button"
								className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/70 transition-colors"
								onClick={handleCancel}
							>
								<X className="h-4 w-4" />
								<span>批量放弃</span>
							</button>
							<button
								type="button"
								className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/70 transition-colors last:rounded-b-md"
								onClick={handleDelete}
							>
								<Trash2 className="h-4 w-4" />
								<span>批量删除</span>
							</button>
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}
