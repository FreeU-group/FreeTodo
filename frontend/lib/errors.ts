export function extractErrorMessage(
	error: unknown,
	fallback = "Unknown error",
): string {
	if (error instanceof Error) {
		return error.message || fallback;
	}

	if (typeof error === "string") {
		return error || fallback;
	}

	if (error && typeof error === "object") {
		const candidate = error as {
			detail?: unknown;
			error?: unknown;
			message?: unknown;
		};

		for (const value of [candidate.detail, candidate.error, candidate.message]) {
			if (typeof value === "string" && value.trim()) {
				return value;
			}
		}
	}

	return fallback;
}
