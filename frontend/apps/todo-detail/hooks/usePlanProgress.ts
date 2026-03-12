import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	createAgentPlan,
	fetchLatestPlanForTodo,
	runAgentPlanStream,
} from "@/lib/api";
import type { Todo } from "@/lib/types";
import type {
	PlanEvent,
	PlanRunInfo,
	PlanRunStepInfo,
	PlanSpec,
} from "@/lib/types/plan";

const buildMessageFromTodo = (todo: Todo) => {
	const parts = [`Task: ${todo.name}`];
	if (todo.description) {
		parts.push(`Description: ${todo.description}`);
	}
	if (todo.userNotes) {
		parts.push(`Notes: ${todo.userNotes}`);
	}
	return parts.join("\n");
};

const buildPendingStep = (
	stepId: string,
	stepName: string,
): PlanRunStepInfo => ({
	stepId,
	stepName,
	status: "pending",
	retryCount: 0,
});

const buildStepsFromSpec = (plan: PlanSpec): PlanRunStepInfo[] => {
	return plan.steps.map((step) => buildPendingStep(step.stepId, step.name));
};

const mergeSteps = (
	plan: PlanSpec,
	runSteps: PlanRunStepInfo[],
): PlanRunStepInfo[] => {
	const runMap = new Map(runSteps.map((step) => [step.stepId, step]));
	const planStepIds = new Set(plan.steps.map((step) => step.stepId));
	const merged = plan.steps.map((step) => {
		return runMap.get(step.stepId) ?? buildPendingStep(step.stepId, step.name);
	});

	for (const step of runSteps) {
		if (!planStepIds.has(step.stepId)) {
			merged.push(step);
		}
	}
	return merged;
};

export function usePlanProgress(todo: Todo | null) {
	const [plan, setPlan] = useState<PlanSpec | null>(null);
	const [run, setRun] = useState<PlanRunInfo | null>(null);
	const [steps, setSteps] = useState<PlanRunStepInfo[]>([]);
	const [loading, setLoading] = useState(false);
	const [running, setRunning] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	const handlePlanEvent = useCallback((event: PlanEvent) => {
		if (event.type === "plan_started") {
			setRun((prev) => ({
				runId: event.run_id ?? prev?.runId ?? "",
				planId: event.plan_id ?? prev?.planId ?? "",
				status: "running",
				sessionId: prev?.sessionId ?? null,
				error: null,
				rollbackStatus: prev?.rollbackStatus ?? null,
				rollbackError: prev?.rollbackError ?? null,
				startedAt: event.timestamp ?? prev?.startedAt ?? null,
				endedAt: null,
				cancelRequested: false,
			}));
			return;
		}

		if (event.type === "plan_completed") {
			setRun((prev) =>
				prev
					? { ...prev, status: "completed", endedAt: event.timestamp ?? null }
					: prev,
			);
			return;
		}

		if (event.type === "plan_failed") {
			setRun((prev) =>
				prev
					? {
							...prev,
							status: "failed",
							error: event.error ?? null,
							endedAt: event.timestamp ?? null,
						}
					: prev,
			);
			return;
		}

		if (event.type === "plan_cancelled") {
			setRun((prev) =>
				prev
					? { ...prev, status: "cancelled", endedAt: event.timestamp ?? null }
					: prev,
			);
			return;
		}

		if (event.step_id) {
			const stepId = event.step_id;
			setSteps((prev) => {
				const existing = prev.find((step) => step.stepId === stepId);
				const nextStatus =
					event.type === "step_started"
						? "running"
						: event.type === "step_completed"
							? "success"
							: event.type === "step_failed"
								? "failed"
								: event.type === "step_rollback_started"
									? "rollbacking"
									: event.type === "step_rollback_completed"
										? "rolled_back"
										: existing?.status ?? "pending";
				const nextRetry =
					event.type === "step_retry" && event.retry_count != null
						? event.retry_count
						: existing?.retryCount ?? 0;
				const nextError =
					event.type === "step_failed"
						? event.error ?? existing?.error ?? null
						: existing?.error ?? null;

				if (!existing) {
					return [
						...prev,
						{
							...buildPendingStep(stepId, stepId),
							status: nextStatus,
							retryCount: nextRetry,
							error: nextError,
						},
					];
				}
				return prev.map((step) =>
					step.stepId === stepId
						? {
								...step,
								status: nextStatus,
								retryCount: nextRetry,
								error: nextError ?? step.error,
							}
						: step,
				);
			});
		}
	}, []);

	const refresh = useCallback(async () => {
		if (!todo?.id) {
			setPlan(null);
			setRun(null);
			setSteps([]);
			return;
		}
		setLoading(true);
		setError(null);
		try {
			const data = await fetchLatestPlanForTodo(todo.id);
			setPlan(data.plan ?? null);
			setRun(data.run ?? null);
			if (data.plan) {
				setSteps(mergeSteps(data.plan, data.steps));
			} else {
				setSteps(data.steps);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load plan");
		} finally {
			setLoading(false);
		}
	}, [todo?.id]);

	const runPlan = useCallback(
		async (planId: string) => {
			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;
			setRunning(true);
			setError(null);
			setSteps((prev) =>
				prev.map((step) => ({
					...step,
					status: "pending",
					error: null,
					retryCount: 0,
				})),
			);
			try {
				await runAgentPlanStream(planId, handlePlanEvent, controller.signal);
			} catch (err) {
				if (!controller.signal.aborted) {
					setError(err instanceof Error ? err.message : "Plan run failed");
				}
			} finally {
				setRunning(false);
			}
		},
		[handlePlanEvent],
	);

	const createAndRun = useCallback(async () => {
		if (!todo) return;
		setLoading(true);
		setError(null);
		try {
			const planSpec = await createAgentPlan({
				message: buildMessageFromTodo(todo),
				todoId: todo.id,
			});
			setPlan(planSpec);
			setSteps(buildStepsFromSpec(planSpec));
			await runPlan(planSpec.planId);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create plan");
		} finally {
			setLoading(false);
		}
	}, [runPlan, todo]);

	const hasPlan = Boolean(plan);
	const runStatus = useMemo(() => run?.status ?? "pending", [run]);

	useEffect(() => {
		refresh();
		return () => {
			abortRef.current?.abort();
		};
	}, [refresh]);

	return {
		plan,
		run,
		steps,
		hasPlan,
		runStatus,
		loading,
		running,
		error,
		refresh,
		createAndRun,
		runPlan,
	};
}
