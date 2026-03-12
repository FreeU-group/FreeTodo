"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useCreateTodo, useUpdateTodo } from "@/lib/query";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/utils";

interface ExtractedTodo {
	name: string;
	description?: string | null;
	tags: string[];
	startTime?: string | null;
	deadline?: string | null;
	rawTime?: string | null;
	key?: string;
}

interface MessageTodoExtractionModalProps {
	isOpen: boolean;
	onClose: () => void;
	todos: ExtractedTodo[];
	parentTodoId: number | null;
	onSuccess?: () => void;
	/** 可选：由外部控制选中项（用于 Audio 等需要“保留勾选”的场景） */
	selectedTodoIndexes?: Set<number>;
	onSelectedTodoIndexesChange?: (next: Set<number>) => void;
	/** 可选：确认成功后回传本次确认的 item keys（用于去重） */
	onSuccessWithKeys?: (keys: string[]) => void;
	/** 可选：确认成功后回传创建结果（用于音频把提取项标记为 linked） */
	onSuccessWithCreated?: (created: Array<{ index: number; key?: string; todoId: number }>) => void;
}

export function MessageTodoExtractionModal({
	isOpen,
	onClose,
	todos,
	parentTodoId,
	onSuccess,
	selectedTodoIndexes,
	onSelectedTodoIndexesChange,
	onSuccessWithKeys,
	onSuccessWithCreated,
}: MessageTodoExtractionModalProps) {
	const t = useTranslations("contextMenu");
	const tChat = useTranslations("chat");
	const createTodoMutation = useCreateTodo();
	const updateTodoMutation = useUpdateTodo();
	const [internalSelectedTodos, setInternalSelectedTodos] = useState<Set<number>>(new Set());
	const [isProcessing, setIsProcessing] = useState(false);

	const selectedTodos = selectedTodoIndexes ?? internalSelectedTodos;
	const setSelectedTodos = (next: Set<number>) => {
		onSelectedTodoIndexesChange?.(next);
		if (!selectedTodoIndexes) {
			setInternalSelectedTodos(next);
		}
	};

	// 打开时，如果有外部 selection 则同步到内部，否则保持现有（默认不自动全选）
	useEffect(() => {
		if (!isOpen) return;
		if (selectedTodoIndexes) {
			setInternalSelectedTodos(new Set(selectedTodoIndexes));
		} else if (internalSelectedTodos.size > todos.length) {
			// 数据变化导致越界时，收敛到有效范围
			setInternalSelectedTodos(new Set());
		}
	}, [isOpen, selectedTodoIndexes, internalSelectedTodos.size, todos.length]);

	const handleToggleTodo = (index: number) => {
		const newSelected = new Set(selectedTodos);
		if (newSelected.has(index)) {
			newSelected.delete(index);
		} else {
			newSelected.add(index);
		}
		setSelectedTodos(newSelected);
	};

	const normalizeScheduleTime = (value?: string | null): string | undefined => {
		if (!value) return undefined;
		const parsed = Date.parse(value);
		if (Number.isNaN(parsed)) return undefined;
		return new Date(parsed).toISOString();
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
			const confirmedKeys: string[] = [];
			const createdMap: Array<{ index: number; key?: string; todoId: number }> = [];
			for (const index of selectedTodos) {
				const todo = todos[index];
				if (todo?.key) confirmedKeys.push(todo.key);
				// NOTE: avoid hard dependency on a translation key that may be missing
				const userNotesParts = [
					todo.rawTime ? `时间: ${todo.rawTime}` : null,
				].filter(Boolean);
				const safeStartTime = normalizeScheduleTime(
					todo.startTime ?? todo.deadline,
				);
				const created = await createTodoMutation.mutateAsync({
					name: todo.name,
					description: todo.description || undefined,
					tags: todo.tags,
					status: "draft",
					parentTodoId: parentTodoId,
					startTime: safeStartTime,
					userNotes: userNotesParts.length > 0 ? userNotesParts.join("\n") : undefined,
				});
				createdTodos.push(created);
				createdMap.push({ index, key: todo?.key, todoId: created.id });
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

			onSuccessWithKeys?.(confirmedKeys);
			onSuccessWithCreated?.(createdMap);
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

	if (!isOpen) return null;

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
									key={todo.key || `${todo.name}-${index}`}
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
