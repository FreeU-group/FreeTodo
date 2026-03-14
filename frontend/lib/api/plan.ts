import type {
	PlanEvent,
	PlanRunInfo,
	PlanRunStatusResponse,
	PlanRunStepInfo,
	PlanSpec,
} from "@/lib/types/plan";
import { getStreamApiBaseUrl } from "@/lib/api/base";

// Plan 执行事件标记（与后端保持一致）
const PLAN_EVENT_PREFIX = "\n[PLAN_EVENT:";
const PLAN_EVENT_SUFFIX = "]\n";

function parsePlanEvents(chunk: string): [PlanEvent[], string] {
	const events: PlanEvent[] = [];
	let content = chunk;

	let startIdx = content.indexOf(PLAN_EVENT_PREFIX);
	while (startIdx !== -1) {
		const endIdx = content.indexOf(PLAN_EVENT_SUFFIX, startIdx);
		if (endIdx === -1) {
			break;
		}

		const jsonStart = startIdx + PLAN_EVENT_PREFIX.length;
		const jsonStr = content.substring(jsonStart, endIdx);
		try {
			const event = JSON.parse(jsonStr) as PlanEvent;
			events.push(event);
		} catch (e) {
			console.error("[parsePlanEvents] Failed to parse event:", jsonStr, e);
		}

		content =
			content.substring(0, startIdx) +
			content.substring(endIdx + PLAN_EVENT_SUFFIX.length);
		startIdx = content.indexOf(PLAN_EVENT_PREFIX);
	}

	return [events, content];
}

/**
 * Plan功能：生成选择题（流式输出）
 */
export async function planQuestionnaireStream(
	todoName: string,
	onChunk: (chunk: string) => void,
	todoId?: number,
): Promise<void> {
	// 流式请求直接调用后端 API，绕过 Next.js 代理
	const baseUrl = getStreamApiBaseUrl();
	const response = await fetch(
		`${baseUrl}/api/chat/plan/questionnaire/stream`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				todo_name: todoName,
				todo_id: todoId,
			}),
		},
	);

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	if (!response.body) {
		throw new Error("ReadableStream is not supported in this environment");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		if (value) {
			const chunk = decoder.decode(value, { stream: true });
			if (chunk) {
				onChunk(chunk);
			}
		}
	}
}

/**
 * Plan功能：生成任务总结和子任务（流式输出）
 */
export async function planSummaryStream(
	todoName: string,
	answers: Record<string, string[]>,
	onChunk: (chunk: string) => void,
): Promise<void> {
	// 流式请求直接调用后端 API，绕过 Next.js 代理
	const baseUrl = getStreamApiBaseUrl();
	const response = await fetch(`${baseUrl}/api/chat/plan/summary/stream`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			todo_name: todoName,
			answers: answers,
		}),
	});

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}

	if (!response.body) {
		throw new Error("ReadableStream is not supported in this environment");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		if (value) {
			const chunk = decoder.decode(value, { stream: true });
			if (chunk) {
				onChunk(chunk);
			}
		}
	}
}

// ============================================================================
// Agent Plan 执行 API
// ============================================================================

type RawPlan = Record<string, unknown>;

function normalizePlanSpec(raw: RawPlan | null | undefined): PlanSpec | null {
	if (!raw) return null;
	const steps = Array.isArray(raw.steps) ? raw.steps : [];
	return {
		planId: String(raw.plan_id ?? ""),
		title: String(raw.title ?? ""),
		steps: steps.map((step: RawPlan, index: number) => ({
			stepId: String(step.step_id ?? `s${index + 1}`),
			name: String(step.name ?? ""),
			type: step.type as PlanSpec["steps"][number]["type"],
			tool: step.tool ? String(step.tool) : undefined,
			inputs: (step.inputs as Record<string, unknown>) ?? {},
			dependsOn: Array.isArray(step.depends_on)
				? (step.depends_on as string[])
				: [],
			parallelGroup: (step.parallel_group as string | null) ?? null,
			retry: step.retry
				? {
						maxRetries: Number(
							(step.retry as RawPlan).max_retries ?? 0,
						),
						backoffMs: (step.retry as RawPlan).backoff_ms
							? Number((step.retry as RawPlan).backoff_ms)
							: undefined,
					}
				: undefined,
			onFail: step.on_fail as "stop" | "skip" | undefined,
			isSideEffect: (step.is_side_effect as boolean | undefined) ?? undefined,
		})),
	};
}

function normalizeRunInfo(raw: RawPlan | null | undefined): PlanRunInfo | null {
	if (!raw) return null;
	return {
		runId: String(raw.run_id ?? ""),
		planId: String(raw.plan_id ?? ""),
		status: raw.status as PlanRunInfo["status"],
		sessionId: (raw.session_id as string | null | undefined) ?? null,
		error: (raw.error as string | null | undefined) ?? null,
		rollbackStatus: (raw.rollback_status as string | null | undefined) ?? null,
		rollbackError: (raw.rollback_error as string | null | undefined) ?? null,
		startedAt: (raw.started_at as string | null | undefined) ?? null,
		endedAt: (raw.ended_at as string | null | undefined) ?? null,
		cancelRequested: Boolean(raw.cancel_requested),
	};
}

function normalizeRunStep(raw: RawPlan): PlanRunStepInfo {
	return {
		stepId: String(raw.step_id ?? ""),
		stepName: String(raw.step_name ?? ""),
		status: raw.status as PlanRunStepInfo["status"],
		retryCount: Number(raw.retry_count ?? 0),
		inputJson: (raw.input_json as string | null | undefined) ?? null,
		outputJson: (raw.output_json as string | null | undefined) ?? null,
		error: (raw.error as string | null | undefined) ?? null,
		startedAt: (raw.started_at as string | null | undefined) ?? null,
		endedAt: (raw.ended_at as string | null | undefined) ?? null,
		isSideEffect: Boolean(raw.is_side_effect),
		rollbackRequired: Boolean(raw.rollback_required),
	};
}

export async function createAgentPlan(params: {
	message: string;
	todoId?: number;
	context?: Record<string, unknown>;
}): Promise<PlanSpec> {
	const baseUrl = getStreamApiBaseUrl();
	const response = await fetch(`${baseUrl}/api/agent/plan`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			message: params.message,
			todo_id: params.todoId,
			context: params.context,
		}),
	});

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}
	const data = (await response.json()) as { plan: RawPlan };
	const plan = normalizePlanSpec(data.plan);
	if (!plan) {
		throw new Error("Plan response missing");
	}
	return plan;
}

export async function fetchLatestPlanForTodo(
	todoId: number,
): Promise<PlanRunStatusResponse> {
	const baseUrl = getStreamApiBaseUrl();
	const response = await fetch(`${baseUrl}/api/agent/plan/todo/${todoId}/latest`);
	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}
	const data = (await response.json()) as {
		plan?: RawPlan | null;
		run?: RawPlan | null;
		steps?: RawPlan[];
	};
	return {
		plan: normalizePlanSpec(data.plan),
		run: normalizeRunInfo(data.run),
		steps: Array.isArray(data.steps) ? data.steps.map(normalizeRunStep) : [],
	};
}

export async function runAgentPlanStream(
	planId: string,
	onEvent: (event: PlanEvent) => void,
	signal?: AbortSignal,
): Promise<void> {
	const baseUrl = getStreamApiBaseUrl();
	const response = await fetch(`${baseUrl}/api/agent/plan/run`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ plan_id: planId }),
		signal,
	});

	if (!response.ok) {
		throw new Error(`Request failed with status ${response.status}`);
	}
	if (!response.body) {
		throw new Error("ReadableStream is not supported in this environment");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let pendingChunk = "";

	while (true) {
		if (signal?.aborted) {
			await reader.cancel();
			break;
		}
		const { done, value } = await reader.read();
		if (done) break;
		if (!value) continue;

		const rawChunk = decoder.decode(value, { stream: true });
		const fullChunk = pendingChunk + rawChunk;
		const [events, content] = parsePlanEvents(fullChunk);

		for (const event of events) {
			onEvent(event);
		}

		const incompleteEventIdx = content.indexOf(PLAN_EVENT_PREFIX);
		if (incompleteEventIdx !== -1) {
			pendingChunk = content.substring(incompleteEventIdx);
		} else {
			pendingChunk = "";
		}
	}
}
