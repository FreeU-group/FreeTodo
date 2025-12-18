"use client";

import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	Calendar,
	ChevronRight,
	CornerDownRight,
	Flag,
	Paperclip,
	Plus,
	Sparkles,
	Tag,
	Trash2,
	X,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DragData } from "@/lib/dnd";
import { useGlobalDndSafe } from "@/lib/dnd";
import { useTodoMutations, useTodos } from "@/lib/query";
import { usePlanStore } from "@/lib/store/plan-store";
import { useTodoStore } from "@/lib/store/todo-store";
import { useUiStore } from "@/lib/store/ui-store";
import type { Todo, TodoPriority, TodoStatus } from "@/lib/types/todo";
import { cn } from "@/lib/utils";

export interface TodoCardProps {
	todo: Todo;
	depth?: number; // 树形结构的层级深度
	isDragging?: boolean;
	selected?: boolean;
	isOverlay?: boolean;
	onSelect: (e: React.MouseEvent<HTMLDivElement>) => void;
	onSelectSingle: () => void;
}

export function TodoCard({
	todo,
	depth = 0,
	isDragging,
	selected,
	isOverlay,
	onSelect,
	onSelectSingle,
}: TodoCardProps) {
	// 从 TanStack Query 获取 todos 数据（用于检查是否有子任务）
	const { data: todos = [] } = useTodos();

	// 从 TanStack Query 获取 mutation 操作
	const { createTodo, updateTodo, deleteTodo, toggleTodoStatus } =
		useTodoMutations();

	// 从 Zustand 获取 UI 状态操作
	const { toggleTodoExpanded, isTodoExpanded, onTodoDeleted } = useTodoStore();

	const { startPlan } = usePlanStore();
	const { setPanelFeature, getFeatureByPosition } = useUiStore();
	const [contextMenu, setContextMenu] = useState({
		open: false,
		x: 0,
		y: 0,
	});
	const [isAddingChild, setIsAddingChild] = useState(false);
	const [childName, setChildName] = useState("");
	const childInputRef = useRef<HTMLInputElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);

	// 构建类型化的拖拽数据
	const dragData: DragData = useMemo(
		() => ({
			type: "TODO_CARD" as const,
			payload: {
				todo,
				depth,
				sourcePanel: "todoList",
			},
		}),
		[todo, depth],
	);

	const sortable = useSortable({
		id: todo.id,
		disabled: isOverlay,
		data: dragData, // 传递类型化的拖拽数据
	});
	const attributes = isOverlay ? {} : sortable.attributes;
	const listeners = isOverlay ? {} : sortable.listeners;
	const setNodeRef = sortable.setNodeRef;
	const transform = sortable.transform;
	const transition = sortable.transition;
	const isSortableDragging = sortable.isDragging;

	// 放置区域：用于将其他 todo 设为此 todo 的子任务
	const nestDroppable = useDroppable({
		id: `${todo.id}-nest`,
		disabled: isOverlay,
		data: {
			type: "TODO_DROP_ZONE",
			metadata: {
				todoId: todo.id,
				position: "nest",
			},
		},
	});

	// 获取全局拖拽状态
	const dndContext = useGlobalDndSafe();
	const isOtherDragging =
		dndContext?.activeDrag !== null &&
		dndContext?.activeDrag?.id !== todo.id &&
		dndContext?.activeDrag?.data?.type === "TODO_CARD";

	// 检查当前拖拽的 todo 是否是此 todo 的子孙（防止循环引用）
	const isDescendantDragging = useMemo(() => {
		if (!dndContext?.activeDrag?.data) return false;
		const draggedData = dndContext.activeDrag.data;
		if (draggedData.type !== "TODO_CARD") return false;
		const draggedTodo = draggedData.payload.todo;

		// 检查当前 todo 是否是被拖拽 todo 的子孙
		const checkIsDescendant = (
			potentialParentId: string,
			potentialChildId: string,
		): boolean => {
			let current = todos.find((t: Todo) => t.id === potentialChildId);
			while (current?.parentTodoId) {
				if (current.parentTodoId === potentialParentId) return true;
				current = todos.find((t: Todo) => t.id === current?.parentTodoId);
			}
			return false;
		};

		return checkIsDescendant(draggedTodo.id, todo.id);
	}, [dndContext?.activeDrag, todos, todo.id]);

	// 是否显示放置区域
	const showNestDropZone =
		isOtherDragging && !isDescendantDragging && !isSortableDragging;

	// 检查是否有子任务
	const hasChildren = useMemo(() => {
		return todos.some((t: Todo) => t.parentTodoId === todo.id);
	}, [todos, todo.id]);

	const isExpanded = isTodoExpanded(todo.id);

	const formatDate = useMemo(
		() => (dateString?: string) => {
			if (!dateString) return null;
			const date = new Date(dateString);
			return date.toLocaleDateString("en-US", {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
		},
		[],
	);

	const getStatusColor = (status: TodoStatus) => {
		switch (status) {
			case "active":
				return "bg-[oklch(var(--primary)/0.12)] text-[oklch(var(--primary))] border-[oklch(var(--primary)/0.32)]";
			case "completed":
				return "bg-[oklch(var(--accent)/0.16)] text-[oklch(var(--accent-foreground))] border-[oklch(var(--accent)/0.28)]";
			case "canceled":
				return "bg-[oklch(var(--muted)/0.35)] text-[oklch(var(--muted-foreground))] border-[oklch(var(--border))]";
			case "draft":
				return "bg-orange-500/12 text-orange-600 dark:text-orange-400 border-orange-500/32";
			default:
				return "";
		}
	};

	const getStatusLabel = (status: TodoStatus) => {
		switch (status) {
			case "active":
				return "Active";
			case "completed":
				return "Completed";
			case "canceled":
				return "Canceled";
			case "draft":
				return "Draft";
			default:
				return status;
		}
	};

	const getPriorityColor = (priority: TodoPriority) => {
		switch (priority) {
			case "high":
				return "text-[oklch(var(--destructive))]";
			case "medium":
				return "text-[oklch(var(--primary))]";
			case "low":
				return "text-[oklch(var(--accent-foreground))]";
			default:
				return "text-muted-foreground";
		}
	};

	const getPriorityLabel = (priority: TodoPriority) => {
		switch (priority) {
			case "high":
				return "高";
			case "medium":
				return "中";
			case "low":
				return "低";
			default:
				return "无";
		}
	};

	const style = !isOverlay
		? {
				transform: CSS.Transform.toString(transform),
				transition: isSortableDragging ? "none" : transition,
				opacity: isSortableDragging ? 0.5 : 1,
			}
		: undefined;

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

	const openContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		onSelectSingle();

		const menuWidth = 180;
		const menuHeight = 90;
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

	const handleCreateChild = async (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		const name = childName.trim();
		if (!name) return;

		try {
			await createTodo({ name, parentTodoId: todo.id });
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
		startPlan(todo.id);
	};

	const handleToggleStatus = async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await toggleTodoStatus(todo.id);
		} catch (err) {
			console.error("Failed to toggle todo status:", err);
		}
	};

	const handleDelete = async () => {
		try {
			// 递归查找所有子任务 ID
			const findAllChildIds = (
				parentId: string,
				allTodos: Todo[],
			): string[] => {
				const childIds: string[] = [];
				const children = allTodos.filter((t) => t.parentTodoId === parentId);
				for (const child of children) {
					childIds.push(child.id);
					childIds.push(...findAllChildIds(child.id, allTodos));
				}
				return childIds;
			};

			const allIdsToDelete = [todo.id, ...findAllChildIds(todo.id, todos)];

			await deleteTodo(todo.id);
			// 清理 UI 状态
			onTodoDeleted(allIdsToDelete);
		} catch (err) {
			console.error("Failed to delete todo:", err);
		}
	};

	const handleCancel = async () => {
		try {
			await updateTodo(todo.id, { status: "canceled" });
		} catch (err) {
			console.error("Failed to cancel todo:", err);
		}
	};

	return (
		<>
			<div
				{...(!isOverlay ? { ...attributes, ...listeners } : {})}
				ref={setNodeRef}
				style={style}
				role="button"
				tabIndex={0}
				onClick={onSelect}
				data-state={selected ? "selected" : "default"}
				onContextMenu={openContextMenu}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						onSelectSingle();
					}
				}}
				className={cn(
					"todo-card group relative flex h-full flex-col gap-3 rounded-xl p-3 cursor-pointer",
					"border border-transparent transition-all duration-200",
					"bg-card hover:bg-muted/40",
					selected &&
						"bg-[oklch(var(--primary-weak))] border-[oklch(var(--primary-border)/0.3)]",
					selected && "hover:bg-[oklch(var(--primary-weak-hover))]",
					isDragging && "ring-2 ring-primary/30",
				)}
			>
				<div className="flex items-start gap-2">
					{hasChildren && (
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								toggleTodoExpanded(todo.id);
							}}
							className="mt-1 shrink-0 flex h-5 w-5 items-center justify-center rounded-md hover:bg-muted/50 transition-colors"
							aria-label={isExpanded ? "折叠子任务" : "展开子任务"}
						>
							<ChevronRight
								className={cn(
									"h-4 w-4 text-muted-foreground transition-transform duration-200",
									isExpanded && "rotate-90",
								)}
							/>
						</button>
					)}
					{!hasChildren && <div className="w-5 shrink-0" />}
					<button
						type="button"
						onClick={handleToggleStatus}
						className="shrink-0"
					>
						{todo.status === "completed" ? (
							<div className="flex h-5 w-5 items-center justify-center rounded-md bg-[oklch(var(--primary))] border border-[oklch(var(--primary))] shadow-inner">
								<span className="text-[10px] text-[oklch(var(--primary-foreground))] font-semibold">
									✓
								</span>
							</div>
						) : (
							<div className="h-5 w-5 rounded-md border-2 border-muted-foreground/40 hover:border-foreground transition-colors" />
						)}
					</button>

					<div className="flex-1 min-w-0 space-y-1">
						<div className="flex items-start justify-between gap-2">
							<div className="min-w-0 flex-1 space-y-1">
								<h3
									className={cn(
										"text-sm font-semibold text-foreground",
										todo.status === "completed" &&
											"line-through text-muted-foreground",
									)}
								>
									{todo.name}
								</h3>
								{todo.description && (
									<p className="text-xs text-muted-foreground line-clamp-2">
										{todo.description}
									</p>
								)}
							</div>
							{/* AI规划按钮 - hover时显示 */}
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									handleStartPlan();
								}}
								className="opacity-0 group-hover:opacity-100 shrink-0 flex h-6 w-6 items-center justify-center rounded-md hover:bg-muted/50 transition-all"
								aria-label="使用AI规划"
								title="使用AI规划"
							>
								<Sparkles className="h-4 w-4 text-primary" />
							</button>

							<div className="flex items-center gap-2 shrink-0">
								{todo.priority && todo.priority !== "none" && (
									<div
										className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground"
										title={`优先级：${getPriorityLabel(todo.priority)}`}
									>
										<Flag
											className={cn(
												"h-3.5 w-3.5",
												getPriorityColor(todo.priority),
											)}
											fill="currentColor"
										/>
										<span>{getPriorityLabel(todo.priority)}</span>
									</div>
								)}
								{todo.status && (
									<span
										className={cn(
											"px-2 py-0.5 rounded-full text-xs font-medium border shadow-sm",
											getStatusColor(todo.status),
										)}
									>
										{getStatusLabel(todo.status)}
									</span>
								)}
								{todo.attachments && todo.attachments.length > 0 && (
									<span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground bg-muted/50">
										<Paperclip className="h-3 w-3" />
										{todo.attachments.length}
									</span>
								)}
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							{todo.deadline && (
								<div className="flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1">
									<Calendar className="h-3 w-3" />
									<span>{formatDate(todo.deadline)}</span>
								</div>
							)}

							{todo.attachments && todo.attachments.length > 0 && (
								<div className="flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1">
									<Paperclip className="h-3 w-3" />
									<span>{todo.attachments.length}</span>
								</div>
							)}

							{todo.tags && todo.tags.length > 0 && (
								<div className="flex flex-wrap items-center gap-1">
									<Tag className="h-3 w-3" />
									{todo.tags.slice(0, 3).map((tag) => (
										<span
											key={tag}
											className="px-2 py-0.5 rounded-full bg-muted text-[11px] font-medium text-foreground"
										>
											{tag}
										</span>
									))}
									{todo.tags.length > 3 && (
										<span className="text-[11px] text-muted-foreground">
											+{todo.tags.length - 3}
										</span>
									)}
								</div>
							)}
						</div>
					</div>
				</div>

				{isAddingChild && (
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
								if (e.key === "Enter") {
									e.stopPropagation();
									handleCreateChild();
									return;
								}
								if (e.key === "Escape") {
									e.stopPropagation();
									setIsAddingChild(false);
									setChildName("");
								}
							}}
							placeholder="输入子待办名称..."
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
								取消
							</button>
							<button
								type="submit"
								className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
							>
								<Plus className="h-4 w-4" />
								添加
							</button>
						</div>
					</form>
				)}

				{/* 放置区域：设为子任务 */}
				{showNestDropZone && (
					<div
						ref={nestDroppable.setNodeRef}
						className={cn(
							"absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed transition-all duration-200",
							nestDroppable.isOver
								? "border-primary bg-primary/10"
								: "border-muted-foreground/30 bg-muted/20",
						)}
					>
						<div
							className={cn(
								"flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
								nestDroppable.isOver
									? "bg-primary text-primary-foreground"
									: "bg-muted text-muted-foreground",
							)}
						>
							<CornerDownRight className="h-4 w-4" />
							<span>设为子任务</span>
						</div>
					</div>
				)}
			</div>

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
								onClick={() => {
									setContextMenu((state) =>
										state.open ? { ...state, open: false } : state,
									);
									setIsAddingChild(true);
								}}
							>
								<Plus className="h-4 w-4" />
								<span>添加子待办</span>
							</button>
							<button
								type="button"
								className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/70 transition-colors"
								onClick={() => {
									setContextMenu((state) =>
										state.open ? { ...state, open: false } : state,
									);
									handleStartPlan();
								}}
							>
								<Sparkles className="h-4 w-4" />
								<span>使用AI规划</span>
							</button>
							<button
								type="button"
								className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/70 transition-colors"
								onClick={() => {
									handleCancel();
									setContextMenu((state) =>
										state.open ? { ...state, open: false } : state,
									);
								}}
							>
								<X className="h-4 w-4" />
								<span>放弃</span>
							</button>
							<button
								type="button"
								className="flex w-full items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-muted/70 transition-colors last:rounded-b-md"
								onClick={() => {
									handleDelete();
									setContextMenu((state) =>
										state.open ? { ...state, open: false } : state,
									);
								}}
							>
								<Trash2 className="h-4 w-4" />
								<span>删除</span>
							</button>
						</div>
					</div>,
					document.body,
				)}
		</>
	);
}
