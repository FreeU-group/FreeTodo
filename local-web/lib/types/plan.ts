export type PlanStepType = "tool" | "llm" | "condition";
export type PlanStepStatus =
	| "pending"
	| "running"
	| "success"
	| "failed"
	| "rollbacking"
	| "rolled_back"
	| "skipped";

export type PlanRunStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "cancelled";

export interface PlanRetryPolicy {
	maxRetries: number;
	backoffMs?: number;
}

export interface PlanStep {
	stepId: string;
	name: string;
	type: PlanStepType;
	tool?: string;
	inputs: Record<string, unknown>;
	dependsOn: string[];
	parallelGroup?: string | null;
	retry?: PlanRetryPolicy;
	onFail?: "stop" | "skip";
	isSideEffect?: boolean;
}

export interface PlanSpec {
	planId: string;
	title: string;
	steps: PlanStep[];
}

export interface PlanRunInfo {
	runId: string;
	planId: string;
	status: PlanRunStatus;
	sessionId?: string | null;
	error?: string | null;
	rollbackStatus?: string | null;
	rollbackError?: string | null;
	startedAt?: string | null;
	endedAt?: string | null;
	cancelRequested?: boolean;
}

export interface PlanRunStepInfo {
	stepId: string;
	stepName: string;
	status: PlanStepStatus;
	retryCount: number;
	inputJson?: string | null;
	outputJson?: string | null;
	error?: string | null;
	startedAt?: string | null;
	endedAt?: string | null;
	isSideEffect?: boolean;
	rollbackRequired?: boolean;
}

export interface PlanRunStatusResponse {
	plan?: PlanSpec | null;
	run?: PlanRunInfo | null;
	steps: PlanRunStepInfo[];
}

export type PlanEventType =
	| "plan_started"
	| "plan_completed"
	| "plan_failed"
	| "plan_cancelled"
	| "step_started"
	| "step_completed"
	| "step_failed"
	| "step_retry"
	| "rollback_started"
	| "rollback_completed"
	| "step_rollback_started"
	| "step_rollback_completed";

export interface PlanEvent {
	type: PlanEventType;
	plan_id?: string;
	run_id?: string;
	step_id?: string;
	status?: string;
	error?: string;
	retry_count?: number;
	timestamp?: string;
}
