/**
 * 获取流式 API 的基础 URL
 * 流式请求直接调用后端 API，绕过 Next.js 代理，避免 gzip 压缩破坏流式传输
 */
export function getStreamApiBaseUrl(): string {
	if (typeof window !== "undefined") {
		const host = window.location.hostname;
		if (host === "localhost" || host === "127.0.0.1") {
			return `http://${host}:8001`;
		}
	}
	return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";
}
