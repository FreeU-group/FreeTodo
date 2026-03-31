"use client";

import { AlertCircle, CheckCircle2, ChevronRight, Loader2, Wrench } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { ToolCallStep } from "@/apps/chat/types";
import { cn } from "@/lib/utils";

type ToolCallStepsProps = {
	steps: ToolCallStep[];
	className?: string;
};

/**
 * 工具调用步骤列表组件
 * 显示 Agent 执行过程中的每个工具调用步骤
 */
export function ToolCallSteps({ steps, className }: ToolCallStepsProps) {
	const t = useTranslations("chat.toolCall");

	if (!steps || steps.length === 0) {
		return null;
	}

	// Deduplicate consecutive steps with the same toolName — keep only the last of each run
	const deduped: ToolCallStep[] = [];
	for (let i = 0; i < steps.length; i++) {
		const next = steps[i + 1];
		if (next && next.toolName === steps[i].toolName && steps[i].status !== "running") {
			continue;
		}
		deduped.push(steps[i]);
	}

	return (
		<div className={cn("flex flex-col gap-2 mb-3", className)}>
			{deduped.map((step) => (
				<ToolCallStepItem key={step.id} step={step} t={t} />
			))}
		</div>
	);
}

type ToolCallStepItemProps = {
	step: ToolCallStep;
	t: ReturnType<typeof useTranslations<"chat.toolCall">>;
};

/**
 * 单个工具调用步骤项
 */
function ToolCallStepItem({ step, t }: ToolCallStepItemProps) {
	const { toolName, toolArgs, status, resultPreview } = step;
	const [expanded, setExpanded] = useState(status === "running");

	useEffect(() => {
		if (status !== "running") {
			setExpanded(false);
		}
	}, [status]);

	const toolKey = `tools.${toolName}` as Parameters<typeof t>[0];
	const displayName = t.has(toolKey) ? t(toolKey) : toolName;

	const StatusIcon = {
		running: Loader2,
		completed: CheckCircle2,
		error: AlertCircle,
	}[status];

	const statusColorClass = {
		running: "text-primary",
		completed: "text-primary",
		error: "text-red-500",
	}[status];

	const borderColorClass = {
		running: "border-primary/30 dark:border-primary/50",
		completed: "border-primary/20 dark:border-primary/30",
		error: "border-red-200 dark:border-red-800",
	}[status];

	const bgColorClass = {
		running: "bg-primary/5 dark:bg-primary/20",
		completed: "bg-primary/5 dark:bg-primary/10",
		error: "bg-red-50/50 dark:bg-red-950/30",
	}[status];

	const formatArgs = (args: Record<string, unknown> | undefined): string => {
		if (!args || Object.keys(args).length === 0) return "";
		const entries = Object.entries(args).slice(0, 3);
		return entries
			.map(([key, value]) => {
				const strValue =
					typeof value === "string"
						? value.length > 50
							? `${value.substring(0, 50)}...`
							: value
						: JSON.stringify(value);
				return `${key}: ${strValue}`;
			})
			.join(", ");
	};

	const hasDetails =
		(toolArgs && Object.keys(toolArgs).length > 0) ||
		((status === "completed" || status === "error") && resultPreview);

	return (
		<div
			className={cn(
				"rounded-lg border transition-all duration-200",
				borderColorClass,
				bgColorClass,
			)}
		>
			{/* Header — always visible, clickable to toggle */}
			<button
				type="button"
				onClick={() => hasDetails && setExpanded(!expanded)}
				className={cn(
					"flex w-full items-center gap-3 p-3 text-left",
					hasDetails && "cursor-pointer",
				)}
			>
				<div
					className={cn(
						"shrink-0 w-7 h-7 rounded-full flex items-center justify-center",
						status === "running" ? "bg-primary/10 dark:bg-primary/25" : "",
						status === "completed" ? "bg-primary/10 dark:bg-primary/20" : "",
						status === "error" ? "bg-red-100 dark:bg-red-900" : "",
					)}
				>
					<Wrench className={cn("w-3.5 h-3.5", statusColorClass)} />
				</div>

				<span className="flex-1 font-medium text-sm text-foreground truncate">
					{status === "running"
						? t("calling", { tool: displayName })
						: status === "completed"
							? t("completed", { tool: displayName })
							: t("failed", { tool: displayName })}
				</span>

				<StatusIcon
					className={cn(
						"w-4 h-4 shrink-0",
						statusColorClass,
						status === "running" && "animate-spin",
					)}
				/>

				{hasDetails && (
					<ChevronRight
						className={cn(
							"w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
							expanded && "rotate-90",
						)}
					/>
				)}
			</button>

			{/* Details — collapsible */}
			{expanded && hasDetails && (
				<div className="px-3 pb-3 pt-0 space-y-2">
					{toolArgs && Object.keys(toolArgs).length > 0 && (
						<div className="text-xs text-muted-foreground font-mono bg-background/50 rounded p-2 truncate">
							params: {formatArgs(toolArgs)}
						</div>
					)}
					{(status === "completed" || status === "error") && resultPreview && (
						<div className="text-xs text-muted-foreground bg-background/50 rounded p-2 max-h-32 overflow-auto">
							<span
								className={cn(
									status === "completed"
										? "text-primary"
										: "text-red-600 dark:text-red-400",
								)}
							>
								{t("result")}:
							</span>{" "}
							{resultPreview.length > 300
								? `${resultPreview.substring(0, 300)}...`
								: resultPreview}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
