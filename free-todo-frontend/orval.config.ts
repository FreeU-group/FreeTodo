import { defineConfig } from "orval";

export default defineConfig({
	lifetrace: {
		input: {
			// 从后端获取 OpenAPI schema
			target: "http://localhost:8000/openapi.json",
		},
		output: {
			// 生成文件的目标目录
			target: "./lib/generated/generated.ts",
			schemas: "./lib/generated/schemas",
			client: "react-query",
			mode: "tags-split", // 按 API tag 分割文件
			override: {
				mutator: {
					path: "./lib/generated/fetcher.ts",
					name: "customFetcher",
				},
				// 生成 Zod schemas
				zod: {
					strict: {
						response: true, // 响应使用严格验证
						body: true, // 请求体使用严格验证
					},
				},
				query: {
					useQuery: true,
					useMutation: true,
				},
			},
		},
	},
});
