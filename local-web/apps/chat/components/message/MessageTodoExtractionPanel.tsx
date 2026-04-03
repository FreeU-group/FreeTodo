"use client";

import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useCreateTodo, useUpdateTodo } from "@/lib/query";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ExtractedTodo {
	name: string;
	description?: string | null;
	tags: string[];
}

interface MessageTodoExtractionPanelProps {
	todos: ExtractedTodo[];
	parentTodoId: number | null;
	isExtracting: boolean;
	onComplete?: () => void;
}

export function MessageTodoExtractionPanel({
	todos,
	parentTodoId,
	isExtracting,
	onComplete,
}: MessageTodoExtractionPanelProps) {
	const t = useTranslations("contextMenu");
	const tChat = useTranslations("chat");
	const createTodoMutation = useCreateTodo();
	const updateTodoMutation = useUpdateTodo();
	const [selectedTodos, setSelectedTodos] = useState<Set<number>>(
		new Set(todos.map((_, index) => index)),
	);
	const [isApplying, setIsApplying] = useState(false);

	const handleToggleTodo = (index: number) => {
		const newSelected = new Set(selectedTodos);
		if (newSelected.has(index)) {
			newSelected.delete(index);
		} else {
			newSelected.add(index);
		}
		setSelectedTodos(newSelected);
	};

	const handleApply = async () => {
		if (selectedTodos.size === 0) return;

		setIsApplying(true);
		try {
			// 创建选中的待办（status 为 draft）
			const createdTodos: Todo[] = [];
			for (const index of selectedTodos) {
				const todo = todos[index];
				const created = await createTodoMutation.mutateAsync({
					name: todo.name,
					description: todo.description || undefined,
					tags: todo.tags,
					status: "draft",
					parentTodoId: parentTodoId,
				});
				createdTodos.push(created);
			}

			// 将所有创建的待办从 draft 更新为 active
			await Promise.all(
				createdTodos.map((todo) =>
					updateTodoMutation.mutateAsync({
						id: todo.id,
						input: { status: "active" },
					}),
				),
			);

			onComplete?.();
		} catch (error) {
			console.error("创建待办失败:", error);
		} finally {
			setIsApplying(false);
		}
	};

	if (todos.length === 0 && !isExtracting) {
		return null;
	}

	return (
		<div className="mt-2 space-y-2 rounded-lg border border-dashed border-primary/50 bg-primary/5 p-3">
			{isExtracting && (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="h-4 w-4 animate-spin" />
					<span>{t("extracting")}</span>
				</div>
			)}

			{todos.length > 0 && (
				<>
					<div className="space-y-2">
						{todos.map((todo, index) => {
							const isSelected = selectedTodos.has(index);
							return (
								<div
									key={`${todo.name}-${index}`}
									role="button"
									tabIndex={0}
									className={cn(
										"flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
										isSelected
											? "border-primary bg-primary/10"
											: "border-border bg-background hover:bg-muted/50",
									)}
									onClick={() => handleToggleTodo(index)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleToggleTodo(index);
										}
									}}
								>
									<div className="shrink-0 mt-0.5">
										<div
											className={cn(
												"w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
												isSelected
													? "border-primary bg-primary"
													: "border-border",
											)}
										>
											{isSelected && (
												<Check className="h-3.5 w-3.5 text-primary-foreground" />
											)}
										</div>
									</div>
									<div className="flex-1 min-w-0">
										<div className="font-medium text-foreground">
											{todo.name}
										</div>
										{todo.tags.length > 0 && (
											<div className="mt-1 flex flex-wrap gap-1">
												{todo.tags.map((tag) => (
													<span
														key={tag}
														className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
													>
														{tag}
													</span>
												))}
											</div>
										)}
									</div>
								</div>
							);
						})}
					</div>

					{!isExtracting && (
						<div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
							<button
								type="button"
								onClick={handleApply}
								disabled={isApplying || selectedTodos.size === 0}
								className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{isApplying
									? tChat("applying")
									: tChat("confirmAdd", { count: selectedTodos.size })}
							</button>
						</div>
					)}
				</>
			)}
		</div>
	);
}
