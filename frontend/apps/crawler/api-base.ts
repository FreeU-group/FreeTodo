export function getCrawlerApiBaseUrl(): string {
	if (typeof window !== "undefined") {
		return "";
	}

	return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";
}
