import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanInfo, StepInfo } from "./utils/messageContentUtils";

type PlanDisplayProps = {
	planInfo: PlanInfo;
	steps: Array<StepInfo>;
	isStreaming?: boolean;
	currentStepId?: number;
};

export function PlanDisplay({
	planInfo,
	steps,
	isStreaming = false,
	currentStepId,
}: PlanDisplayProps) {
	return (
		<div className="my-4 rounded-lg border border-border bg-muted/50 p-4">
			<div className="mb-3 flex items-center gap-2">
				<div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
					{planInfo.stepCount}
				</div>
				<h3 className="text-sm font-semibold text-foreground">
					执行计划 ({planInfo.stepCount} 步)
				</h3>
			</div>
			<div className="space-y-2">
				{steps.map((step) => {
					// 如果currentStepId未定义，说明所有步骤都已完成
					const isCompleted = currentStepId === undefined || step.stepId < currentStepId;
					const isCurrent = step.stepId === currentStepId;
					const isPending = currentStepId !== undefined && step.stepId > currentStepId;

					return (
						<div
							key={step.stepId}
							className={cn(
								"flex items-start gap-3 rounded-md p-2.5 transition-colors",
								isCurrent && "bg-primary/5",
								isPending && "opacity-60",
							)}
						>
							<div className="mt-0.5 shrink-0">
								{isCompleted ? (
									<CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
								) : isCurrent && isStreaming ? (
									<Loader2 className="h-5 w-5 animate-spin text-primary" />
								) : (
									<Circle className="h-5 w-5 text-muted-foreground" />
								)}
							</div>
							<div className="flex-1">
								<div className="flex items-center gap-2">
									<span className="text-xs font-medium text-muted-foreground">
										步骤 {step.stepId}
									</span>
									{isCurrent && isStreaming && (
										<span className="text-xs text-primary">执行中...</span>
									)}
								</div>
								<p className="mt-0.5 text-sm text-foreground">
									{step.instruction}
								</p>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
