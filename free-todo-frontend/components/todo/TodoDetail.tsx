"use client";

import {
	Calendar,
	Info,
	Paperclip,
	Tag as TagIcon,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTodoStore } from "@/lib/store/todo-store";
import type { TodoStatus } from "@/lib/types/todo";
import { cn } from "@/lib/utils";

export function TodoDetail() {
	const {
		todos,
		selectedTodoId,
		updateTodo,
		toggleTodoStatus,
		deleteTodo,
		setSelectedTodoId,
	} = useTodoStore();

	const [showDescription, setShowDescription] = useState(false);
	const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
	const notesRef = useRef<HTMLTextAreaElement | null>(null);
	const statusMenuRef = useRef<HTMLDivElement | null>(null);

	const statusOptions: TodoStatus[] = ["active", "completed", "canceled"];

	const getStatusClassNames = (status: TodoStatus) =>
		cn(
			"rounded-full border px-2 py-0.5 text-xs font-medium",
			status === "completed"
				? "border-green-500/50 text-green-600"
				: status === "canceled"
					? "border-gray-500/50 text-gray-500"
					: "border-blue-500/50 text-blue-600",
		);

	const adjustNotesHeight = useCallback(() => {
		const el = notesRef.current;
		if (!el) return;

		el.style.height = "auto";

		// 预留底部 dock 的高度和一点空隙，避免遮挡
		const BOTTOM_DOCK_ESTIMATED_HEIGHT = 84;
		const SAFE_GAP = 16;
		const MIN_HEIGHT = 120;

		const availableHeight =
			typeof window !== "undefined"
				? Math.max(
						MIN_HEIGHT,
						window.innerHeight -
							el.getBoundingClientRect().top -
							(BOTTOM_DOCK_ESTIMATED_HEIGHT + SAFE_GAP),
					)
				: el.scrollHeight;

		const nextHeight = Math.min(el.scrollHeight, availableHeight);
		el.style.height = `${nextHeight}px`;
	}, []);

	const todo = selectedTodoId
		? todos.find((t) => t.id === selectedTodoId)
		: null;

	useEffect(() => {
		if (!todo) return;
		adjustNotesHeight();
		const handleResize = () => adjustNotesHeight();
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	}, [adjustNotesHeight, todo]);

	// 点击其他区域或按下 ESC 时关闭状态下拉
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				statusMenuRef.current &&
				!statusMenuRef.current.contains(event.target as Node)
			) {
				setIsStatusMenuOpen(false);
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsStatusMenuOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	// 切换 todo 时关闭下拉
	useEffect(() => {
		if (todo?.id === undefined) {
			return;
		}
		setIsStatusMenuOpen(false);
	}, [todo?.id]);

	if (!todo) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				请选择一个待办事项查看详情
			</div>
		);
	}

	const handleNotesChange = (userNotes: string) => {
		updateTodo(todo.id, { userNotes });
		requestAnimationFrame(adjustNotesHeight);
	};

	const handleStatusChange = (status: TodoStatus) => {
		if (status !== todo.status) {
			updateTodo(todo.id, { status });
		}
		setIsStatusMenuOpen(false);
	};

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部导航栏 */}
			<div className="flex shrink-0 items-center justify-between px-4 py-3">
				{/* 右侧操作按钮 */}
				<div className="flex items-center gap-3">
					<button
						type="button"
						onClick={() => toggleTodoStatus(todo.id)}
						className="text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						Mark as complete
					</button>
					<button
						type="button"
						onClick={() => {
							deleteTodo(todo.id);
							setSelectedTodoId(null);
						}}
						className="flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-sm text-destructive hover:bg-destructive/10 transition-colors"
					>
						<Trash2 className="h-4 w-4" />
						<span>Delete</span>
					</button>
				</div>
			</div>

			{/* 内容区域 */}
			<div className="flex-1 overflow-y-auto px-4 py-6">
				{/* 待办标题 */}
				<div className="mb-4 flex items-center justify-between gap-3">
					<h1 className="text-3xl font-bold text-foreground">{todo.name}</h1>
					<button
						type="button"
						onClick={() => setShowDescription((prev) => !prev)}
						aria-pressed={showDescription}
						aria-label="查看描述"
						className={cn(
							"rounded-md border px-2 py-1 transition-colors",
							showDescription
								? "border-primary/60 bg-primary/10 text-primary"
								: "border-border text-muted-foreground hover:bg-muted/40",
						)}
					>
						<Info className="h-5 w-5" />
					</button>
				</div>

				{/* 元信息 */}
				<div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
					<div className="relative" ref={statusMenuRef}>
						<button
							type="button"
							onClick={() => setIsStatusMenuOpen((prev) => !prev)}
							className={cn(
								getStatusClassNames(todo.status),
								"transition-colors hover:bg-muted/40",
							)}
							aria-expanded={isStatusMenuOpen}
							aria-haspopup="listbox"
						>
							{todo.status}
						</button>
						{isStatusMenuOpen && (
							<div className="absolute z-[120] mt-2 min-w-[170px] rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg pointer-events-auto">
								<div className="py-1" role="listbox">
									{statusOptions.map((status) => (
										<button
											key={status}
											type="button"
											onClick={() => handleStatusChange(status)}
											className={cn(
												"flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors",
												status === todo.status
													? "bg-muted/60 text-foreground"
													: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
											)}
											role="option"
											aria-selected={status === todo.status}
										>
											<span className={getStatusClassNames(status)}>
												{status}
											</span>
											{status === todo.status && (
												<span className="text-[11px] text-primary">当前</span>
											)}
										</button>
									))}
								</div>
							</div>
						)}
					</div>
					{todo.deadline && (
						<span className="flex items-center gap-1">
							<Calendar className="h-4 w-4" />
							{new Date(todo.deadline).toLocaleString()}
						</span>
					)}
					{todo.tags && todo.tags.length > 0 && (
						<span className="flex items-center gap-1">
							<TagIcon className="h-4 w-4" />
							{todo.tags.join(", ")}
						</span>
					)}
				</div>

				{/* 描述（可选显示） */}
				{showDescription && (
					<div className="mb-8">
						<h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							Description
						</h2>
						<div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">
							{todo.description || "暂无描述"}
						</div>

						{todo.attachments && todo.attachments.length > 0 && (
							<div className="mt-6">
								<h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
									Attachments
								</h3>
								<div className="space-y-2">
									{todo.attachments.map((file) => (
										<div
											key={file.id}
											className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
										>
											<Paperclip className="h-4 w-4 text-muted-foreground" />
											<div className="flex-1 truncate">
												<div className="font-medium text-foreground">
													{file.fileName}
												</div>
												<div className="text-xs text-muted-foreground">
													{file.mimeType || "unknown"}
												</div>
											</div>
										</div>
									))}
								</div>
							</div>
						)}
					</div>
				)}

				{/* Notes 主面板 */}
				<textarea
					ref={notesRef}
					value={todo.userNotes || ""}
					onChange={(e) => handleNotesChange(e.target.value)}
					placeholder="Insert your notes here"
					className="mb-8 w-full min-h-[120px] resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
				/>
			</div>
		</div>
	);
}
