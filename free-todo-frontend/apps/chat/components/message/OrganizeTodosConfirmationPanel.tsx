"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Check, CheckCircle2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { queryKeys } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";

type TodoInfo = {
	id: number;
	name: string;
};

type OrganizeTodosConfirmationData = {
	type: "organize_todos_confirmation";
	operation: "organize_todos";
	todos: TodoInfo[];
	parent_title: string;
	todo_ids: number[];
	preview: string;
};

type OrganizeTodosConfirmationPanelProps = {
	confirmation: OrganizeTodosConfirmationData;
	onComplete: () => void;
};

export function OrganizeTodosConfirmationPanel({
	confirmation,
	onComplete,
}: OrganizeTodosConfirmationPanelProps) {
	const [isProcessing, setIsProcessing] = useState(false);
	const [isCompleted, setIsCompleted] = useState(false);
	const [parentTitle, setParentTitle] = useState(confirmation.parent_title);
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

	const handleConfirm = async () => {
		if (!parentTitle.trim()) {
			toastError("请输入父任务标题");
			return;
		}

		setIsProcessing(true);
		try {
			const response = await fetch("/api/todos/organize", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					parent_title: parentTitle.trim(),
					todo_ids: confirmation.todo_ids,
				}),
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData.detail || "整理待办失败");
			}

			const result = await response.json();

			// 刷新待办列表
			queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
			toastSuccess(
				`成功创建父任务"${parentTitle.trim()}"，已将 ${result.updated_count} 个待办整理到其下`,
			);
			setIsCompleted(true);
		} catch (error) {
			console.error("整理待办失败:", error);
			toastError(
				error instanceof Error ? error.message : "整理待办失败，请稍后重试",
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
		return (
			<div className="mt-3 rounded-lg border-2 border-green-500/50 bg-green-50/50 dark:bg-green-950/30 p-4">
				<div className="mb-3 flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-400">
					<CheckCircle2 className="h-5 w-5" />
					待办已整理
				</div>
				<div className="mb-4 whitespace-pre-wrap text-sm text-green-600 dark:text-green-300">
					已成功创建父任务"{parentTitle.trim()}"，并将{" "}
					{confirmation.todos.length} 个待办整理到其下
				</div>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={handleCancel}
						className="flex items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
					>
						<X className="h-4 w-4" />
						关闭
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
			<div className="mb-3 text-sm font-medium text-foreground">
				整理待办到父任务 ({confirmation.todos.length} 个)
			</div>

			{/* 待办列表 */}
			<div className="mb-4 max-h-[300px] space-y-2 overflow-y-auto rounded-md border border-border/50 bg-muted/30 p-3">
				{confirmation.todos.map((todo) => (
					<div
						key={todo.id}
						className="flex items-center gap-2 rounded-md border border-border/50 bg-background p-2 text-sm"
					>
						<span className="font-medium text-foreground">
							ID: {todo.id} | {todo.name}
						</span>
					</div>
				))}
			</div>

			{/* 父任务标题输入 */}
			<div className="mb-4">
				<label
					htmlFor="parent-title-input"
					className="mb-2 block text-sm font-medium text-foreground"
				>
					父任务标题
				</label>
				<input
					id="parent-title-input"
					type="text"
					value={parentTitle}
					onChange={(e) => setParentTitle(e.target.value)}
					placeholder="请输入父任务标题"
					className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
					disabled={isProcessing}
				/>
			</div>

			<div className="flex gap-2">
				<button
					type="button"
					onClick={handleConfirm}
					disabled={isProcessing || !parentTitle.trim()}
					className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
				>
					<Check className="h-4 w-4" />
					{isProcessing ? "整理中..." : "确认整理"}
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
