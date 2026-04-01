type RuntimeWindow = Window & {
	__BACKEND_URL__?: string;
};

export function getRuntimeBackendUrl(
	fallback = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001",
): string {
	if (typeof window !== "undefined") {
		const runtimeUrl = (window as RuntimeWindow).__BACKEND_URL__?.trim();
		if (runtimeUrl) {
			return runtimeUrl.replace(/\/$/, "");
		}
	}

	return fallback.replace(/\/$/, "");
}
