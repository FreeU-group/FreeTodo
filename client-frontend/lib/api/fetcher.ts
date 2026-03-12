import type { ZodType } from "zod";
import { camelToSnake, snakeToCamel } from "../generated/case-transform";

type CustomFetcherOptions<T> = RequestInit & {
	params?: Record<string, unknown>;
	data?: unknown;
	responseSchema?: ZodType<T>;
};

// 标准化时间字符串（处理无时区后缀问题）
function normalizeTimestamps(obj: unknown): unknown {
	if (obj === null || obj === undefined) return obj;
	if (typeof obj === "string") {
		// ISO 时间格式但无时区，假设为 UTC
		if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(obj)) {
			return `${obj}Z`;
		}
		return obj;
	}
	if (Array.isArray(obj)) {
		return obj.map(normalizeTimestamps);
	}
	if (typeof obj === "object") {
		return Object.fromEntries(
			Object.entries(obj).map(([k, v]) => [k, normalizeTimestamps(v)]),
		);
	}
	return obj;
}

const normalizeHeaders = (headers?: HeadersInit): Record<string, string> => {
	const normalized: Record<string, string> = {};
	if (headers instanceof Headers) {
		headers.forEach((value, key) => {
			normalized[key] = value;
		});
		return normalized;
	}
	if (Array.isArray(headers)) {
		for (const [key, value] of headers) {
			normalized[key] = value;
		}
		return normalized;
	}
	if (headers) {
		Object.assign(normalized, headers);
	}
	return normalized;
};

const shouldParseBody = (body: BodyInit | null | undefined): unknown => {
	if (typeof body !== "string") return undefined;
	const trimmed = body.trim();
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		return undefined;
	}
};

export const unwrapApiData = <T>(response: unknown): T | null => {
	if (response === null || response === undefined) return null;
	if (typeof response === "object" && response !== null && "data" in response) {
		const data = (response as { data?: T }).data;
		return data ?? null;
	}
	return response as T;
};

export async function customFetcher<T>(
	url: string,
	options?: CustomFetcherOptions<T>,
): Promise<T> {
	// 客户端使用相对路径（通过 Next.js rewrites 代理）
	// SSR 环境使用环境变量（由 Electron 启动时注入动态端口）
	const baseUrl =
		typeof window !== "undefined"
			? ""
			: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";

	const { params, data, responseSchema, body, headers, ...fetchOptions } =
		options ?? {};

	const filteredParams = params
		? Object.fromEntries(
				Object.entries(params).filter(
					([_, value]) => value !== undefined && value !== null,
				),
			)
		: {};

	const [path, existingQuery = ""] = url.split("?");
	const queryParams = new URLSearchParams(existingQuery);
	Object.entries(filteredParams).forEach(([key, value]) => {
		queryParams.append(key, String(value));
	});
	const queryString = queryParams.toString();
	const finalUrl = queryString.length > 0 ? `${path}?${queryString}` : url;

	let requestBody: BodyInit | undefined = body ?? undefined;
	let isJsonBody = false;

	if (data !== undefined) {
		requestBody = JSON.stringify(camelToSnake(data));
		isJsonBody = true;
	} else if (body !== undefined) {
		const parsed = shouldParseBody(body);
		if (parsed !== undefined) {
			requestBody = JSON.stringify(camelToSnake(parsed));
			isJsonBody = true;
		}
	}

	const finalHeaders = normalizeHeaders(headers);
	if (isJsonBody) {
		const hasContentType = Object.keys(finalHeaders).some(
			(key) => key.toLowerCase() === "content-type",
		);
		if (!hasContentType) {
			finalHeaders["Content-Type"] = "application/json";
		}
	}

	const fetchInit: RequestInit = {
		...fetchOptions,
		headers: finalHeaders,
	};
	if (requestBody !== undefined) {
		fetchInit.body = requestBody;
	}

	const response = await fetch(`${baseUrl}${finalUrl}`, fetchInit);

	if (!response.ok) {
		throw new Error(`API Error: ${response.status}`);
	}

	// 处理空响应体（如 204 No Content 或 DELETE 操作）
	const contentType = response.headers.get("content-type");
	const contentLength = response.headers.get("content-length");

	if (response.status === 204 || contentLength === "0") {
		return undefined as T;
	}

	const text = await response.text();
	if (!text || text.trim() === "") {
		return undefined as T;
	}

	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (error) {
		if (!contentType?.includes("application/json")) {
			return text as T;
		}
		throw new Error(
			`Failed to parse JSON response: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}

	json = normalizeTimestamps(json);
	json = snakeToCamel(json);

	if (responseSchema) {
		const result = responseSchema.safeParse(json);
		if (!result.success) {
			console.error("[API] Schema validation failed:", result.error.issues);
			if (process.env.NODE_ENV === "development") {
				throw new Error("Schema validation failed");
			}
		}
		return result.success ? result.data : (json as T);
	}

	return json as T;
}
