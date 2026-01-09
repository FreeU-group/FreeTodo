"use client";

import { Check, X, CheckCircle2, Edit2, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CreateTodoInput } from "@/lib/types";
import { useCreateTodo, useDeleteTodo, queryKeys } from "@/lib/query";
import { toastSuccess, toastError } from "@/lib/toast";

type ExtractedTodo = {
	name: string;
	description?: string;
};

type BatchDeleteTodo = {
	id: number;
	name: string;
};

type BatchTodoConfirmationData =
	| {
			type: "batch_todo_confirmation";
			operation: "batch_create_todos";
			todos: ExtractedTodo[];
			preview: string;
	  }
	| {
			type: "batch_todo_confirmation";
			operation: "batch_delete_todos";
			todos: BatchDeleteTodo[];
			preview: string;
	  };

type BatchTodoConfirmationPanelProps = {
	confirmation: BatchTodoConfirmationData;
	onComplete: () => void;
};

type EditableTodo = ExtractedTodo & {
	id: string; // 用于React key
	isSelected: boolean; // 是否被选中创建
	isEditing: boolean; // 是否正在编辑
};

export function BatchTodoConfirmationPanel({
	confirmation,
	onComplete,
}: BatchTodoConfirmationPanelProps) {
	const [isProcessing, setIsProcessing] = useState(false);
	const [isCompleted, setIsCompleted] = useState(false);
	const [editableTodos, setEditableTodos] = useState<EditableTodo[]>(() => {
		if (confirmation.operation === "batch_delete_todos") {
			// 批量删除：todos是BatchDeleteTodo[]
			return confirmation.todos.map((todo) => ({
				name: todo.name,
				id: `todo-${todo.id}`,
				isSelected: true, // 默认全部选中
				isEditing: false,
				// 保存原始ID用于删除
				originalId: todo.id,
			} as EditableTodo & { originalId?: number }));
		} else {
			// 批量创建：todos是ExtractedTodo[]
			return confirmation.todos.map((todo, idx) => ({
				...todo,
				id: `todo-${idx}`,
				isSelected: true, // 默认全部选中
				isEditing: false,
			}));
		}
	});

	const createTodoMutation = useCreateTodo();
	const deleteTodoMutation = useDeleteTodo();
	const queryClient = useQueryClient();

	// 操作成功后，3秒后自动关闭
	useEffect(() => {
		if (isCompleted) {
			const timer = setTimeout(() => {
				onComplete();
			}, 3000);
			return () => clearTimeout(timer);
		}
	}, [isCompleted, onComplete]);

	const handleToggleTodo = (id: string) => {
		setEditableTodos((prev) =>
			prev.map((todo) =>
				todo.id === id ? { ...todo, isSelected: !todo.isSelected } : todo,
			),
		);
	};

	const handleToggleAll = () => {
		const allSelected = editableTodos.every((todo) => todo.isSelected);
		setEditableTodos((prev) =>
			prev.map((todo) => ({ ...todo, isSelected: !allSelected })),
		);
	};

	const handleStartEdit = (id: string) => {
		setEditableTodos((prev) =>
			prev.map((todo) =>
				todo.id === id ? { ...todo, isEditing: true } : todo,
			),
		);
	};

	const handleSaveEdit = (id: string, updates: Partial<ExtractedTodo>) => {
		setEditableTodos((prev) =>
			prev.map((todo) =>
				todo.id === id
					? { ...todo, ...updates, isEditing: false }
					: todo,
			),
		);
	};

	const handleCancelEdit = (id: string) => {
		setEditableTodos((prev) =>
			prev.map((todo) =>
				todo.id === id ? { ...todo, isEditing: false } : todo,
			),
		);
	};

	const handleDeleteTodo = (id: string) => {
		setEditableTodos((prev) => prev.filter((todo) => todo.id !== id));
	};

	const handleConfirm = async () => {
		const selectedTodos = editableTodos.filter((todo) => todo.isSelected);
		if (selectedTodos.length === 0) {
			toastError("请至少选择一个待办事项");
			return;
		}

		setIsProcessing(true);
		try {
			if (confirmation.operation === "batch_delete_todos") {
				// 批量删除选中的todo
				// 使用串行删除避免乐观更新冲突
				for (const todo of selectedTodos) {
					const todoId = (todo as EditableTodo & { originalId?: number }).originalId;
					if (todoId) {
						await deleteTodoMutation.mutateAsync(todoId);
					}
				}
				// 刷新待办列表
				queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
				toastSuccess(`成功删除 ${selectedTodos.length} 个待办事项`);
			} else {
				// 批量创建选中的todo
				const createPromises = selectedTodos.map((todo) => {
					const input: CreateTodoInput = {
						name: todo.name,
						description: todo.description || undefined,
						status: "active",
						priority: "none",
					};
					return createTodoMutation.mutateAsync(input);
				});

				await Promise.all(createPromises);
				// 刷新待办列表
				queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
				toastSuccess(`成功创建 ${selectedTodos.length} 个待办事项`);
			}
			setIsCompleted(true);
		} catch (error) {
			console.error("批量操作失败:", error);
			toastError(
				error instanceof Error ? error.message : "批量操作失败，请稍后重试",
			);
		} finally {
			setIsProcessing(false);
		}
	};

	const handleCancel = () => {
		onComplete();
	};

	const handleClose = () => {
		onComplete();
	};

	const selectedCount = editableTodos.filter((todo) => todo.isSelected).length;
	const allSelected = editableTodos.length > 0 && selectedCount === editableTodos.length;

	// 已完成状态
	if (isCompleted) {
		const successMessage =
			confirmation.operation === "batch_delete_todos"
				? "批量待办已删除"
				: "批量待办已创建";
		const successDetail =
			confirmation.operation === "batch_delete_todos"
				? `已成功删除 ${selectedCount} 个待办事项`
				: `已成功创建 ${selectedCount} 个待办事项`;

		return (
			<div className="mt-3 rounded-lg border-2 border-green-500/50 bg-green-50/50 dark:bg-green-950/30 p-4">
				<div className="mb-3 flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
					<CheckCircle2 className="h-5 w-5" />
					{successMessage}
				</div>
				<div className="mb-4 whitespace-pre-wrap text-sm text-green-600 dark:text-green-300">
					{successDetail}
				</div>
				<div className="flex items-center gap-2 text-xs text-green-600/70 dark:text-green-400/70">
					<span>将在 3 秒后自动关闭</span>
					<button
						type="button"
						onClick={handleClose}
						className="ml-auto rounded-md px-2 py-1 text-green-700 hover:bg-green-100 dark:text-green-400 dark:hover:bg-green-900/50"
					>
						立即关闭
					</button>
				</div>
			</div>
		);
	}

	// 待确认状态
	return (
		<div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
			<div className="mb-3 flex items-center justify-between">
				<div className="text-sm font-medium text-foreground">
					{confirmation.operation === "batch_delete_todos"
						? `批量删除待办 (${confirmation.todos.length} 个)`
						: `批量创建待办 (${confirmation.todos.length} 个)`}
				</div>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<button
						type="button"
						onClick={handleToggleAll}
						className="hover:text-foreground"
					>
						{allSelected ? "取消全选" : "全选"}
					</button>
					<span>已选择 {selectedCount}/{editableTodos.length}</span>
				</div>
			</div>

			<div className="mb-4 max-h-[400px] space-y-2 overflow-y-auto">
				{editableTodos.map((todo, index) => (
					<TodoItem
						key={todo.id}
						todo={todo}
						index={index}
						isDeleteMode={confirmation.operation === "batch_delete_todos"}
						onToggle={handleToggleTodo}
						onStartEdit={handleStartEdit}
						onSaveEdit={handleSaveEdit}
						onCancelEdit={handleCancelEdit}
						onDelete={handleDeleteTodo}
					/>
				))}
			</div>

			<div className="flex gap-2">
				<button
					type="button"
					onClick={handleConfirm}
					disabled={isProcessing || selectedCount === 0}
					className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
				>
					<Check className="h-4 w-4" />
					{isProcessing
						? confirmation.operation === "batch_delete_todos"
							? "删除中..."
							: "创建中..."
						: confirmation.operation === "batch_delete_todos"
							? `确认删除 ${selectedCount > 0 ? `(${selectedCount}个)` : ""}`
							: `确认创建 ${selectedCount > 0 ? `(${selectedCount}个)` : ""}`}
				</button>
				<button
					type="button"
					onClick={handleCancel}
					disabled={isProcessing}
					className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
				>
					<X className="h-4 w-4" />
					取消
				</button>
			</div>
		</div>
	);
}

type TodoItemProps = {
	todo: EditableTodo;
	index: number;
	isDeleteMode?: boolean;
	onToggle: (id: string) => void;
	onStartEdit: (id: string) => void;
	onSaveEdit: (id: string, updates: Partial<ExtractedTodo>) => void;
	onCancelEdit: (id: string) => void;
	onDelete: (id: string) => void;
};

function TodoItem({
	todo,
	index,
	isDeleteMode = false,
	onToggle,
	onStartEdit,
	onSaveEdit,
	onCancelEdit,
	onDelete,
}: TodoItemProps) {
	const [editName, setEditName] = useState(todo.name);
	const [editDescription, setEditDescription] = useState(todo.description || "");

	const handleSave = () => {
		onSaveEdit(todo.id, {
			name: editName.trim(),
			description: editDescription.trim() || undefined,
		});
	};

	if (todo.isEditing) {
		return (
			<div className="rounded-md border border-primary/30 bg-background p-3">
				<div className="mb-2 flex items-center gap-2">
					<input
						type="text"
						value={editName}
						onChange={(e) => setEditName(e.target.value)}
						placeholder="待办名称"
						className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-sm"
					/>
				</div>
				<textarea
					value={editDescription}
					onChange={(e) => setEditDescription(e.target.value)}
					placeholder="描述（可选）"
					rows={2}
					className="mb-2 w-full rounded-md border border-input bg-background px-2 py-1 text-sm"
				/>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={handleSave}
						disabled={!editName.trim()}
						className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
					>
						保存
					</button>
					<button
						type="button"
						onClick={() => onCancelEdit(todo.id)}
						className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
					>
						取消
					</button>
				</div>
			</div>
		);
	}

	const todoWithOriginalId = todo as EditableTodo & { originalId?: number };
	const displayId = isDeleteMode && todoWithOriginalId.originalId 
		? todoWithOriginalId.originalId 
		: null;

	return (
		<div
			className={`flex items-start gap-3 rounded-md border p-3 transition-colors ${
				todo.isSelected
					? "border-primary/50 bg-primary/5"
					: "border-border/50 bg-muted/30"
			}`}
		>
			<input
				type="checkbox"
				checked={todo.isSelected}
				onChange={() => onToggle(todo.id)}
				className="mt-1 h-4 w-4 cursor-pointer rounded border-gray-300"
			/>
			<div className="flex-1">
				<div className="flex items-start justify-between gap-2">
					<div className="flex-1">
						<div className="text-sm font-medium text-foreground">
							{index + 1}. {todo.name}
							{displayId && (
								<span className="ml-2 text-xs text-muted-foreground">
									(ID: {displayId})
								</span>
							)}
						</div>
						{todo.description && (
							<div className="mt-1 text-xs text-muted-foreground">
								{todo.description}
							</div>
						)}
					</div>
					{!isDeleteMode && (
						<div className="flex gap-1">
							<button
								type="button"
								onClick={() => onStartEdit(todo.id)}
								className="rounded p-1 hover:bg-muted"
								title="编辑"
							>
								<Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
							</button>
							<button
								type="button"
								onClick={() => onDelete(todo.id)}
								className="rounded p-1 hover:bg-muted"
								title="删除"
							>
								<Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

