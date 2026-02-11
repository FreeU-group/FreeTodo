export function getAudioApiBaseUrl(): string {
	return typeof window !== "undefined"
		? ""
		: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";
}
