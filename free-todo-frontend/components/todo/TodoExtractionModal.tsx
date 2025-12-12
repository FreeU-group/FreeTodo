"use client";

import { Check, Clock, X } from "lucide-react";
import { useState } from "react";
import type { ExtractedTodo } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";
import { useTodoStore } from "@/lib/store/todo-store";
import { toastError, toastSuccess } from "@/lib/toast";
import type { CreateTodoInput } from "@/lib/types/todo";
import { cn, formatDateTime } from "@/lib/utils";

interface TodoExtractionModalProps {
	isOpen: boolean;
	onClose: () => void;
	todos: ExtractedTodo[];
	eventId: number;
	appName?: string | null;
}

export function TodoExtractionModal({
	isOpen,
	onClose,
	todos,
	eventId,
	appName,
}: TodoExtractionModalProps) {
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);
	const { addTodo } = useTodoStore();
	const [selectedTodos, setSelectedTodos] = useState<Set<number>>(
		new Set(todos.map((_, index) => index)),
	);

	const handleToggle = (index: number) => {
		const newSelected = new Set(selectedTodos);
		if (newSelected.has(index)) {
			newSelected.delete(index);
		} else {
			newSelected.add(index);
		}
		setSelectedTodos(newSelected);
	};

	const handleSelectAll = () => {
		if (selectedTodos.size === todos.length) {
			setSelectedTodos(new Set());
		} else {
			setSelectedTodos(new Set(todos.map((_, index) => index)));
		}
	};

	const handleConfirm = () => {
		if (selectedTodos.size === 0) {
			toastError(t.todoExtraction.noTodosFound);
			return;
		}

		let successCount = 0;
		let failCount = 0;

		selectedTodos.forEach((index) => {
			const todo = todos[index];
			try {
				const todoInput: CreateTodoInput = {
					name: todo.title,
					description: todo.description || todo.source_text,
					deadline: todo.scheduled_time || undefined,
					tags: ["自动提取"],
					userNotes: `来源：${todo.source_text}\n时间：${todo.time_info.raw_text}\n事件ID：${eventId}`,
				};

				addTodo(todoInput);
				successCount++;
			} catch (error) {
				console.error("添加待办失败:", error);
				failCount++;
			}
		});

		if (successCount > 0) {
			toastSuccess(
				t.todoExtraction.addSuccess.replace("{count}", String(successCount)),
			);
		}
		if (failCount > 0) {
			toastError(
				t.todoExtraction.addFailed.replace("{error}", `失败 ${failCount} 项`),
			);
		}

		onClose();
		setSelectedTodos(new Set());
	};

	const formatTimeDisplay = (todo: ExtractedTodo): string => {
		if (todo.scheduled_time) {
			const scheduled = formatDateTime(todo.scheduled_time, "YYYY-MM-DD HH:mm");
			const rawTime = todo.time_info.raw_text;
			return `${rawTime} (${scheduled})`;
		}
		return todo.time_info.raw_text || "未指定时间";
	};

	if (!isOpen) return null;

	return (
		<div
			role="button"
			tabIndex={0}
			className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
			onClick={onClose}
			onKeyDown={(e) => {
				if (e.key === "Escape") {
					onClose();
				}
			}}
		>
			<div
				role="dialog"
				className="relative w-full max-w-3xl max-h-[90vh] bg-background border border-border rounded-lg shadow-lg overflow-hidden flex flex-col"
				onClick={(e) => e.stopPropagation()}
				onKeyDown={(e) => {
					if (e.key === "Escape") {
						onClose();
					}
				}}
			>
				{/* 头部 */}
				<div className="flex-shrink-0 flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
					<div>
						<h2 className="text-lg font-semibold">
							{t.todoExtraction.modalTitle}
						</h2>
						{appName && (
							<p className="text-sm text-muted-foreground mt-1">
								事件 #{eventId} - {appName}
							</p>
						)}
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
						aria-label="关闭"
					>
						<X className="h-5 w-5" />
					</button>
				</div>

				{/* 描述 */}
				<div className="flex-shrink-0 px-4 py-2 border-b border-border bg-muted/20">
					<p className="text-sm text-muted-foreground">
						{t.todoExtraction.modalDescription}
					</p>
				</div>

				{/* 操作栏 */}
				<div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b border-border">
					<button
						type="button"
						onClick={handleSelectAll}
						className="text-sm text-primary hover:underline"
					>
						{selectedTodos.size === todos.length
							? t.todoExtraction.deselectAll
							: t.todoExtraction.selectAll}
					</button>
					<span className="text-sm text-muted-foreground">
						{t.todoExtraction.selectedCount.replace(
							"{count}",
							String(selectedTodos.size),
						)}
					</span>
				</div>

				{/* 待办列表 */}
				<div className="flex-1 overflow-y-auto p-4 space-y-3">
					{todos.length === 0 ? (
						<div className="text-center py-8 text-muted-foreground">
							<p>{t.todoExtraction.noTodosFound}</p>
						</div>
					) : (
						todos.map((todo, index) => {
							const isSelected = selectedTodos.has(index);
							const todoKey = `todo-${todo.title}-${index}-${todo.screenshot_ids.join("-")}`;
							return (
								<div
									key={todoKey}
									role="button"
									tabIndex={0}
									className={cn(
										"border rounded-lg p-4 cursor-pointer transition-colors",
										isSelected
											? "border-primary bg-primary/5"
											: "border-border hover:border-primary/50",
									)}
									onClick={() => handleToggle(index)}
									onKeyDown={(e) => {
										if (e.key === "Enter" || e.key === " ") {
											e.preventDefault();
											handleToggle(index);
										}
									}}
								>
									<div className="flex items-start gap-3">
										<div className="flex-shrink-0 mt-0.5">
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
										<div className="flex-1 min-w-0 space-y-2">
											<h3 className="font-medium text-foreground">
												{todo.title}
											</h3>
											{todo.description && (
												<p className="text-sm text-muted-foreground">
													{todo.description}
												</p>
											)}
											<div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
												<div className="flex items-center gap-1">
													<Clock className="h-3.5 w-3.5" />
													<span>{formatTimeDisplay(todo)}</span>
												</div>
												{todo.confidence && (
													<span>
														置信度: {(todo.confidence * 100).toFixed(0)}%
													</span>
												)}
											</div>
											<div className="mt-2 pt-2 border-t border-border">
												<p className="text-xs text-muted-foreground italic">
													{t.todoExtraction.todoSource}: "{todo.source_text}"
												</p>
											</div>
										</div>
									</div>
								</div>
							);
						})
					)}
				</div>

				{/* 底部操作 */}
				<div className="flex-shrink-0 flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 rounded-md border border-input bg-background hover:bg-muted text-sm font-medium transition-colors"
					>
						{t.todoExtraction.cancel}
					</button>
					<button
						type="button"
						onClick={handleConfirm}
						disabled={selectedTodos.size === 0}
						className={cn(
							"px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium transition-colors",
							"hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed",
						)}
					>
						{t.todoExtraction.confirmAdd.replace(
							"{count}",
							String(selectedTodos.size),
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
