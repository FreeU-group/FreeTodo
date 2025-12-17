"use client";

import { useQuery } from "@tanstack/react-query";
import { getCostConfig, getCostStats } from "@/lib/api";
import { queryKeys } from "./keys";

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * 获取费用统计数据的 Query Hook
 */
export function useCostStats(days: number) {
	return useQuery({
		queryKey: queryKeys.costStats(days),
		queryFn: async () => {
			const response = await getCostStats(days);
			if (!response?.data) {
				throw new Error("Failed to load cost stats");
			}
			return response.data;
		},
		staleTime: 60 * 1000, // 1 分钟内数据被认为是新鲜的
	});
}

/**
 * 获取费用配置的 Query Hook
 */
export function useCostConfig() {
	return useQuery({
		queryKey: ["costConfig"],
		queryFn: async () => {
			const response = await getCostConfig();
			if (!response?.data) {
				throw new Error("Failed to load cost config");
			}
			return response.data;
		},
		staleTime: 5 * 60 * 1000, // 5 分钟
	});
}
