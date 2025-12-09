"use client";

import {
	Bell,
	Check,
	Circle,
	FileText,
	Hash,
	Lock,
	MoreVertical,
	Share2,
} from "lucide-react";
import { useState } from "react";
import { useTodoStore } from "@/lib/store/todo-store";
import { cn } from "@/lib/utils";

export function TodoDetail() {
	const { todos, selectedTodoId, updateTodo, toggleTodoStatus, toggleSubtask } =
		useTodoStore();
	const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
	const [isAddingSubtask, setIsAddingSubtask] = useState(false);

	const todo = selectedTodoId
		? todos.find((t) => t.id === selectedTodoId)
		: null;

	if (!todo) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				请选择一个待办事项查看详情
			</div>
		);
	}

	const completedSubtasks =
		todo.subtasks?.filter((st) => st.completed).length ?? 0;
	const totalSubtasks = todo.subtasks?.length ?? 0;

	const handleAddSubtask = () => {
		if (!newSubtaskTitle.trim()) return;

		const currentSubtasks = todo.subtasks || [];
		updateTodo(todo.id, {
			subtasks: [
				...currentSubtasks,
				{
					id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
					title: newSubtaskTitle.trim(),
					completed: false,
				},
			],
		});

		setNewSubtaskTitle("");
		setIsAddingSubtask(false);
	};

	const handleNotesChange = (notes: string) => {
		updateTodo(todo.id, { notes });
	};

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部导航栏 */}
			<div className="flex shrink-0 items-center justify-between px-4 py-3">
				{/* 面包屑导航 */}
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Lock className="h-4 w-4" />
					<span>My lists</span>
					<span>/</span>
					<span className="text-foreground">个人事务</span>
				</div>

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
						className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
					>
						<Circle className="h-4 w-4" />
					</button>
					<button
						type="button"
						className="rounded-md p-1.5 text-muted-foreground hover:bg-muted transition-colors"
					>
						<Share2 className="h-4 w-4" />
					</button>
				</div>
			</div>

			{/* 内容区域 */}
			<div className="flex-1 overflow-y-auto px-4 py-6">
				{/* 待办标题 */}
				<h1 className="mb-4 text-3xl font-bold text-foreground">
					{todo.title}
				</h1>

				{/* 操作按钮组 */}
				<div className="mb-8 flex flex-wrap items-center gap-2">
					{/* Remind me 按钮 */}
					<button
						type="button"
						className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
					>
						<Bell className="h-4 w-4" />
						<span>Remind me</span>
					</button>

					{/* 个人事务标签 */}
					<button
						type="button"
						className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
					>
						<FileText className="h-4 w-4 text-yellow-500" />
						<span>个人事务</span>
					</button>

					{/* Tags 按钮 */}
					<button
						type="button"
						className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
					>
						<Hash className="h-4 w-4" />
						<span>Tags</span>
					</button>
				</div>

				{/* NOTES 部分 */}
				<div className="mb-8">
					<h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						NOTES
					</h2>
					<textarea
						value={todo.notes || ""}
						onChange={(e) => handleNotesChange(e.target.value)}
						placeholder="Insert your notes here"
						className="w-full min-h-[120px] rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
					/>
				</div>

				{/* SUBTASKS 部分 */}
				<div className="mb-8">
					<div className="mb-3 flex items-center justify-between">
						<h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							SUBTASKS {completedSubtasks}/{totalSubtasks}
						</h2>
						<button
							type="button"
							className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
						>
							<MoreVertical className="h-4 w-4" />
						</button>
					</div>

					{/* 进度条 */}
					<div className="mb-4 h-0.5 w-full bg-border">
						<div
							className="h-full bg-primary transition-all"
							style={{
								width:
									totalSubtasks > 0
										? `${(completedSubtasks / totalSubtasks) * 100}%`
										: "0%",
							}}
						/>
					</div>

					{/* 子任务列表 */}
					<div className="space-y-2">
						{todo.subtasks?.map((subtask) => (
							<div
								key={subtask.id}
								className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/30 transition-colors"
							>
								<button
									type="button"
									onClick={() => toggleSubtask(todo.id, subtask.id)}
									className="shrink-0"
								>
									{subtask.completed ? (
										<div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary">
											<Check className="h-3 w-3 text-primary-foreground" />
										</div>
									) : (
										<div className="h-4 w-4 rounded-full border-2 border-muted-foreground/40" />
									)}
								</button>
								<span
									className={cn(
										"flex-1 text-sm text-foreground",
										subtask.completed && "line-through text-muted-foreground",
									)}
								>
									{subtask.title}
								</span>
							</div>
						))}

						{/* 添加新子任务 */}
						{isAddingSubtask ? (
							<div className="flex items-center gap-2 rounded-md px-2 py-1.5">
								<div className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/40" />
								<input
									type="text"
									value={newSubtaskTitle}
									onChange={(e) => setNewSubtaskTitle(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											handleAddSubtask();
										} else if (e.key === "Escape") {
											setIsAddingSubtask(false);
											setNewSubtaskTitle("");
										}
									}}
									onBlur={() => {
										if (newSubtaskTitle.trim()) {
											handleAddSubtask();
										} else {
											setIsAddingSubtask(false);
										}
									}}
									placeholder="Add a new subtask"
									className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
								/>
							</div>
						) : (
							<button
								type="button"
								onClick={() => setIsAddingSubtask(true)}
								className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted/30 transition-colors"
							>
								<div className="h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/40" />
								<span>Add a new subtask</span>
							</button>
						)}
					</div>
				</div>

				{/* ATTACHMENTS 部分 */}
				<div>
					<h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						ATTACHMENTS
					</h2>
					<div className="flex min-h-[120px] items-center justify-center rounded-md border-2 border-dashed border-border bg-muted/20 hover:bg-muted/30 transition-colors cursor-pointer">
						<span className="text-sm text-muted-foreground">
							Click to add / drop your files here
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
