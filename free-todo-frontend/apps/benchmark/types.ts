export type BenchmarkTestCaseCategory =
	| "intent_ambiguous"
	| "short_long_boundary"
	| "tool_conflict";

export type BenchmarkTestRunStatus = "pending" | "running" | "completed" | "failed";

export type BenchmarkTestCase = {
	id: number;
	category: BenchmarkTestCaseCategory;
	query: string;
	description: string | null;
	expected_evaluation_points: Record<string, unknown> | null;
	order: number;
	created_at: string;
	updated_at: string;
};

export type BenchmarkTestRun = {
	id: number;
	test_case_id: number;
	session_id: string;
	status: BenchmarkTestRunStatus;
	started_at: string | null;
	completed_at: string | null;
	agent_response: string | null;
	execution_log: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
};

export type BenchmarkTestResult = {
	id: number;
	test_run_id: number;
	evaluation_point: string;
	auto_evaluated: boolean | null;
	manual_override: boolean | null;
	final_result: boolean | null;
	evaluation_details: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
};

export type BenchmarkTestCaseCreate = {
	category: BenchmarkTestCaseCategory;
	query: string;
	description?: string | null;
	expected_evaluation_points?: Record<string, unknown> | null;
	order?: number;
};

export type BenchmarkTestCaseUpdate = {
	category?: BenchmarkTestCaseCategory;
	query?: string;
	description?: string | null;
	expected_evaluation_points?: Record<string, unknown> | null;
	order?: number;
};

export type BenchmarkTestResultUpdate = {
	manual_override?: boolean | null;
	evaluation_details?: Record<string, unknown> | null;
};
