"use client";

import {
	useGetCostConfigApiCostTrackingConfigGet,
	useGetCostStatsApiCostTrackingStatsGet,
} from "@/lib/generated/cost-tracking/cost-tracking";
import { queryKeys } from "./keys";

// Cost stats response type (since API returns unknown, we define it based on usage)
interface CostStatsResponse {
	data?: {
		total_cost?: number;
		total_tokens?: number;
		total_requests?: number;
		daily_costs?: Record<string, { cost?: number; total_tokens?: number }>;
		feature_costs?: Record<
			string,
			{
				input_tokens?: number;
				output_tokens?: number;
				requests?: number;
				cost?: number;
			}
		>;
		model_costs?: Record<
			string,
			{
				input_tokens?: number;
				output_tokens?: number;
				input_cost?: number;
				output_cost?: number;
				total_cost?: number;
			}
		>;
	};
}

interface CostConfigResponse {
	data?: Record<string, unknown>;
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * 获取费用统计数据的 Query Hook
 * 使用 Orval 生成的 hook
 */
export function useCostStats(days: number) {
	return useGetCostStatsApiCostTrackingStatsGet(
		{ days: days },
		{
			query: {
				queryKey: queryKeys.costStats(days),
				staleTime: 60 * 1000, // 1 分钟内数据被认为是新鲜的
				select: (data: unknown) => {
					// 处理响应格式：{ success: boolean, data?: CostStats }
					const response = data as CostStatsResponse;
					if (response?.data) {
						return response.data;
					}
					throw new Error("Failed to load cost stats");
				},
			},
		},
	);
}

/**
 * 获取费用配置的 Query Hook
 * 使用 Orval 生成的 hook
 */
export function useCostConfig() {
	return useGetCostConfigApiCostTrackingConfigGet({
		query: {
			queryKey: ["costConfig"],
			staleTime: 5 * 60 * 1000, // 5 分钟
			select: (data: unknown) => {
				// 处理响应格式：{ success: boolean, data?: {...} }
				const response = data as CostConfigResponse;
				if (response?.data) {
					return response.data;
				}
				throw new Error("Failed to load cost config");
			},
		},
	});
}
