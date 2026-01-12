import type { ZodType } from "zod";
import { camelToSnake, snakeToCamel } from "./case-transform";

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

export async function customFetcher<T>({
	url,
	method,
	params,
	data,
	headers,
	signal,
	responseSchema,
}: {
	url: string;
	method: string;
	params?: Record<string, unknown>;
	data?: unknown;
	headers?: Record<string, string>;
	signal?: AbortSignal;
	responseSchema?: ZodType<T>;
}): Promise<T> {
	// 客户端使用相对路径（通过 Next.js rewrites 代理）
	// SSR 环境使用环境变量（由 Electron 启动时注入动态端口）
	const baseUrl =
		typeof window !== "undefined"
			? ""
			: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8100";

	// 过滤掉 undefined、null 值，防止传递 "undefined" 字符串到后端
	const filteredParams = params
		? Object.fromEntries(
				Object.entries(params).filter(
					([_, v]) => v !== undefined && v !== null,
				),
			)
		: {};

	const queryString =
		Object.keys(filteredParams).length > 0
			? "?" +
				new URLSearchParams(filteredParams as Record<string, string>).toString()
			: "";

	// Transform request body: camelCase -> snake_case
	const transformedData = data ? camelToSnake(data) : undefined;

	const response = await fetch(`${baseUrl}${url}${queryString}`, {
		method,
		headers: { "Content-Type": "application/json", ...headers },
		body: transformedData ? JSON.stringify(transformedData) : undefined,
		signal,
	});

	if (!response.ok) {
		throw new Error(`API Error: ${response.status}`);
	}

	// 处理空响应体（如 204 No Content 或 DELETE 操作）
	const contentType = response.headers.get("content-type");
	const contentLength = response.headers.get("content-length");

	// 如果状态码是 204 No Content，或者 Content-Length 为 0，直接返回 undefined
	if (response.status === 204 || contentLength === "0") {
		return undefined as T;
	}

	// 尝试读取响应体文本
	const text = await response.text();

	// 如果响应体为空，返回 undefined
	if (!text || text.trim() === "") {
		return undefined as T;
	}

	// 尝试解析 JSON
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch (error) {
		// 如果解析失败，且响应不是 JSON 类型，返回原始文本
		if (!contentType?.includes("application/json")) {
			return text as T;
		}
		// 如果是 JSON 类型但解析失败，抛出错误
		throw new Error(
			`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	// 标准化时间字符串
	json = normalizeTimestamps(json);

	// Transform response: snake_case -> camelCase
	json = snakeToCamel(json);

	// 如果提供了 schema，进行验证
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
