"use client";

import { Plus, Sparkles, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";
import { cloneElement, useEffect, useRef, useState } from "react";
import {
	BaseContextMenu,
	type MenuItem,
	useContextMenu,
} from "@/components/common/context-menu/BaseContextMenu";
import { useTodoMutations, useTodos } from "@/lib/query";
import { useBreakdownStore } from "@/lib/store/breakdown-store";
import { useTodoStore } from "@/lib/store/todo-store";
import { useUiStore } from "@/lib/store/ui-store";
import type { Todo } from "@/lib/types";

interface TodoContextMenuProps {
	todoId: number;
	children: React.ReactElement;
	/** 点击"添加子待办"时的回调，如果提供则不会在内部创建子待办 */
	onAddChild?: () => void;
	/** 右键菜单打开时的回调 */
	onContextMenuOpen?: () => void;
}

export function TodoContextMenu({
	todoId,
	children,
	onAddChild,
	onContextMenuOpen,
}: TodoContextMenuProps) {
	const t = useTranslations("contextMenu");
	// 从 TanStack Query 获取 mutation 操作和 todos 数据
	const { data: todos = [] } = useTodos();
	const { createTodo, updateTodo, deleteTodo } = useTodoMutations();

	// 从 Zustand 获取 UI 状态操作
	const { onTodoDeleted } = useTodoStore();
	const { startBreakdown } = useBreakdownStore();
	const { setPanelFeature, getFeatureByPosition } = useUiStore();

	// 使用通用菜单 hook
	const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();

	// 内部添加子待办的状态（当没有提供 onAddChild 时使用）
	const [isAddingChild, setIsAddingChild] = useState(false);
	const [childName, setChildName] = useState("");
	const childInputRef = useRef<HTMLInputElement | null>(null);

	useEffect(() => {
		if (isAddingChild) {
			childInputRef.current?.focus();
		}
	}, [isAddingChild]);

	const handleOpenContextMenu = (event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		onContextMenuOpen?.();
		openContextMenu(event, {
			menuWidth: 180,
			menuHeight: 160,
		});
	};

	const handleAddChildClick = () => {
		closeContextMenu();
		if (onAddChild) {
			onAddChild();
		} else {
			setIsAddingChild(true);
			setChildName("");
		}
	};

	const handleCreateChild = async (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		const name = childName.trim();
		if (!name) return;

		try {
			await createTodo({ name, parentTodoId: todoId });
			setChildName("");
			setIsAddingChild(false);
		} catch (err) {
			console.error("Failed to create child todo:", err);
		}
	};

	const handleStartBreakdown = () => {
		// 确保聊天Panel打开并切换到聊天功能
		const chatPosition = getFeatureByPosition("panelA");
		if (chatPosition !== "chat") {
			// 找到聊天功能所在的位置，或分配到第一个可用位置
			const positions: Array<"panelA" | "panelB" | "panelC"> = [
				"panelA",
				"panelB",
				"panelC",
			];
			for (const pos of positions) {
				if (getFeatureByPosition(pos) === "chat") {
					// 如果聊天功能已经在某个位置，确保该位置打开
					if (pos === "panelA" && !useUiStore.getState().isPanelAOpen) {
						useUiStore.getState().togglePanelA();
					} else if (pos === "panelB" && !useUiStore.getState().isPanelBOpen) {
						useUiStore.getState().togglePanelB();
					} else if (pos === "panelC" && !useUiStore.getState().isPanelCOpen) {
						useUiStore.getState().togglePanelC();
					}
					break;
				}
			}
			// 如果聊天功能不在任何位置，分配到panelB
			if (!positions.some((pos) => getFeatureByPosition(pos) === "chat")) {
				setPanelFeature("panelB", "chat");
				if (!useUiStore.getState().isPanelBOpen) {
					useUiStore.getState().togglePanelB();
				}
			}
		} else {
			// 如果聊天功能在panelA，确保panelA打开
			if (!useUiStore.getState().isPanelAOpen) {
				useUiStore.getState().togglePanelA();
			}
		}

		// 开始Breakdown流程
		startBreakdown(todoId);
		closeContextMenu();
	};

	const handleCancel = async () => {
		try {
			await updateTodo(todoId, { status: "canceled" });
		} catch (err) {
			console.error("Failed to cancel todo:", err);
		}
		closeContextMenu();
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

			const allIdsToDelete = [todoId, ...findAllChildIds(todoId, todos)];

			await deleteTodo(todoId);
			// 清理 UI 状态
			onTodoDeleted(allIdsToDelete);
		} catch (err) {
			console.error("Failed to delete todo:", err);
		}
		closeContextMenu();
	};

	// 构建菜单项
	const menuItems: MenuItem[] = [
		{
			icon: Plus,
			label: t("addChild"),
			onClick: handleAddChildClick,
			isFirst: true,
		},
		{
			icon: Sparkles,
			label: t("useAiPlan"),
			onClick: handleStartBreakdown,
		},
		{
			icon: X,
			label: t("cancel"),
			onClick: handleCancel,
		},
		{
			icon: Trash2,
			label: t("delete"),
			onClick: handleDelete,
			isLast: true,
		},
	];

	// 克隆子元素并添加 onContextMenu 处理器
	const childWithContextMenu = cloneElement(children, {
		onContextMenu: handleOpenContextMenu,
	} as React.HTMLAttributes<HTMLElement>);

	return (
		<>
			{childWithContextMenu}

			{/* 内部添加子待办表单（当没有提供 onAddChild 时显示） */}
			{isAddingChild && !onAddChild && (
				<form
					onSubmit={handleCreateChild}
					onMouseDown={(e) => e.stopPropagation()}
					className="mt-3 space-y-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3"
				>
					<input
						ref={childInputRef}
						type="text"
						value={childName}
						onChange={(e) => setChildName(e.target.value)}
						onKeyDown={(e) => {
							e.stopPropagation();
							if (e.key === "Enter") {
								handleCreateChild();
								return;
							}
							if (e.key === "Escape") {
								setIsAddingChild(false);
								setChildName("");
							}
						}}
						placeholder={t("childNamePlaceholder")}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
					/>
					<div className="flex items-center justify-end gap-2">
						<button
							type="button"
							onClick={() => {
								setIsAddingChild(false);
								setChildName("");
							}}
							className="rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
						>
							{t("cancelButton")}
						</button>
						<button
							type="submit"
							className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
						>
							<Plus className="h-4 w-4" />
							{t("addButton")}
						</button>
					</div>
				</form>
			)}

			<BaseContextMenu
				items={menuItems}
				open={contextMenu.open}
				position={{ x: contextMenu.x, y: contextMenu.y }}
				onClose={closeContextMenu}
			/>
		</>
	);
}
