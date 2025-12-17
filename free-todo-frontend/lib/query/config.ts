"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getConfig, saveConfig } from "@/lib/api";
import { queryKeys } from "./keys";

// ============================================================================
// 类型定义
// ============================================================================

export interface AppConfig {
	jobsAutoTodoDetectionEnabled?: boolean;
	uiCostTrackingEnabled?: boolean;
	[key: string]: unknown;
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * 获取应用配置的 Query Hook
 */
export function useConfig() {
	return useQuery({
		queryKey: queryKeys.config,
		queryFn: async () => {
			const response = await getConfig();
			if (!response.success || !response.config) {
				throw new Error(response.error || "Failed to load config");
			}
			return response.config as AppConfig;
		},
		staleTime: 60 * 1000, // 1 分钟
	});
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * 保存应用配置的 Mutation Hook
 */
export function useSaveConfig() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async (config: Partial<AppConfig>) => {
			const response = await saveConfig(config);
			if (!response.success) {
				throw new Error(response.error || "Failed to save config");
			}
			return response;
		},
		onMutate: async (newConfig) => {
			// 取消正在进行的查询
			await queryClient.cancelQueries({ queryKey: queryKeys.config });

			// 保存之前的数据
			const previousConfig = queryClient.getQueryData<AppConfig>(
				queryKeys.config,
			);

			// 乐观更新
			queryClient.setQueryData<AppConfig>(queryKeys.config, (old) => ({
				...old,
				...newConfig,
			}));

			return { previousConfig };
		},
		onError: (_err, _variables, context) => {
			// 发生错误时回滚
			if (context?.previousConfig) {
				queryClient.setQueryData(queryKeys.config, context.previousConfig);
			}
		},
		onSettled: () => {
			// 重新获取最新数据
			queryClient.invalidateQueries({ queryKey: queryKeys.config });
		},
	});
}

// ============================================================================
// 组合 Hook
// ============================================================================

/**
 * 提供配置的读写操作
 */
export function useConfigMutations() {
	const saveConfigMutation = useSaveConfig();

	return {
		saveConfig: saveConfigMutation.mutateAsync,
		isSaving: saveConfigMutation.isPending,
		saveError: saveConfigMutation.error,
	};
}
