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
	Grid,
	GripVertical,
	List,
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

interface TodoItemProps {
	todo: Todo;
	isDragging?: boolean;
}

function TodoItem({ todo, isDragging }: TodoItemProps) {
	const { toggleTodoStatus, deleteTodo, setSelectedTodoId, updateTodo } =
		useTodoStore();
	const [contextMenu, setContextMenu] = useState({
		open: false,
		x: 0,
		y: 0,
	});
	const menuRef = useRef<HTMLDivElement | null>(null);
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging: isSortableDragging,
	} = useSortable({ id: todo.id });

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

	const style = {
		transform: CSS.Transform.toString(transform),
		transition: isSortableDragging ? "none" : transition, // 拖拽时禁用过渡动画，避免位置偏移
		opacity: isSortableDragging ? 0.5 : 1,
	};

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

	const openContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
		event.preventDefault();
		event.stopPropagation();
		setSelectedTodoId(todo.id);

		const menuWidth = 180;
		const menuHeight = 56;
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

	return (
		<>
			<div
				ref={setNodeRef}
				style={style}
				role="button"
				tabIndex={0}
				onClick={() => setSelectedTodoId(todo.id)}
				onContextMenu={openContextMenu}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						setSelectedTodoId(todo.id);
					}
				}}
				className={cn(
					"group relative flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer",
					isDragging && "opacity-50",
				)}
			>
				{/* 拖拽手柄 */}
				<div
					{...attributes}
					{...listeners}
					className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity self-center"
				>
					<GripVertical className="h-4 w-4" />
				</div>

				{/* 状态切换 */}
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						toggleTodoStatus(todo.id);
					}}
					className="shrink-0"
				>
					{todo.status === "completed" ? (
						<div className="flex h-5 w-5 items-center justify-center rounded-md bg-green-500 dark:bg-green-400 border border-green-600 dark:border-green-500">
							<span className="text-[10px] text-white font-semibold">✓</span>
						</div>
					) : (
						<div className="h-5 w-5 rounded-md border-2 border-muted-foreground/40 hover:border-foreground transition-colors" />
					)}
				</button>

				{/* 内容区域 */}
				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-2">
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<h3
									className={cn(
										"text-sm font-medium text-foreground",
										todo.status === "completed" &&
											"line-through text-muted-foreground",
									)}
								>
									{todo.name}
								</h3>
							</div>

							{/* 日期、附件、标签 */}
							<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
								{/* 截止日期 */}
								{todo.deadline && (
									<div className="flex items-center gap-1">
										<Calendar className="h-3 w-3" />
										<span>{formatDate(todo.deadline)}</span>
									</div>
								)}

								{/* 附件数量 */}
								{todo.attachments && todo.attachments.length > 0 && (
									<div className="flex items-center gap-1">
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

						{/* 状态和附件提示 */}
						<div className="flex items-center gap-2 shrink-0">
							{/* 状态标签 */}
							{todo.status && (
								<span
									className={cn(
										"px-2 py-0.5 rounded-full text-xs font-medium border",
										getStatusColor(todo.status),
									)}
								>
									{getStatusLabel(todo.status)}
								</span>
							)}
							{/* 附件提示 */}
							{todo.attachments && todo.attachments.length > 0 && (
								<span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
									<Paperclip className="h-3 w-3" />
									{todo.attachments.length}
								</span>
							)}
						</div>
					</div>
				</div>
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

type FilterStatus = "all" | TodoStatus;
type ViewMode = "list" | "grid";

export function TodoList() {
	const { todos, reorderTodos, addTodo } = useTodoStore();
	const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [viewMode, setViewMode] = useState<ViewMode>("list");
	const [activeId, setActiveId] = useState<string | null>(null);
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [newTodoName, setNewTodoName] = useState("");
	const [newTodoDeadline, setNewTodoDeadline] = useState("");
	const [newTodoDescription, setNewTodoDescription] = useState("");
	const [newTodoTags, setNewTodoTags] = useState<string>("");

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

	// 获取拖拽中的任务
	const activeTodo = activeId
		? filteredTodos.find((todo) => todo.id === activeId)
		: null;

	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(event.active.id as string);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (over && active.id !== over.id) {
			const oldIndex = filteredTodos.findIndex((todo) => todo.id === active.id);
			const newIndex = filteredTodos.findIndex((todo) => todo.id === over.id);

			const newOrder = arrayMove(filteredTodos, oldIndex, newIndex).map(
				(todo) => todo.id,
			);
			reorderTodos(newOrder);
		}

		setActiveId(null);
	};

	const handleDragCancel = () => {
		setActiveId(null);
	};

	const handleCreateTodo = (e: React.FormEvent) => {
		e.preventDefault();
		if (!newTodoName.trim()) return;

		const input: CreateTodoInput = {
			name: newTodoName.trim(),
			description: newTodoDescription.trim() || undefined,
			deadline: newTodoDeadline || undefined,
			tags:
				newTodoTags
					.split(",")
					.map((t) => t.trim())
					.filter(Boolean) || [],
		};

		addTodo(input);
		setNewTodoName("");
		setNewTodoDeadline("");
		setNewTodoDescription("");
		setNewTodoTags("");
		setIsCreateModalOpen(false);
	};

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部标题和工具栏 */}
			<div className="shrink-0 bg-background">
				{/* 标题 */}
				<div className="flex items-center justify-between px-4 py-3">
					<h2 className="text-lg font-semibold text-foreground">Todo List</h2>

					{/* 搜索和视图切换 */}
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

						{/* 视图切换按钮 */}
						<div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-1">
							<button
								type="button"
								onClick={() => setViewMode("list")}
								className={cn(
									"rounded px-2 py-1 transition-colors",
									viewMode === "list"
										? "bg-background text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<List className="h-4 w-4" />
							</button>
							<button
								type="button"
								onClick={() => setViewMode("grid")}
								className={cn(
									"rounded px-2 py-1 transition-colors",
									viewMode === "grid"
										? "bg-background text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<Grid className="h-4 w-4" />
							</button>
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
				{filteredTodos.length === 0 ? (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
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
							items={filteredTodos.map((todo) => todo.id)}
							strategy={verticalListSortingStrategy}
						>
							<div>
								{filteredTodos.map((todo) => (
									<TodoItem
										key={todo.id}
										todo={todo}
										isDragging={activeId === todo.id}
									/>
								))}
							</div>
						</SortableContext>

						<DragOverlay>
							{activeTodo ? (
								<div className="opacity-50">
									<TodoItem todo={activeTodo} isDragging />
								</div>
							) : null}
						</DragOverlay>
					</DndContext>
				)}
			</div>

			{/* 浮动操作按钮 */}
			<button
				type="button"
				onClick={() => setIsCreateModalOpen(true)}
				className="absolute bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all hover:scale-110 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
			>
				<Plus className="h-6 w-6" />
			</button>

			{/* 创建任务模态框 */}
			{isCreateModalOpen && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
					onClick={() => setIsCreateModalOpen(false)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							setIsCreateModalOpen(false);
						}
					}}
					role="button"
					tabIndex={0}
				>
					<div
						role="dialog"
						className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
					>
						<div className="mb-4 flex items-center justify-between">
							<h3 className="text-lg font-semibold text-foreground">
								创建新任务
							</h3>
							<button
								type="button"
								onClick={() => setIsCreateModalOpen(false)}
								className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
							>
								<X className="h-5 w-5" />
							</button>
						</div>

						<form onSubmit={handleCreateTodo} className="space-y-4">
							<div>
								<label
									htmlFor="todo-name"
									className="mb-1 block text-sm font-medium text-foreground"
								>
									待办名称
								</label>
								<input
									id="todo-name"
									type="text"
									value={newTodoName}
									onChange={(e) => setNewTodoName(e.target.value)}
									placeholder="输入待办名称..."
									className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
									required
								/>
							</div>

							<div>
								<label
									htmlFor="todo-deadline"
									className="mb-1 block text-sm font-medium text-foreground"
								>
									截止日期
								</label>
								<input
									id="todo-deadline"
									type="date"
									value={newTodoDeadline}
									onChange={(e) => setNewTodoDeadline(e.target.value)}
									className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
								/>
							</div>

							<div>
								<label
									htmlFor="todo-description"
									className="mb-1 block text-sm font-medium text-foreground"
								>
									描述
								</label>
								<textarea
									id="todo-description"
									value={newTodoDescription}
									onChange={(e) => setNewTodoDescription(e.target.value)}
									placeholder="描述该待办的详情..."
									className="w-full min-h-[80px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
								/>
							</div>

							<div>
								<label
									htmlFor="todo-tags"
									className="mb-1 block text-sm font-medium text-foreground"
								>
									标签（逗号分隔）
								</label>
								<input
									id="todo-tags"
									type="text"
									value={newTodoTags}
									onChange={(e) => setNewTodoTags(e.target.value)}
									placeholder="例如：工作, 报告"
									className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
								/>
							</div>

							<div className="flex items-center justify-end gap-2 pt-4">
								<button
									type="button"
									onClick={() => setIsCreateModalOpen(false)}
									className="rounded-md px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
								>
									取消
								</button>
								<button
									type="submit"
									className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
								>
									创建
								</button>
							</div>
						</form>
					</div>
				</div>
			)}
		</div>
	);
}
