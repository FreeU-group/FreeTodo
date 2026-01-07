"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
	useGetConfigDetailedApiGetConfigGet,
	useSaveConfigApiSaveConfigPost,
} from "@/lib/generated/config/config";
import { queryKeys } from "./keys";

// ============================================================================
// 类型定义
// ============================================================================

export interface AppConfig {
	// 现有配置
	jobsAutoTodoDetectionEnabled?: boolean;
	// 自动待办检测白名单配置
	jobsAutoTodoDetectionParamsWhitelistApps?: string[];
	// LLM 配置
	llmApiKey?: string;
	llmBaseUrl?: string;
	llmModel?: string;
	llmTemperature?: number;
	llmMaxTokens?: number;
	// 录制配置
	jobsRecorderEnabled?: boolean;
	jobsRecorderInterval?: number;
	jobsRecorderParamsBlacklistEnabled?: boolean;
	jobsRecorderParamsBlacklistApps?: string[];
	[key: string]: unknown;
}

// ============================================================================
// Query Hooks
// ============================================================================

/**
 * 获取应用配置的 Query Hook
 * 使用 Orval 生成的 hook，保持相同的 API
 */
export function useConfig() {
	return useGetConfigDetailedApiGetConfigGet({
		query: {
			queryKey: queryKeys.config,
			staleTime: 60 * 1000, // 1 分钟
			select: (data: unknown) => {
				// 处理响应格式：{ success: boolean, config?: Record<string, unknown> }
				const response = data as {
					success?: boolean;
					config?: AppConfig;
					error?: string;
				};
				if (response?.success && response?.config) {
					return response.config;
				}
				throw new Error(response?.error || "Failed to load config");
			},
		},
	});
}

// ============================================================================
// Mutation Hooks
// ============================================================================

/**
 * 保存应用配置的 Mutation Hook
 * 使用 Orval 生成的 hook，添加乐观更新逻辑
 */
export function useSaveConfig() {
	const queryClient = useQueryClient();

	return useSaveConfigApiSaveConfigPost({
		mutation: {
			onMutate: async (variables) => {
				const newConfig = variables.data;

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
		saveConfig: (config: Partial<AppConfig>) =>
			saveConfigMutation.mutateAsync({ data: config }),
		isSaving: saveConfigMutation.isPending,
		saveError: saveConfigMutation.error,
	};
}
