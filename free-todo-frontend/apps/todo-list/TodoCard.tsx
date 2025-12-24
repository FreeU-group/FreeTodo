"use client";

import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	Calendar,
	ChevronRight,
	CornerDownRight,
	Paperclip,
	Plus,
	Sparkles,
	Tag,
	X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TodoContextMenu } from "@/components/common/TodoContextMenu";
import type { DragData } from "@/lib/dnd";
import { useGlobalDndSafe } from "@/lib/dnd";
import { useTodoMutations, useTodos } from "@/lib/query";
import { usePlanStore } from "@/lib/store/plan-store";
import { useTodoStore } from "@/lib/store/todo-store";
import { useUiStore } from "@/lib/store/ui-store";
import type { Todo, TodoPriority } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface TodoCardProps {
	todo: Todo;
	depth?: number; // 树形结构的层级深度
	isDragging?: boolean;
	selected?: boolean;
	isOverlay?: boolean;
	hasMultipleSelection?: boolean; // 是否有多个 todo 被选中
	onSelect: (e: React.MouseEvent<HTMLDivElement>) => void;
	onSelectSingle: () => void;
}

export function TodoCard({
	todo,
	depth = 0,
	isDragging,
	selected,
	isOverlay,
	hasMultipleSelection = false,
	onSelect,
	onSelectSingle,
}: TodoCardProps) {
	const tTodoDetail = useTranslations("todoDetail");
	// 从 TanStack Query 获取 todos 数据（用于检查是否有子任务）
	const { data: todos = [] } = useTodos();

	// 从 TanStack Query 获取 mutation 操作
	const { createTodo, updateTodo, toggleTodoStatus } = useTodoMutations();

	// 从 Zustand 获取 UI 状态操作
	const { toggleTodoExpanded, isTodoExpanded } = useTodoStore();

	const { startPlan } = usePlanStore();
	const { setPanelFeature, getFeatureByPosition } = useUiStore();
	const [isAddingChild, setIsAddingChild] = useState(false);
	const [childName, setChildName] = useState("");
	const childInputRef = useRef<HTMLInputElement | null>(null);

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
			potentialParentId: number,
			potentialChildId: number,
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

	const getPriorityBorderColor = (priority: TodoPriority) => {
		switch (priority) {
			case "high":
				return "border-destructive/60";
			case "medium":
				return "border-primary/60";
			case "low":
				return "border-secondary/60";
			default:
				return "border-muted-foreground/40";
		}
	};

	const style = !isOverlay
		? {
				transform: CSS.Transform.toString(transform),
				transition: isSortableDragging ? "none" : transition,
				opacity: isSortableDragging ? 0.5 : 1,
			}
		: undefined;

	useEffect(() => {
		if (isAddingChild) {
			childInputRef.current?.focus();
		}
	}, [isAddingChild]);

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
			if (todo.status === "canceled") {
				// 如果是 canceled 状态，点击复选框回到 active 状态
				await updateTodo(todo.id, { status: "active" });
			} else {
				// 其他状态使用通用的切换逻辑
				await toggleTodoStatus(todo.id);
			}
		} catch (err) {
			console.error("Failed to toggle todo status:", err);
		}
	};

	const handleAddChildFromMenu = () => {
		setIsAddingChild(true);
	};

	const cardContent = (
		<div
			{...(!isOverlay ? { ...attributes, ...listeners } : {})}
			ref={setNodeRef}
			style={style}
			role="button"
			tabIndex={0}
			onClick={onSelect}
			onMouseDown={(e) => {
				// 阻止文本选择（当按住 Shift 或 Ctrl/Cmd 进行多选时）
				if (e.shiftKey || e.metaKey || e.ctrlKey) {
					e.preventDefault();
				}
			}}
			data-state={selected ? "selected" : "default"}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelectSingle();
				}
			}}
			className={cn(
				"todo-card group relative flex h-full flex-col justify-center gap-1 rounded-lg px-1 py-2 cursor-pointer",
				"border border-transparent transition-all duration-200",
				"bg-card dark:bg-background hover:bg-muted/40",
				"select-none", // 阻止文本选择
				selected &&
					"bg-[oklch(var(--primary-weak))] dark:bg-primary/17 border-[oklch(var(--primary-border)/0.3)] dark:border-primary/30",
				selected &&
					"hover:bg-[oklch(var(--primary-weak-hover))] dark:hover:bg-primary/30",
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
						className="shrink-0 flex h-4 w-4 items-center justify-center rounded-md hover:bg-muted/50 transition-colors"
						aria-label={
							isExpanded
								? tTodoDetail("collapseSubTasks")
								: tTodoDetail("expandSubTasks")
						}
					>
						<ChevronRight
							className={cn(
								"h-3 w-3 text-muted-foreground transition-transform duration-200",
								isExpanded && "rotate-90",
							)}
						/>
					</button>
				)}
				{!hasChildren && <div className="w-4 shrink-0" />}
				<button type="button" onClick={handleToggleStatus} className="shrink-0">
					{todo.status === "completed" ? (
						<div className="flex h-4 w-4 items-center justify-center rounded-md bg-[oklch(var(--primary))] border border-[oklch(var(--primary))] shadow-inner">
							<span className="text-[8px] text-[oklch(var(--primary-foreground))] font-semibold">
								✓
							</span>
						</div>
					) : todo.status === "canceled" ? (
						<div
							className={cn(
								"flex h-4 w-4 items-center justify-center rounded-md border-2",
								getPriorityBorderColor(todo.priority ?? "none"),
								"bg-muted/30 text-muted-foreground/70",
								"transition-colors",
								"hover:bg-muted/40 hover:text-muted-foreground",
							)}
						>
							<X className="h-2.5 w-2.5" strokeWidth={2.5} />
						</div>
					) : todo.status === "draft" ? (
						<div className="flex h-4 w-4 items-center justify-center rounded-md bg-orange-500 border border-orange-600 dark:border-orange-500 shadow-inner">
							<span className="text-[10px] text-white dark:text-orange-50 font-semibold">
								—
							</span>
						</div>
					) : (
						<div
							className={cn(
								"h-4 w-4 rounded-md border-2 transition-colors",
								getPriorityBorderColor(todo.priority ?? "none"),
								"hover:border-foreground",
							)}
						/>
					)}
				</button>

				<div className="flex-1 min-w-0">
					<div className="flex items-center justify-between gap-2 h-4">
						<div className="min-w-0 flex-1 flex items-center h-4">
							<h3
								className={cn(
									"text-sm text-foreground leading-4 m-0 h-4 flex items-center",
									todo.status === "completed" &&
										"line-through text-muted-foreground",
									todo.status === "canceled" &&
										"line-through text-muted-foreground",
								)}
							>
								{todo.name}
							</h3>
							{/* {todo.description && (
								<p className="text-xs text-muted-foreground line-clamp-2">
									{todo.description}
								</p>
							)} */}
						</div>
						{/* AI规划按钮 - hover时显示 */}
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								handleStartPlan();
							}}
							className="opacity-0 group-hover:opacity-100 shrink-0 flex h-4 w-4 items-center justify-center rounded-md hover:bg-muted/50 transition-all"
							aria-label={tTodoDetail("useAiPlan")}
							title={tTodoDetail("useAiPlanTitle")}
						>
							<Sparkles className="h-3 w-3 text-primary" />
						</button>

						<div className="flex items-center gap-2 shrink-0">
							{/* {todo.priority && todo.priority !== "none" && (
								<div
									className={cn(
										"flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
										getPriorityBgColor(todo.priority),
									)}
									title={tTodoDetail("priorityLabel", {
										priority: getPriorityLabel(todo.priority, tCommon),
									})}
								>
									<Flag className="h-3.5 w-3.5" fill="currentColor" />
									<span>{getPriorityLabel(todo.priority, tCommon)}</span>
								</div>
							)} */}
							{todo.attachments && todo.attachments.length > 0 && (
								<span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground bg-muted/50">
									<Paperclip className="h-3 w-3" />
									{todo.attachments.length}
								</span>
							)}
						</div>
					</div>

					{(todo.deadline ||
						(todo.attachments && todo.attachments.length > 0) ||
						(todo.tags && todo.tags.length > 0)) && (
						<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
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
					)}
				</div>
			</div>

			{isAddingChild && (
				<form
					onSubmit={handleCreateChild}
					onMouseDown={(e) => e.stopPropagation()}
					className="mt-2 space-y-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-2"
				>
					<input
						ref={childInputRef}
						type="text"
						value={childName}
						onChange={(e) => setChildName(e.target.value)}
						onKeyDown={(e) => {
							// 阻止所有键盘事件冒泡到父元素，避免空格等键被父元素拦截
							e.stopPropagation();
							if (e.key === "Enter" && !e.nativeEvent.isComposing) {
								// 只在非输入法组合状态下处理回车键，避免干扰中文输入法
								e.preventDefault(); // 阻止表单提交，避免重复创建
								handleCreateChild();
								return;
							}
							if (e.key === "Escape") {
								setIsAddingChild(false);
								setChildName("");
							}
						}}
						placeholder={tTodoDetail("addChildPlaceholder")}
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
							{tTodoDetail("cancel")}
						</button>
						<button
							type="submit"
							className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
						>
							<Plus className="h-4 w-4" />
							{tTodoDetail("add")}
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
						<span>{tTodoDetail("setAsChild")}</span>
					</div>
				</div>
			)}
		</div>
	);

	// 如果是拖拽覆盖层，不需要右键菜单
	if (isOverlay) {
		return cardContent;
	}

	// 如果有多选，不显示单个 todo 的右键菜单（由 MultiTodoContextMenu 处理）
	if (hasMultipleSelection) {
		return cardContent;
	}

	return (
		<TodoContextMenu
			todoId={todo.id}
			onAddChild={handleAddChildFromMenu}
			onContextMenuOpen={onSelectSingle}
		>
			{cardContent}
		</TodoContextMenu>
	);
}
