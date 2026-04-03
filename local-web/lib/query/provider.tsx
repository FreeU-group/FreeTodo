"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";

/**
 * 创建 QueryClient 实例的工厂函数
 * 使用工厂函数确保每个客户端都有独立的 QueryClient 实例
 */
function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				// 30 秒内数据被认为是新鲜的，不会重新请求
				staleTime: 30 * 1000,
				// 数据在缓存中保留 5 分钟
				gcTime: 5 * 60 * 1000,
				// 窗口聚焦时重新获取数据
				refetchOnWindowFocus: true,
				// 网络重连时重新获取数据
				refetchOnReconnect: true,
				// 组件挂载时如果数据过期则重新获取
				refetchOnMount: true,
				// 失败后重试 1 次
				retry: 1,
				// 重试延迟
				retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
			},
			mutations: {
				// mutation 失败后不自动重试
				retry: false,
			},
		},
	});
}

// 浏览器端的单例 QueryClient
let browserQueryClient: QueryClient | undefined;

/**
 * 获取 QueryClient 实例
 * - 服务端：每次创建新实例
 * - 客户端：使用单例模式
 *
 * 导出此函数以便在非 React 代码中使用（如 Zustand stores）
 */
export function getQueryClient() {
	if (typeof window === "undefined") {
		// 服务端：总是创建新的 QueryClient
		return makeQueryClient();
	}
	// 客户端：使用单例
	if (!browserQueryClient) {
		browserQueryClient = makeQueryClient();
	}
	return browserQueryClient;
}

interface QueryProviderProps {
	children: ReactNode;
}

/**
 * TanStack Query Provider 组件
 * 为整个应用提供 QueryClient 上下文
 */
export function QueryProvider({ children }: QueryProviderProps) {
	// 使用 useState 确保在 SSR 和 CSR 之间保持一致
	const [queryClient] = useState(() => getQueryClient());

	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}
