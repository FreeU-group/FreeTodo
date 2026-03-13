"use client";

type TelemetryEventPayload = {
	eventName: string;
	modality?: string;
	condition?: string;
	taskId?: string;
	messageId?: string;
	todoCount?: number;
	durationMs?: number;
	success?: boolean;
	metadata?: Record<string, unknown>;
};

const SESSION_KEY = "ft_telemetry_session_id";
const CONDITION_KEY = "ft_experiment_condition";
const TASK_KEY = "ft_experiment_task_id";

function getSessionId(): string | null {
	if (typeof window === "undefined") return null;
	try {
		const existing = window.localStorage.getItem(SESSION_KEY);
		if (existing) return existing;
		const created =
			typeof crypto !== "undefined" && "randomUUID" in crypto
				? crypto.randomUUID()
				: `${Date.now()}-${Math.random().toString(16).slice(2)}`;
		window.localStorage.setItem(SESSION_KEY, created);
		return created;
	} catch {
		return null;
	}
}

function readLocalStorage(key: string): string | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage.getItem(key);
	} catch {
		return null;
	}
}

export async function logTelemetryEvent(
	payload: TelemetryEventPayload,
): Promise<void> {
	if (typeof window === "undefined") return;

	const sessionId = getSessionId();
	const condition = payload.condition
		? payload.condition
		: readLocalStorage(CONDITION_KEY);
	const taskId = payload.taskId ? payload.taskId : readLocalStorage(TASK_KEY);

	const body = {
		event_name: payload.eventName,
		client_ts: new Date().toISOString(),
		session_id: sessionId,
		condition,
		modality: payload.modality,
		task_id: taskId,
		message_id: payload.messageId,
		todo_count: payload.todoCount,
		duration_ms: payload.durationMs,
		success: payload.success,
		metadata: payload.metadata,
	};

	try {
		await fetch("/api/telemetry/event", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(body),
			keepalive: true,
		});
	} catch {
		// Telemetry should never block user flows.
	}
}

export function setExperimentCondition(value: string): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(CONDITION_KEY, value);
	} catch {
		// ignore
	}
}

export function setExperimentTaskId(value: string): void {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(TASK_KEY, value);
	} catch {
		// ignore
	}
}
