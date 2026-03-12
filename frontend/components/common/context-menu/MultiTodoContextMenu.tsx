"use client";

import { Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import React from "react";
import {
	BaseContextMenu,
	type MenuItem,
	useContextMenu,
} from "@/components/common/context-menu/BaseContextMenu";
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
	const t = useTranslations("contextMenu");
	// 从 TanStack Query 获取 mutation 操作和 todos 数据
	const { data: todos = [] } = useTodos();
	const { deleteTodo, updateTodo } = useTodoMutations();

	// 从 Zustand 获取 UI 状态操作
	const { onTodoDeleted, clearTodoSelection } = useTodoStore();

	// 使用通用菜单 hook
	const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

	const handleOpenContextMenu = (event: React.MouseEvent) => {
		// 只在有多个选中时才显示菜单
		if (selectedTodoIds.length <= 1) {
			return;
		}

		event.preventDefault();
		event.stopPropagation();

		openContextMenu(event, {
			menuWidth: 180,
			menuHeight: 100,
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
		closeContextMenu();
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
		closeContextMenu();
		clearTodoSelection();
	};

	// 构建菜单项
	const menuItems: MenuItem[] = [
		{
			icon: X,
			label: t("batchCancel"),
			onClick: handleCancel,
		},
		{
			icon: Trash2,
			label: t("batchDelete"),
			onClick: handleDelete,
			isLast: true,
		},
	];

	// 克隆子元素并添加 onContextMenu 处理器
	const childWithContextMenu = React.cloneElement(children, {
		onContextMenu: handleOpenContextMenu,
	} as React.HTMLAttributes<HTMLElement>);

	return (
		<>
			{childWithContextMenu}

			{contextMenu.open && selectedTodoIds.length > 1 && (
				<BaseContextMenu
					items={menuItems}
					open={contextMenu.open}
					position={{ x: contextMenu.x, y: contextMenu.y }}
					onClose={closeContextMenu}
					header={t("selectedCount", { count: selectedTodoIds.length })}
				/>
			)}
		</>
	);
}
