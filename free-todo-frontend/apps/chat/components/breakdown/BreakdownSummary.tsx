"use client";

import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import type { ParsedTodoTree } from "@/apps/chat/types";
import type { Locale } from "@/lib/store/locale";
import { cn } from "@/lib/utils";

interface BreakdownSummaryProps {
	summary: string;
	subtasks: ParsedTodoTree[];
	onAccept: () => void;
	isApplying: boolean;
	locale: Locale;
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

export function BreakdownSummary({
	summary,
	subtasks,
	onAccept,
	isApplying,
	locale: _locale,
}: BreakdownSummaryProps) {
	const t = useTranslations("chat");

	return (
		<div className="flex-1 overflow-y-auto px-4 py-4">
			<div className="mx-auto max-w-2xl space-y-6">
				<div className="rounded-lg bg-muted/50 p-4">
					<h3 className="mb-2 text-lg font-semibold">
						{t("breakdownSummary.title")}
					</h3>
					<p className="text-sm text-muted-foreground">
						{t("breakdownSummary.description")}
					</p>
				</div>

				{/* 待办总结 */}
				<div className="rounded-lg border bg-card p-4 shadow-sm">
					<h4 className="mb-3 text-base font-semibold">
						{t("breakdownSummary.taskSummary")}
					</h4>
					<div className="prose prose-sm max-w-none dark:prose-invert">
						<ReactMarkdown>{summary}</ReactMarkdown>
					</div>
				</div>

				{/* 子待办列表 */}
				<div className="rounded-lg border bg-card p-4 shadow-sm">
					<h4 className="mb-3 text-base font-semibold">
						{t("breakdownSummary.subtaskList")}
					</h4>
					{subtasks.length > 0 ? (
						<SubtaskTree subtasks={subtasks} />
					) : (
						<p className="text-sm text-muted-foreground">
							{t("breakdownSummary.noSubtasks")}
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
								{t("breakdownSummary.applying")}
							</>
						) : (
							<>
								<Check className="h-4 w-4" />
								{t("breakdownSummary.acceptAndApply")}
							</>
						)}
					</button>
				</div>
			</div>
		</div>
	);
}
