"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { queryKeys } from "@/lib/query/keys";
import { toastError, toastInfo, toastSuccess } from "@/lib/toast";
import { getElectronAPI } from "@/lib/utils/electron-api";

interface ExtractedTodoResponse {
	title: string;
	description?: string;
	time_info?: Record<string, unknown>;
	source_text?: string;
	confidence: number;
}

interface CaptureExtractResult {
	success: boolean;
	message?: string;
	extractedTodos: ExtractedTodoResponse[];
	createdCount?: number;
}

/**
 * 截图并提取待办的 Hook
 * 封装截图+提取逻辑，管理 Loading/Success/Error 状态
 */
export function useTodoCapture() {
	const [isCapturing, setIsCapturing] = useState(false);
	const [result, setResult] = useState<CaptureExtractResult | null>(null);
	const queryClient = useQueryClient();

	const captureAndExtract = useCallback(async () => {
		const api = getElectronAPI();

		// 检查是否在 Electron 环境中
		if (!api.electronAPI?.captureAndExtractTodos) {
			toastError("请在桌面应用中使用此功能");
			return null;
		}

		try {
			setIsCapturing(true);
			setResult(null);
			toastInfo("正在截图...");

			// 获取 panel 的位置信息（如果存在）
			let panelBounds: { x: number; y: number; width: number; height: number } | null = null;
			try {
				const panelElement = document.querySelector('[data-panel-window]') as HTMLElement;
				if (panelElement) {
					const rect = panelElement.getBoundingClientRect();
					// getBoundingClientRect 返回的是相对于视口的位置
					// 在 Electron 中，窗口坐标就是相对于窗口左上角的
					// 后端会加上窗口在屏幕上的位置来得到屏幕坐标
					panelBounds = {
						x: rect.left,
						y: rect.top,
						width: rect.width,
						height: rect.height,
					};
				}
			} catch (error) {
				console.warn("Failed to get panel bounds:", error);
			}

			// 调用 Electron API 截图并提取待办
			const response = await api.electronAPI.captureAndExtractTodos(panelBounds);

			if (response.success) {
				const createdCount = response.createdCount ?? 0;

				if (createdCount > 0) {
					// 后端已直接创建了 draft 状态的待办
					toastSuccess(`已创建 ${createdCount} 个待办事项（草稿状态）`);
					// 强制刷新待办列表
					queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
				} else if (response.extractedTodos.length > 0) {
					// 提取到了但未创建（理论上不应该发生，因为 create_todos=true）
					toastInfo(`已提取 ${response.extractedTodos.length} 个待办事项，但未创建`);
				} else {
					toastInfo("未检测到待办事项");
				}

				const captureResult: CaptureExtractResult = {
					success: true,
					message: response.message,
					extractedTodos: response.extractedTodos,
					createdCount,
				};

				setResult(captureResult);
				return captureResult;
			} else {
				const errorMessage = response.message || "提取失败";
				toastError(errorMessage);
				setResult({
					success: false,
					message: errorMessage,
					extractedTodos: [],
					createdCount: 0,
				});
				return null;
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : "未知错误";
			toastError(`提取待办失败: ${errorMessage}`);
			setResult({
				success: false,
				message: errorMessage,
				extractedTodos: [],
				createdCount: 0,
			});
			return null;
		} finally {
			setIsCapturing(false);
		}
	}, [queryClient]);

	const clearResult = useCallback(() => {
		setResult(null);
	}, []);

	return {
		isCapturing,
		result,
		captureAndExtract,
		clearResult,
	};
}
