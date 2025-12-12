"use client";
import { useState } from "react";
import { useTodoStore } from "@/lib/store/todo-store";
import type { CreateTodoInput, TodoPriority } from "@/lib/types/todo";
import { cn } from "@/lib/utils";

interface CreateTodoFormProps {
	onSuccess?: () => void;
}

export function CreateTodoForm({ onSuccess }: CreateTodoFormProps) {
	const { addTodo } = useTodoStore();
	const [isExpanded, setIsExpanded] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [deadline, setDeadline] = useState("");
	const [tags, setTags] = useState("");
	const [userNotes, setUserNotes] = useState("");
	const [priority, setPriority] = useState<TodoPriority>("none");

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!name.trim()) return;

		const input: CreateTodoInput = {
			name: name.trim(),
			description: description.trim() || undefined,
			deadline: deadline || undefined,
			userNotes: userNotes.trim() || undefined,
			priority,
			tags:
				tags
					.split(",")
					.map((t) => t.trim())
					.filter(Boolean) || [],
		};

		addTodo(input);
		setName("");
		setDescription("");
		setDeadline("");
		setTags("");
		setUserNotes("");
		setPriority("none");
		setIsExpanded(false);
		onSuccess?.();
	};

	return (
		<form
			onSubmit={handleSubmit}
			className={cn("bg-muted/30 transition-all", isExpanded && "bg-muted/50")}
		>
			<div className="p-4">
				<div className="flex items-center gap-2">
					<input
						type="text"
						value={name}
						onChange={(e) => setName(e.target.value)}
						onFocus={() => setIsExpanded(true)}
						placeholder="新建待办..."
						className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
					/>
					{name.trim() && (
						<button
							type="submit"
							className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
						>
							添加
						</button>
					)}
				</div>

				{isExpanded && (
					<div className="mt-3 space-y-3">
						<div>
							<label
								htmlFor="deadline-input"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								截止日期
							</label>
							<input
								id="deadline-input"
								type="date"
								value={deadline}
								onChange={(e) => setDeadline(e.target.value)}
								className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							/>
						</div>

						<div>
							<label
								htmlFor="description-input"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								描述
							</label>
							<textarea
								id="description-input"
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								placeholder="描述任务细节..."
								className="w-full min-h-[80px] rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							/>
						</div>

						<div>
							<label
								htmlFor="tags-input"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								标签（逗号分隔）
							</label>
							<input
								id="tags-input"
								type="text"
								value={tags}
								onChange={(e) => setTags(e.target.value)}
								placeholder="如：工作, 报告"
								className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							/>
						</div>

						<div>
							<label
								htmlFor="priority-select"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								优先级
							</label>
							<select
								id="priority-select"
								value={priority}
								onChange={(e) => setPriority(e.target.value as TodoPriority)}
								className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							>
								<option value="high">高</option>
								<option value="medium">中</option>
								<option value="low">低</option>
								<option value="none">无</option>
							</select>
						</div>

						<div>
							<label
								htmlFor="user-notes-input"
								className="mb-1 block text-xs font-medium text-muted-foreground"
							>
								备注
							</label>
							<textarea
								id="user-notes-input"
								value={userNotes}
								onChange={(e) => setUserNotes(e.target.value)}
								placeholder="个人备注或行动项"
								className="w-full min-h-[60px] rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
							/>
						</div>
					</div>
				)}
			</div>
		</form>
	);
}
