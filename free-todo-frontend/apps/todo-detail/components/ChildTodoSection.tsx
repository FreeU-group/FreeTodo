"use client";

import { Calendar, Flag, Plus, Tag as TagIcon } from "lucide-react";
import { useState } from "react";
import type { Todo } from "@/lib/types/todo";
import {
	formatDateTime,
	getChildProgress,
	getPriorityIconColor,
	getPriorityLabel,
} from "../helpers";

interface ChildTodoSectionProps {
	childTodos: Todo[];
	allTodos: Todo[];
	onSelectTodo: (id: string) => void;
	onCreateChild: (name: string) => void;
}

export function ChildTodoSection({
	childTodos,
	allTodos,
	onSelectTodo,
	onCreateChild,
}: ChildTodoSectionProps) {
	const [isAddingChild, setIsAddingChild] = useState(false);
	const [childName, setChildName] = useState("");

	const handleSubmit = (event?: React.FormEvent) => {
		if (event) event.preventDefault();
		const name = childName.trim();
		if (!name) return;
		onCreateChild(name);
		setChildName("");
	};

	return (
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
					const { completed, total } = getChildProgress(allTodos, child.id);
					return (
						<button
							type="button"
							key={child.id}
							onClick={() => onSelectTodo(child.id)}
							className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-2 text-left transition-colors hover:bg-muted/40"
						>
							<div className="flex flex-col gap-1">
								<div className="flex items-center gap-2">
									<span className="inline-flex h-4 w-4 items-center justify-center rounded-md border-2 border-muted-foreground/60" />
									<Flag
										className={getPriorityIconColor(child.priority ?? "none")}
										fill="currentColor"
										aria-label={`优先级：${getPriorityLabel(child.priority ?? "none")}`}
									/>
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
					onSubmit={handleSubmit}
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
	);
}
