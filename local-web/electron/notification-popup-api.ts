export interface PopupActionResponse {
	success?: boolean;
	message?: string;
	detail?: unknown;
	data?: Record<string, unknown> | null;
	status: number;
	body: string;
}

export interface PopupExecutionStep {
	key: string;
	label: string;
	status: string;
	detail?: string;
}

export interface PopupExecutionMessage {
	role: string;
	content: string;
}

export interface PopupProgressResponse {
	action_id: string;
	title?: string;
	description?: string;
	action_type?: "todo" | "executable";
	status: string;
	execution_plan?: string[];
	execution_steps?: PopupExecutionStep[];
	execution_messages?: PopupExecutionMessage[];
	streaming_output?: string;
	result?: string;
	activity_id?: string;
}

export interface PopupExecutionSessionPayload {
	session_id: string;
	initial_message: string;
	initial_user_input: string;
	selected_tools: string[];
	external_tools: string[];
	is_new_session: boolean;
}

export async function postIntentAction(
	baseUrl: string,
	actionId: string,
	action: "confirm" | "reject" | "execute",
): Promise<PopupActionResponse> {
	const response = await fetch(`${baseUrl}/api/intent-actions/${actionId}/${action}`, {
		method: "POST",
	});
	const body = await response.text().catch(() => "");
	let parsed: Omit<PopupActionResponse, "status" | "body"> | null = null;
	try {
		parsed = JSON.parse(body) as Omit<PopupActionResponse, "status" | "body">;
	} catch {
		parsed = null;
	}

	return {
		status: response.status,
		body,
		success: parsed?.success,
		message: parsed?.message,
		detail: parsed?.detail,
		data: parsed?.data ?? null,
	};
}

export async function fetchIntentProgress(
	baseUrl: string,
	actionId: string,
): Promise<PopupProgressResponse | null> {
	const response = await fetch(`${baseUrl}/api/intent-actions/${actionId}/progress`);
	if (!response.ok) return null;
	return (await response.json()) as PopupProgressResponse;
}
