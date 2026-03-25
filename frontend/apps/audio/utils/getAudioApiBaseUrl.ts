import { getRuntimeBackendUrl } from "@/lib/runtime-backend-url";

export function getAudioApiBaseUrl(): string {
	return getRuntimeBackendUrl("http://127.0.0.1:8100");
}
