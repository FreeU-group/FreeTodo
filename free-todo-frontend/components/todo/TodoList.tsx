"use client";

import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
	verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
	Calendar,
	Paperclip,
	Plus,
	Search,
	Tag,
	Trash2,
	X,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTodoStore } from "@/lib/store/todo-store";
import type { CreateTodoInput, Todo, TodoStatus } from "@/lib/types/todo";
import { cn } from "@/lib/utils";

type FilterStatus = "all" | TodoStatus;

type OrderedTodo = {
	todo: Todo;
	depth: number;
};

interface TodoCardProps {
	todo: Todo;
	isDragging?: boolean;
	selected?: boolean;
	isOverlay?: boolean;
	onSelect: (e: React.MouseEvent<HTMLDivElement>) => void;
	onSelectSingle: () => void;
}

function TodoCard({
	todo,
	isDragging,
	selected,
	isOverlay,
	onSelect,
	onSelectSingle,
}: TodoCardProps) {
	const { toggleTodoStatus, deleteTodo, updateTodo, addTodo } = useTodoStore();
	const [contextMenu, setContextMenu] = useState({
		open: false,
		x: 0,
		y: 0,
	});
	const [isAddingChild, setIsAddingChild] = useState(false);
	const [childName, setChildName] = useState("");
	const childInputRef = useRef<HTMLInputElement | null>(null);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const sortable = useSortable({ id: todo.id, disabled: isOverlay });
	const attributes = isOverlay ? {} : sortable.attributes;
	const listeners = isOverlay ? {} : sortable.listeners;
	const setNodeRef = sortable.setNodeRef;
	const transform = sortable.transform;
	const transition = sortable.transition;
	const isSortableDragging = sortable.isDragging;

	const formatDate = (dateString?: string) => {
		if (!dateString) return null;
		const date = new Date(dateString);
		return date.toLocaleDateString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	};

	const getStatusColor = (status: TodoStatus) => {
		switch (status) {
			case "active":
				return "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30";
			case "completed":
				return "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30";
			case "canceled":
				return "bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30";
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
			default:
				return status;
		}
	};

	const style = !isOverlay
		? {
				transform: CSS.Transform.toString(transform),
				transition: isSortableDragging ? "none" : transition, // 拖拽时禁用过渡动画，避免位置偏移
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

	const handleCreateChild = (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		const name = childName.trim();
		if (!name) return;

		addTodo({ name, parentTodoId: todo.id });
		setChildName("");
		setIsAddingChild(false);
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
					"todo-card group relative flex h-full flex-col gap-3 rounded-xl p-4 cursor-pointer",
					isDragging && "ring-2 ring-primary/30",
				)}
			>
				<div className="flex items-start gap-3">
					{/* 状态切换 */}
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							toggleTodoStatus(todo.id);
						}}
						className="mt-1 shrink-0"
					>
						{todo.status === "completed" ? (
							<div className="flex h-5 w-5 items-center justify-center rounded-md bg-green-500 dark:bg-green-400 border border-green-600 dark:border-green-500 shadow-inner">
								<span className="text-[10px] text-white font-semibold">✓</span>
							</div>
						) : (
							<div className="h-5 w-5 rounded-md border-2 border-muted-foreground/40 hover:border-foreground transition-colors" />
						)}
					</button>

					{/* 内容区域 */}
					<div className="flex-1 min-w-0 space-y-3">
						<div className="flex items-start justify-between gap-2">
							<div className="min-w-0 space-y-1">
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

							{/* 状态和附件提示 */}
							<div className="flex items-center gap-2 shrink-0">
								{/* 状态标签 */}
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
								{/* 附件提示 */}
								{todo.attachments && todo.attachments.length > 0 && (
									<span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground bg-muted/50">
										<Paperclip className="h-3 w-3" />
										{todo.attachments.length}
									</span>
								)}
							</div>
						</div>

						{/* 日期、附件、标签 */}
						<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							{/* 截止日期 */}
							{todo.deadline && (
								<div className="flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1">
									<Calendar className="h-3 w-3" />
									<span>{formatDate(todo.deadline)}</span>
								</div>
							)}

							{/* 附件数量 */}
							{todo.attachments && todo.attachments.length > 0 && (
								<div className="flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1">
									<Paperclip className="h-3 w-3" />
									<span>{todo.attachments.length}</span>
								</div>
							)}

							{/* 标签 */}
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
			</div>

			{contextMenu.open &&
				typeof document !== "undefined" &&
				createPortal(
					<div className="fixed inset-0 z-[120] pointer-events-none">
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
								className="flex w-full items-center gap-2 px-3 py-2 text-sm text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors first:rounded-t-md"
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
								className="flex w-full items-center gap-2 px-3 py-2 text-sm text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
								onClick={() => {
									updateTodo(todo.id, { status: "canceled" });
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
								className="flex w-full items-center gap-2 px-3 py-2 text-sm text-black dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors last:rounded-b-md"
								onClick={() => {
									deleteTodo(todo.id);
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

export function TodoList() {
	const {
		todos,
		reorderTodos,
		addTodo,
		selectedTodoIds,
		setSelectedTodoId,
		toggleTodoSelection,
	} = useTodoStore();
	const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [activeId, setActiveId] = useState<string | null>(null);
	const [isCreatingInline, setIsCreatingInline] = useState(false);
	const [newTodoName, setNewTodoName] = useState("");

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 5, // 移动5px后才激活拖拽，避免点击时误触发
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	// 过滤和搜索
	const filteredTodos = useMemo(() => {
		let result = todos;

		// 状态过滤
		if (filterStatus !== "all") {
			result = result.filter((todo) => todo.status === filterStatus);
		}

		// 搜索过滤
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(todo) =>
					todo.name.toLowerCase().includes(query) ||
					todo.description?.toLowerCase().includes(query) ||
					todo.tags?.some((tag) => tag.toLowerCase().includes(query)),
			);
		}

		return result;
	}, [todos, filterStatus, searchQuery]);

	// 构建树形顺序，包含子任务
	const orderedTodos = useMemo<OrderedTodo[]>(() => {
		const orderMap = new Map(
			filteredTodos.map((todo, index) => [todo.id, index]),
		);
		const visibleIds = new Set(filteredTodos.map((todo) => todo.id));
		const childrenMap = new Map<string, Todo[]>();
		const roots: Todo[] = [];

		filteredTodos.forEach((todo) => {
			const parentId = todo.parentTodoId;
			if (parentId && visibleIds.has(parentId)) {
				const list = childrenMap.get(parentId) ?? [];
				list.push(todo);
				childrenMap.set(parentId, list);
			} else {
				roots.push(todo);
			}
		});

		const sortByOriginalOrder = (list: Todo[]) =>
			[...list].sort(
				(a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
			);

		const ordered: OrderedTodo[] = [];
		const traverse = (items: Todo[], depth: number) => {
			sortByOriginalOrder(items).forEach((item) => {
				ordered.push({ todo: item, depth });
				const children = childrenMap.get(item.id);
				if (children?.length) {
					traverse(children, depth + 1);
				}
			});
		};

		traverse(sortByOriginalOrder(roots), 0);
		return ordered;
	}, [filteredTodos]);

	// 获取拖拽中的任务
	const activeTodoEntry = activeId
		? orderedTodos.find(({ todo }) => todo.id === activeId)
		: null;
	const activeTodo = activeTodoEntry?.todo ?? null;

	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(event.active.id as string);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (over && active.id !== over.id) {
			const oldIndex = orderedTodos.findIndex(
				({ todo }) => todo.id === active.id,
			);
			const newIndex = orderedTodos.findIndex(
				({ todo }) => todo.id === over.id,
			);

			const newOrder = arrayMove(orderedTodos, oldIndex, newIndex).map(
				({ todo }) => todo.id,
			);
			reorderTodos(newOrder);
		}

		setActiveId(null);
	};

	const handleDragCancel = () => {
		setActiveId(null);
	};

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

	const handleCreateTodo = (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		if (!newTodoName.trim()) return;

		const input: CreateTodoInput = {
			name: newTodoName.trim(),
		};

		addTodo(input);
		setNewTodoName("");
		setIsCreatingInline(false);
	};

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部标题和工具栏 */}
			<div className="shrink-0 bg-background">
				{/* 标题 */}
				<div className="flex items-center justify-between px-4 py-3">
					<h2 className="text-lg font-semibold text-foreground">Todo List</h2>

					{/* 搜索 */}
					<div className="flex items-center gap-2">
						{/* 搜索栏 */}
						<div className="relative">
							<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<input
								type="text"
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder="Search tasks..."
								className="w-48 rounded-md border border-border bg-background px-8 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							/>
						</div>
					</div>
				</div>

				{/* 过滤按钮 */}
				<div className="flex items-center gap-2 px-4 pb-3">
					{(["all", "active", "completed", "canceled"] as const).map(
						(status) => (
							<button
								key={status}
								type="button"
								onClick={() => setFilterStatus(status)}
								className={cn(
									"rounded-full px-3 py-1 text-xs font-medium transition-colors",
									filterStatus === status
										? "bg-primary text-primary-foreground"
										: "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
								)}
							>
								{status === "all"
									? "All"
									: status.charAt(0).toUpperCase() + status.slice(1)}
							</button>
						),
					)}
				</div>
			</div>

			{/* 任务列表 */}
			<div className="flex-1 overflow-y-auto">
				<div className="px-4 pb-4">
					{isCreatingInline ? (
						<form
							onSubmit={handleCreateTodo}
							className="flex flex-col gap-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-4 sm:flex-row sm:items-center sm:gap-3"
						>
							<input
								type="text"
								value={newTodoName}
								onChange={(e) => setNewTodoName(e.target.value)}
								placeholder="输入待办名称..."
								className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
								required
							/>
							<div className="flex items-center gap-2 sm:justify-end">
								<button
									type="button"
									onClick={() => {
										setIsCreatingInline(false);
										setNewTodoName("");
									}}
									className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
								>
									取消
								</button>
								<button
									type="submit"
									className="inline-flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
								>
									<Plus className="h-4 w-4" />
									创建
								</button>
							</div>
						</form>
					) : (
						<button
							type="button"
							onClick={() => setIsCreatingInline(true)}
							className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/10"
						>
							<Plus className="h-4 w-4" />
							创建待办
						</button>
					)}
				</div>

				{filteredTodos.length === 0 ? (
					<div className="flex h-[200px] items-center justify-center px-4 text-sm text-muted-foreground">
						暂无待办事项
					</div>
				) : (
					<DndContext
						sensors={sensors}
						collisionDetection={closestCenter}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
						onDragCancel={handleDragCancel}
					>
						<SortableContext
							items={orderedTodos.map(({ todo }) => todo.id)}
							strategy={verticalListSortingStrategy}
						>
							<div className={cn("px-4 pb-6 flex flex-col gap-0")}>
								{orderedTodos.map(({ todo, depth }) => (
									<div
										key={todo.id}
										style={{ marginLeft: depth * 16 }}
										className={depth > 0 ? "relative" : undefined}
									>
										<TodoCard
											todo={todo}
											isDragging={activeId === todo.id}
											selected={selectedTodoIds.includes(todo.id)}
											onSelect={(event) => handleSelect(todo.id, event)}
											onSelectSingle={() => setSelectedTodoId(todo.id)}
										/>
									</div>
								))}
							</div>
						</SortableContext>

						<DragOverlay>
							{activeTodo ? (
								<div
									className="opacity-50"
									style={{ marginLeft: (activeTodoEntry?.depth ?? 0) * 16 }}
								>
									<TodoCard
										todo={activeTodo}
										isDragging
										selected={selectedTodoIds.includes(activeTodo.id)}
										onSelect={(event) => handleSelect(activeTodo.id, event)}
										onSelectSingle={() => setSelectedTodoId(activeTodo.id)}
									/>
								</div>
							) : null}
						</DragOverlay>
					</DndContext>
				)}
			</div>
		</div>
	);
}
