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
	Check,
	Grid,
	GripVertical,
	List,
	Paperclip,
	Plus,
	Search,
	Star,
	X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useTodoStore } from "@/lib/store/todo-store";
import type {
	CreateTodoInput,
	Todo,
	TodoPriority,
	TodoStatus,
} from "@/lib/types/todo";
import { cn } from "@/lib/utils";

interface TodoItemProps {
	todo: Todo;
	isDragging?: boolean;
}

function TodoItem({ todo, isDragging }: TodoItemProps) {
	const { toggleTodoStatus, toggleStarred, setSelectedTodoId } = useTodoStore();
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging: isSortableDragging,
	} = useSortable({ id: todo.id });

	const completedSubtasks =
		todo.subtasks?.filter((st) => st.completed).length ?? 0;
	const totalSubtasks = todo.subtasks?.length ?? 0;
	const hasSubtasks = totalSubtasks > 0;

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
			case "pending":
				return "bg-blue-500/20 text-blue-600 dark:text-blue-400 border-blue-500/30";
			case "in-progress":
				return "bg-purple-500/20 text-purple-600 dark:text-purple-400 border-purple-500/30";
			case "completed":
				return "bg-green-500/20 text-green-600 dark:text-green-400 border-green-500/30";
			default:
				return "";
		}
	};

	const getPriorityColor = (priority?: TodoPriority) => {
		switch (priority) {
			case "high":
				return "bg-red-500/20 text-red-600 dark:text-red-400 border-red-500/30";
			case "medium":
				return "bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-500/30";
			case "low":
				return "bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30";
			default:
				return "";
		}
	};

	const getStatusLabel = (status: TodoStatus) => {
		switch (status) {
			case "pending":
				return "Pending";
			case "in-progress":
				return "In Progress";
			case "completed":
				return "Completed";
			default:
				return status;
		}
	};

	const getPriorityLabel = (priority?: TodoPriority) => {
		switch (priority) {
			case "high":
				return "High";
			case "medium":
				return "Medium";
			case "low":
				return "Low";
			default:
				return "";
		}
	};

	const style = {
		transform: CSS.Transform.toString(transform),
		transition: isSortableDragging ? "none" : transition, // 拖拽时禁用过渡动画，避免位置偏移
		opacity: isSortableDragging ? 0.5 : 1,
	};

	return (
		<button
			type="button"
			ref={setNodeRef}
			style={style}
			onClick={() => setSelectedTodoId(todo.id)}
			className={cn(
				"group relative flex w-full items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer text-left bg-transparent border-0",
				isDragging && "opacity-50",
			)}
		>
			{/* 拖拽手柄 */}
			<button
				type="button"
				{...attributes}
				{...listeners}
				className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity self-center"
			>
				<GripVertical className="h-4 w-4" />
			</button>

			{/* 复选框 */}
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
						<Check className="h-3.5 w-3.5 text-white" />
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
								{todo.title}
							</h3>
							{/* 星标 */}
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									toggleStarred(todo.id);
								}}
								className="shrink-0"
							>
								<Star
									className={cn(
										"h-4 w-4 transition-colors",
										todo.starred
											? "fill-yellow-400 text-yellow-400"
											: "text-muted-foreground hover:text-yellow-400",
									)}
								/>
							</button>
						</div>

						{/* 分配人员、日期、附件、子任务 */}
						<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							{/* 分配人员 */}
							{todo.assignedTo && todo.assignedTo.length > 0 && (
								<div className="flex items-center gap-1.5">
									{todo.assignedTo.map((user) => (
										<span
											key={user.id}
											className="px-2 py-0.5 rounded-full bg-muted text-xs font-medium"
										>
											{user.name}
										</span>
									))}
								</div>
							)}

							{/* 截止日期 */}
							{todo.dueDate && (
								<div className="flex items-center gap-1">
									<Calendar className="h-3 w-3" />
									<span>{formatDate(todo.dueDate)}</span>
								</div>
							)}

							{/* 附件图标（占位） */}
							{todo.dueDate && <Paperclip className="h-3 w-3" />}

							{/* 子任务进度 */}
							{hasSubtasks && (
								<span>
									{completedSubtasks}/{totalSubtasks}
								</span>
							)}
						</div>
					</div>

					{/* 状态和优先级标签 */}
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

						{/* 优先级标签 */}
						{todo.priority && (
							<span
								className={cn(
									"px-2 py-0.5 rounded-full text-xs font-medium border",
									getPriorityColor(todo.priority),
								)}
							>
								{getPriorityLabel(todo.priority)}
							</span>
						)}
					</div>
				</div>
			</div>
		</button>
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
	const [newTodoTitle, setNewTodoTitle] = useState("");
	const [newTodoDueDate, setNewTodoDueDate] = useState("");
	const [newTodoSubtasks, setNewTodoSubtasks] = useState<
		Array<{ id: string; title: string }>
	>([]);

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
					todo.title.toLowerCase().includes(query) ||
					todo.assignedTo?.some((user) =>
						user.name.toLowerCase().includes(query),
					),
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
		if (!newTodoTitle.trim()) return;

		const input: CreateTodoInput = {
			title: newTodoTitle.trim(),
			dueDate: newTodoDueDate || undefined,
			subtasks:
				newTodoSubtasks.length > 0
					? newTodoSubtasks
							.filter((st) => st.title.trim())
							.map((st) => ({
								title: st.title.trim(),
								completed: false,
							}))
					: undefined,
		};

		addTodo(input);
		setNewTodoTitle("");
		setNewTodoDueDate("");
		setNewTodoSubtasks([]);
		setIsCreateModalOpen(false);
	};

	const addSubtask = () => {
		setNewTodoSubtasks([
			...newTodoSubtasks,
			{ id: crypto.randomUUID(), title: "" },
		]);
	};

	const removeSubtask = (id: string) => {
		setNewTodoSubtasks(newTodoSubtasks.filter((st) => st.id !== id));
	};

	const updateSubtask = (id: string, title: string) => {
		setNewTodoSubtasks(
			newTodoSubtasks.map((st) => (st.id === id ? { ...st, title } : st)),
		);
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
					{(["all", "pending", "in-progress", "completed"] as const).map(
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
									: status === "in-progress"
										? "In Progress"
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
				<button
					type="button"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 border-0 cursor-default"
					onClick={() => setIsCreateModalOpen(false)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							setIsCreateModalOpen(false);
						}
					}}
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
									htmlFor="todo-title"
									className="mb-1 block text-sm font-medium text-foreground"
								>
									任务标题
								</label>
								<input
									id="todo-title"
									type="text"
									value={newTodoTitle}
									onChange={(e) => setNewTodoTitle(e.target.value)}
									placeholder="输入任务标题..."
									className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
									required
								/>
							</div>

							<div>
								<label
									htmlFor="todo-due-date"
									className="mb-1 block text-sm font-medium text-foreground"
								>
									截止日期
								</label>
								<input
									id="todo-due-date"
									type="date"
									value={newTodoDueDate}
									onChange={(e) => setNewTodoDueDate(e.target.value)}
									className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
								/>
							</div>

							<div>
								<div className="mb-2 flex items-center justify-between">
									<div className="text-sm font-medium text-foreground">
										子任务
									</div>
									<button
										type="button"
										onClick={addSubtask}
										className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
									>
										<Plus className="h-3 w-3" />
										添加子任务
									</button>
								</div>
								{newTodoSubtasks.length > 0 && (
									<div className="space-y-2">
										{newTodoSubtasks.map((subtask) => (
											<div key={subtask.id} className="flex items-center gap-2">
												<input
													type="text"
													value={subtask.title}
													onChange={(e) =>
														updateSubtask(subtask.id, e.target.value)
													}
													placeholder="子任务标题..."
													className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
												/>
												<button
													type="button"
													onClick={() => removeSubtask(subtask.id)}
													className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
												>
													<X className="h-4 w-4" />
												</button>
											</div>
										))}
									</div>
								)}
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
				</button>
			)}
		</div>
	);
}
