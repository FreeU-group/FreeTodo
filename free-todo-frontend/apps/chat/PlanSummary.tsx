"use client";

import { Check, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { ParsedTodoTree } from "@/apps/chat/types";
import { cn } from "@/lib/utils";

interface PlanSummaryProps {
	summary: string;
	subtasks: ParsedTodoTree[];
	onAccept: () => void;
	isApplying: boolean;
	locale: string;
}

function SubtaskTree({
	subtasks,
	depth = 0,
}: {
	subtasks: ParsedTodoTree[];
	depth?: number;
}) {
	return (
		<ul className={cn("space-y-2", depth > 0 && "ml-6 mt-2")}>
			{subtasks.map((subtask) => (
				<li key={subtask.name} className="text-sm">
					<div className="flex items-start gap-2">
						<span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
						<div className="flex-1">
							<div className="font-medium">{subtask.name}</div>
							{subtask.description && (
								<div className="mt-1 text-xs text-muted-foreground">
									{subtask.description}
								</div>
							)}
							{subtask.subtasks && subtask.subtasks.length > 0 && (
								<SubtaskTree subtasks={subtask.subtasks} depth={depth + 1} />
							)}
						</div>
					</div>
				</li>
			))}
		</ul>
	);
}

export function PlanSummary({
	summary,
	subtasks,
	onAccept,
	isApplying,
	locale,
}: PlanSummaryProps) {
	return (
		<div className="flex-1 overflow-y-auto px-4 py-4">
			<div className="mx-auto max-w-2xl space-y-6">
				<div className="rounded-lg bg-muted/50 p-4">
					<h3 className="mb-2 text-lg font-semibold">
						{locale === "zh" ? "任务规划结果" : "Task Planning Result"}
					</h3>
					<p className="text-sm text-muted-foreground">
						{locale === "zh"
							? "请查看AI生成的任务总结和子任务列表，确认后点击接收"
							: "Please review the AI-generated task summary and subtask list, then click Accept to confirm"}
					</p>
				</div>

				{/* 任务总结 */}
				<div className="rounded-lg border bg-card p-4 shadow-sm">
					<h4 className="mb-3 text-base font-semibold">
						{locale === "zh" ? "任务总结" : "Task Summary"}
					</h4>
					<div className="prose prose-sm max-w-none dark:prose-invert">
						<ReactMarkdown>{summary}</ReactMarkdown>
					</div>
				</div>

				{/* 子任务列表 */}
				<div className="rounded-lg border bg-card p-4 shadow-sm">
					<h4 className="mb-3 text-base font-semibold">
						{locale === "zh" ? "子任务列表" : "Subtask List"}
					</h4>
					{subtasks.length > 0 ? (
						<SubtaskTree subtasks={subtasks} />
					) : (
						<p className="text-sm text-muted-foreground">
							{locale === "zh" ? "没有生成子任务" : "No subtasks generated"}
						</p>
					)}
				</div>

				{/* 接收按钮 */}
				<div className="flex justify-end pt-4">
					<button
						type="button"
						onClick={onAccept}
						disabled={isApplying}
						className={cn(
							"flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors",
							isApplying
								? "cursor-not-allowed opacity-50"
								: "hover:bg-primary/90",
						)}
					>
						{isApplying ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								{locale === "zh" ? "应用中..." : "Applying..."}
							</>
						) : (
							<>
								<Check className="h-4 w-4" />
								{locale === "zh" ? "接收并应用" : "Accept & Apply"}
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
