"use client";

import { Plus, Sparkles, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";
import { cloneElement, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTodoMutations, useTodos } from "@/lib/query";
import { usePlanStore } from "@/lib/store/plan-store";
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
	const { startPlan } = usePlanStore();
	const { setPanelFeature, getFeatureByPosition } = useUiStore();

	// 右键菜单状态
	const [contextMenu, setContextMenu] = useState({
		open: false,
		x: 0,
		y: 0,
	});
	const menuRef = useRef<HTMLDivElement | null>(null);

	// 内部添加子待办的状态（当没有提供 onAddChild 时使用）
	const [isAddingChild, setIsAddingChild] = useState(false);
	const [childName, setChildName] = useState("");
	const childInputRef = useRef<HTMLInputElement | null>(null);

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

	useEffect(() => {
		if (isAddingChild) {
			childInputRef.current?.focus();
		}
	}, [isAddingChild]);

	const openContextMenu = (event: React.MouseEvent) => {
		event.preventDefault();
		event.stopPropagation();
		onContextMenuOpen?.();

		const menuWidth = 180;
		const menuHeight = 160;
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

	const handleAddChildClick = () => {
		setContextMenu((state) => ({ ...state, open: false }));
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

	const handleStartPlan = () => {
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

		// 开始Plan流程
		startPlan(todoId);
		setContextMenu((state) => ({ ...state, open: false }));
	};

	const handleCancel = async () => {
		try {
			await updateTodo(todoId, { status: "canceled" });
		} catch (err) {
			console.error("Failed to cancel todo:", err);
		}
		setContextMenu((state) => ({ ...state, open: false }));
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
		setContextMenu((state) => ({ ...state, open: false }));
	};

	// 克隆子元素并添加 onContextMenu 处理器
	const childWithContextMenu = cloneElement(children, {
		onContextMenu: openContextMenu,
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

			{contextMenu.open &&
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
							<button
								type="button"
								className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/70 transition-colors first:rounded-t-md"
								onClick={handleAddChildClick}
							>
								<Plus className="h-4 w-4" />
								<span>{t("addChild")}</span>
							</button>
							<button
								type="button"
								className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/70 transition-colors"
								onClick={handleStartPlan}
							>
								<Sparkles className="h-4 w-4" />
								<span>{t("useAiPlan")}</span>
							</button>
							<button
								type="button"
								className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/70 transition-colors"
								onClick={handleCancel}
							>
								<X className="h-4 w-4" />
								<span>{t("cancel")}</span>
							</button>
							<button
								type="button"
								className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/70 transition-colors last:rounded-b-md"
								onClick={handleDelete}
							>
								<Trash2 className="h-4 w-4" />
								<span>{t("delete")}</span>
							</button>
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}
