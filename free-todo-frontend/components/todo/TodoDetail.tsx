"use client";

import {
	Calendar,
	Info,
	Paperclip,
	Plus,
	Tag as TagIcon,
	Trash2,
} from "lucide-react";
import {
	type FormEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
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
		addTodo,
	} = useTodoStore();

	const [showDescription, setShowDescription] = useState(false);
	const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
	const [isEditingDeadline, setIsEditingDeadline] = useState(false);
	const [deadlineInput, setDeadlineInput] = useState("");
	const [isEditingTags, setIsEditingTags] = useState(false);
	const [tagsInput, setTagsInput] = useState("");
	const [isAddingChild, setIsAddingChild] = useState(false);
	const [childName, setChildName] = useState("");
	// 子待办仅需要名称，保持交互简洁
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
	const childTodos =
		todo?.id != null
			? todos.filter((item) => item.parentTodoId === todo.id)
			: [];

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

	const formatDeadlineForInput = useCallback((value?: string) => {
		if (!value) return "";
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return "";
		const offsetMs = date.getTimezoneOffset() * 60 * 1000;
		const local = new Date(date.getTime() - offsetMs);
		return local.toISOString().slice(0, 16);
	}, []);

	const parseInputToIso = (value: string) => {
		if (!value) return undefined;
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return undefined;
		return date.toISOString();
	};

	const formatDateTime = useCallback((value?: string) => {
		if (!value) return "";
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return "";
		return date.toLocaleString();
	}, []);

	const getChildProgress = useCallback(
		(todoId: string) => {
			const children = todos.filter((item) => item.parentTodoId === todoId);
			const completed = children.filter(
				(item) => item.status === "completed",
			).length;
			return { completed, total: children.length };
		},
		[todos],
	);

	const syncInlineEditors = useCallback(() => {
		setIsEditingDeadline(false);
		setIsEditingTags(false);
		setDeadlineInput(formatDeadlineForInput(todo?.deadline));
		setTagsInput(todo?.tags?.join(", ") ?? "");
	}, [formatDeadlineForInput, todo?.deadline, todo?.tags]);

	useEffect(() => {
		syncInlineEditors();
	}, [syncInlineEditors]);

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

	const handleDeadlineSave = () => {
		const nextDeadline = parseInputToIso(deadlineInput);
		updateTodo(todo.id, {
			deadline: deadlineInput.trim() === "" ? undefined : nextDeadline,
		});
		setIsEditingDeadline(false);
	};

	const handleDeadlineClear = () => {
		updateTodo(todo.id, { deadline: undefined });
		setDeadlineInput("");
		setIsEditingDeadline(false);
	};

	const handleTagsSave = () => {
		const parsedTags = tagsInput
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
		updateTodo(todo.id, { tags: parsedTags });
		setIsEditingTags(false);
	};

	const handleTagsClear = () => {
		updateTodo(todo.id, { tags: [] });
		setTagsInput("");
		setIsEditingTags(false);
	};

	const handleCreateChildTodo = (e?: FormEvent) => {
		if (e) {
			e.preventDefault();
		}
		if (!todo?.id) return;
		const name = childName.trim();
		if (!name) return;

		addTodo({
			name,
			parentTodoId: todo.id,
		});

		setChildName("");
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
				<div className="mb-6 text-sm text-muted-foreground">
					<div className="flex flex-wrap items-center gap-3">
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

						<button
							type="button"
							onClick={() => {
								setDeadlineInput(formatDeadlineForInput(todo.deadline));
								setIsEditingDeadline(true);
							}}
							className="flex items-center gap-1 rounded-md border border-transparent px-2 py-1 transition-colors hover:border-border hover:bg-muted/40"
						>
							<Calendar className="h-4 w-4" />
							<span className="truncate">
								{todo.deadline
									? new Date(todo.deadline).toLocaleString()
									: "添加截止时间"}
							</span>
						</button>

						<button
							type="button"
							onClick={() => {
								setTagsInput(todo.tags?.join(", ") ?? "");
								setIsEditingTags(true);
							}}
							className="flex items-center gap-1 rounded-md border border-transparent px-2 py-1 transition-colors hover:border-border hover:bg-muted/40"
						>
							<TagIcon className="h-4 w-4" />
							<span className="truncate">
								{todo.tags && todo.tags.length > 0
									? todo.tags.join(", ")
									: "添加标签"}
							</span>
						</button>
					</div>

					{isEditingDeadline && (
						<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground">
							<input
								type="datetime-local"
								value={deadlineInput}
								onChange={(e) => setDeadlineInput(e.target.value)}
								className="min-w-[240px] rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
							/>
							<button
								type="button"
								onClick={handleDeadlineSave}
								className="rounded-md bg-primary px-2 py-1 text-white transition-colors hover:bg-primary/90"
							>
								保存
							</button>
							<button
								type="button"
								onClick={syncInlineEditors}
								className="rounded-md border border-border px-2 py-1 text-muted-foreground transition-colors hover:bg-muted/40"
							>
								取消
							</button>
							<button
								type="button"
								onClick={handleDeadlineClear}
								className="rounded-md border border-destructive/40 px-2 py-1 text-destructive transition-colors hover:bg-destructive/10"
							>
								清空
							</button>
						</div>
					)}

					{isEditingTags && (
						<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground">
							<input
								type="text"
								value={tagsInput}
								onChange={(e) => setTagsInput(e.target.value)}
								placeholder="使用逗号分隔多个标签"
								className="min-w-[240px] rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
							/>
							<button
								type="button"
								onClick={handleTagsSave}
								className="rounded-md bg-primary px-2 py-1 text-white transition-colors hover:bg-primary/90"
							>
								保存
							</button>
							<button
								type="button"
								onClick={syncInlineEditors}
								className="rounded-md border border-border px-2 py-1 text-muted-foreground transition-colors hover:bg-muted/40"
							>
								取消
							</button>
							<button
								type="button"
								onClick={handleTagsClear}
								className="rounded-md border border-destructive/40 px-2 py-1 text-destructive transition-colors hover:bg-destructive/10"
							>
								清空
							</button>
						</div>
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

				{/* 子待办：放在面板底部，默认仅展示列表 */}
				<div className="mb-4">
					<div className="mb-2 flex items-center justify-between">
						<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							子待办
							{childTodos.length > 0 && (
								<span className="ml-1">
									{childTodos.filter((c) => c.status === "completed").length}/
									{childTodos.length}
								</span>
							)}
						</div>
					</div>

					<div className="space-y-1">
						{childTodos.map((child) => {
							const { completed, total } = getChildProgress(child.id);
							return (
								<button
									type="button"
									key={child.id}
									onClick={() => setSelectedTodoId(child.id)}
									className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-muted/40"
								>
									<div className="flex flex-col gap-1">
										<div className="flex items-center gap-2">
											<span className="inline-flex h-4 w-4 items-center justify-center rounded-md border-2 border-muted-foreground/60" />
											<span className="text-sm font-semibold text-foreground">
												{child.name}
											</span>
										</div>
										<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
											{child.deadline && (
												<div className="flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1">
													<Calendar className="h-3 w-3" />
													<span>{formatDateTime(child.deadline)}</span>
												</div>
											)}
											{child.tags && child.tags.length > 0 && (
												<div className="flex items-center gap-1">
													<TagIcon className="h-3 w-3" />
													<div className="flex flex-wrap items-center gap-1">
														{child.tags.map((tag) => (
															<span
																key={tag}
																className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground"
															>
																{tag}
															</span>
														))}
													</div>
												</div>
											)}
										</div>
									</div>
									{total > 0 && (
										<span className="text-xs text-muted-foreground">
											{completed}/{total}
										</span>
									)}
								</button>
							);
						})}
					</div>

					{isAddingChild ? (
						<form
							onSubmit={handleCreateChildTodo}
							className="mt-2 flex flex-wrap items-center gap-2"
						>
							<input
								type="text"
								value={childName}
								onChange={(e) => setChildName(e.target.value)}
								placeholder="输入子待办名称..."
								className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							/>
							<button
								type="submit"
								className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
							>
								<Plus className="h-4 w-4" />
								添加
							</button>
							<button
								type="button"
								onClick={() => {
									setIsAddingChild(false);
									setChildName("");
								}}
								className="rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60 transition-colors"
							>
								取消
							</button>
						</form>
					) : (
						<button
							type="button"
							onClick={() => {
								setIsAddingChild(true);
								setChildName("");
							}}
							className="mt-2 flex w-full items-center gap-2 rounded-lg px-1 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/40"
						>
							<Plus className="h-4 w-4" />
							<span>添加子待办</span>
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
