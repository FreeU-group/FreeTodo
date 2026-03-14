/**
 * 获取流式 API 的基础 URL
 * 流式请求直接调用后端 API，绕过 Next.js 代理，避免 gzip 压缩破坏流式传输
 */
export function getStreamApiBaseUrl(): string {
	// 流式请求始终直接调用后端，避免 Next.js 代理导致的缓冲/压缩问题
	return process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";
}
