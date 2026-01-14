"use client";

import { Check, CheckCircle2, X } from "lucide-react";
import { useState } from "react";
import { useCreateTodo, useDeleteTodo, useUpdateTodo } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import type { CreateTodoInput, TodoPriority, TodoStatus, UpdateTodoInput } from "@/lib/types";

type TodoConfirmationData = {
	type: "todo_confirmation";
	operation: "create_todo" | "update_todo" | "delete_todo";
	data: {
		operation: string;
		todo_id?: number;
		params?: Record<string, unknown>;
	};
	preview: string;
};

type TodoConfirmationPanelProps = {
	confirmation: TodoConfirmationData;
	onComplete: () => void;
};

export function TodoConfirmationPanel({
	confirmation,
	onComplete,
}: TodoConfirmationPanelProps) {
	const [isProcessing, setIsProcessing] = useState(false);
	const [isCompleted, setIsCompleted] = useState(false);

	const createTodoMutation = useCreateTodo();
	const updateTodoMutation = useUpdateTodo();
	const deleteTodoMutation = useDeleteTodo();

	const handleConfirm = async () => {
		setIsProcessing(true);
		try {
			if (confirmation.operation === "create_todo") {
				const params = confirmation.data.params || {};
				const input: CreateTodoInput = {
					name: params.name as string,
					description: (params.description as string) || undefined,
					status: (params.status as TodoStatus) || ("active" as TodoStatus),
					priority: (params.priority as TodoPriority) || ("none" as TodoPriority),
				};
				await createTodoMutation.mutateAsync(input);
				toastSuccess("待办已创建");
			} else if (confirmation.operation === "update_todo") {
				const todoId = confirmation.data.todo_id;
				if (!todoId) {
					throw new Error("缺少todo_id");
				}
				const params = confirmation.data.params || {};
				const input: UpdateTodoInput = {
					name: params.name as string | undefined,
					description: (params.description as string) || undefined,
					status: params.status ? (params.status as TodoStatus) : undefined,
					priority: params.priority ? (params.priority as TodoPriority) : undefined,
				};
				// 移除undefined字段
				Object.keys(input).forEach((key) => {
					if (input[key as keyof UpdateTodoInput] === undefined) {
						delete input[key as keyof UpdateTodoInput];
					}
				});
				await updateTodoMutation.mutateAsync({ id: todoId, input });
				toastSuccess("待办已更新");
			} else if (confirmation.operation === "delete_todo") {
				const todoId = confirmation.data.todo_id;
				if (!todoId) {
					throw new Error("缺少todo_id");
				}
				await deleteTodoMutation.mutateAsync(todoId);
				toastSuccess("待办已删除");
			}
			// 设置完成状态，但不立即调用onComplete
			setIsCompleted(true);
		} catch (error) {
			console.error("执行操作失败:", error);
			toastError(
				error instanceof Error ? error.message : "操作失败，请稍后重试",
			);
		} finally {
			setIsProcessing(false);
		}
	};

	const handleCancel = () => {
		onComplete();
	};

	// 已完成状态
	if (isCompleted) {
		const successMessages: Record<string, string> = {
			create_todo: "待办已创建",
			update_todo: "待办已更新",
			delete_todo: "待办已删除",
		};

		return (
			<div className="mt-3 rounded-lg border-2 border-green-500/50 bg-green-50/50 dark:bg-green-950/30 p-4">
				<div className="mb-3 flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
					<CheckCircle2 className="h-5 w-5" />
					{successMessages[confirmation.operation] || "操作已完成"}
				</div>
				<div className="whitespace-pre-wrap text-sm text-green-600 dark:text-green-300">
					{confirmation.preview}
				</div>
			</div>
		);
	}

	// 待确认状态
	return (
		<div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
			<div className="mb-3 text-sm font-medium text-foreground">
				{confirmation.operation === "create_todo" && "创建待办"}
				{confirmation.operation === "update_todo" && "更新待办"}
				{confirmation.operation === "delete_todo" && "删除待办"}
			</div>
			<div className="mb-4 whitespace-pre-wrap text-sm text-muted-foreground">
				{confirmation.preview}
			</div>
			<div className="flex gap-2">
				<button
					type="button"
					onClick={handleConfirm}
					disabled={isProcessing}
					className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
				>
					<Check className="h-4 w-4" />
					{isProcessing ? "处理中..." : "确认"}
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
