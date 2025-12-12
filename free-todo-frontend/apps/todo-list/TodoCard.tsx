"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, Flag, Paperclip, Plus, Tag, Trash2, X } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTodoStore } from "@/lib/store/todo-store";
import type { Todo, TodoPriority, TodoStatus } from "@/lib/types/todo";
import { cn } from "@/lib/utils";

export interface TodoCardProps {
	todo: Todo;
	isDragging?: boolean;
	selected?: boolean;
	isOverlay?: boolean;
	onSelect: (e: React.MouseEvent<HTMLDivElement>) => void;
	onSelectSingle: () => void;
}

export function TodoCard({
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

	const getPriorityColor = (priority: TodoPriority) => {
		switch (priority) {
			case "high":
				return "text-red-500";
			case "medium":
				return "text-amber-500";
			case "low":
				return "text-emerald-500";
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

							<div className="flex items-center gap-2 shrink-0">
								<div
									className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground"
									title={`优先级：${getPriorityLabel(todo.priority ?? "none")}`}
								>
									<Flag
										className={cn(
											"h-3.5 w-3.5",
											getPriorityColor(todo.priority ?? "none"),
										)}
										fill="currentColor"
									/>
									<span>{getPriorityLabel(todo.priority ?? "none")}</span>
								</div>
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
