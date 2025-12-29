"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useCreateTodo, useUpdateTodo } from "@/lib/query";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ExtractedTodo {
	name: string;
	description?: string | null;
	tags: string[];
}

interface MessageTodoExtractionModalProps {
	isOpen: boolean;
	onClose: () => void;
	todos: ExtractedTodo[];
	parentTodoId: number | null;
	onSuccess?: () => void;
}

export function MessageTodoExtractionModal({
	isOpen,
	onClose,
	todos,
	parentTodoId,
	onSuccess,
}: MessageTodoExtractionModalProps) {
	const t = useTranslations("contextMenu");
	const tChat = useTranslations("chat");
	const createTodoMutation = useCreateTodo();
	const updateTodoMutation = useUpdateTodo();
	const [selectedTodos, setSelectedTodos] = useState<Set<number>>(
		new Set(todos.map((_, index) => index)),
	);
	const [isProcessing, setIsProcessing] = useState(false);

	if (!isOpen) return null;

	const handleToggleTodo = (index: number) => {
		const newSelected = new Set(selectedTodos);
		if (newSelected.has(index)) {
			newSelected.delete(index);
		} else {
			newSelected.add(index);
		}
		setSelectedTodos(newSelected);
	};

	const handleConfirm = async () => {
		if (selectedTodos.size === 0) {
			onClose();
			return;
		}

		setIsProcessing(true);
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

			onSuccess?.();
			onClose();
		} catch (error) {
			console.error("创建待办失败:", error);
		} finally {
			setIsProcessing(false);
		}
	};

	const handleCancel = () => {
		onClose();
	};

	const modalContent = (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			{/* 背景遮罩 */}
			<div
				className="absolute inset-0 bg-black/50"
				role="button"
				tabIndex={0}
				onClick={handleCancel}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " " || e.key === "Escape") {
						e.preventDefault();
						handleCancel();
					}
				}}
				aria-label="关闭对话框"
			/>

			{/* 对话框 */}
			<div className="relative z-10 w-full max-w-2xl max-h-[80vh] overflow-hidden rounded-lg border border-border bg-background shadow-lg">
				{/* 标题栏 */}
				<div className="flex items-center justify-between border-b border-border px-6 py-4">
					<h2 className="text-lg font-semibold text-foreground">
						{t("extractButton")}
					</h2>
					<button
						type="button"
						onClick={handleCancel}
						className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
						aria-label={t("cancelButton")}
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				{/* 内容区域 */}
				<div className="overflow-y-auto px-6 py-4 max-h-[calc(80vh-140px)]">
					<p className="mb-4 text-sm text-muted-foreground">
						{tChat("extractModalDescription")}
					</p>

					<div className="space-y-2">
						{todos.map((todo, index) => {
							const isSelected = selectedTodos.has(index);
							return (
								<div
									key={`${todo.name}-${index}`}
									role="button"
									tabIndex={0}
									className={cn(
										"flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition-colors",
										isSelected
											? "border-primary bg-primary/5"
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
									<div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors">
										{isSelected && (
											<Check className="h-3.5 w-3.5 text-primary" />
										)}
									</div>
									<div className="flex-1 min-w-0">
										<div className="font-medium text-foreground">
											{todo.name}
										</div>
										{todo.description && (
											<div className="mt-1 text-sm text-muted-foreground">
												{todo.description}
											</div>
										)}
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
				</div>

				{/* 底部操作栏 */}
				<div className="flex items-center justify-between border-t border-border px-6 py-4">
					<div className="text-sm text-muted-foreground">
						{tChat("selectedCount", { count: selectedTodos.size }) ||
							`已选择 ${selectedTodos.size} 项`}
					</div>
					<div className="flex items-center gap-3">
						<button
							type="button"
							onClick={handleCancel}
							disabled={isProcessing}
							className="rounded-md px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
						>
							{t("cancelButton")}
						</button>
						<button
							type="button"
							onClick={handleConfirm}
							disabled={isProcessing || selectedTodos.size === 0}
							className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{isProcessing
								? tChat("applying")
								: tChat("confirmAdd", { count: selectedTodos.size })}
						</button>
					</div>
				</div>
			</div>
		</div>
	);

	return typeof document !== "undefined"
		? createPortal(modalContent, document.body)
		: null;
}
