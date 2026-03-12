import { useCallback, useRef } from "react";
import type { ToolCallStep } from "@/apps/chat/types";
import type { ToolCallEvent } from "@/lib/api";

/**
 * 工具调用跟踪器 Hook 返回值接口
 */
export interface ToolCallTrackerReturn {
	/**
	 * 处理工具调用事件
	 * @param event - 工具调用事件
	 * @returns 更新后的工具调用步骤数组（如果有更新），否则返回 null
	 */
	handleToolEvent: (event: ToolCallEvent) => ToolCallStep[] | null;
	/** 获取当前所有工具调用步骤 */
	getToolCallSteps: () => ToolCallStep[];
	/** 重置跟踪器状态 */
	reset: () => void;
	/**
	 * 强制完成所有还在运行中的工具调用步骤
	 * 用于流结束时的兜底清理，防止工具状态卡在 "running"
	 * @returns 更新后的工具调用步骤数组（如果有更新），否则返回 null
	 */
	finalizeRunningSteps: () => ToolCallStep[] | null;
}

/**
 * 跟踪工具调用的状态（开始/完成）
 *
 * 支持：
 * - 处理 tool_call_start 事件（创建新的工具调用步骤）
 * - 处理 tool_call_end 事件（更新工具调用状态和结果）
 * - 获取当前所有工具调用步骤
 *
 * @returns 工具调用跟踪器方法
 */
export const useToolCallTracker = (): ToolCallTrackerReturn => {
	// 用于跟踪工具调用步骤的 Map
	const toolCallStepsMapRef = useRef<Map<string, ToolCallStep>>(new Map());

	const handleToolEvent = useCallback(
		(event: ToolCallEvent): ToolCallStep[] | null => {
			if (event.type === "tool_call_start" && event.tool_name) {
				// 创建新的工具调用步骤
				const stepId = `${event.tool_name}-${Date.now()}`;
				const newStep: ToolCallStep = {
					id: stepId,
					toolName: event.tool_name,
					toolArgs: event.tool_args,
					status: "running",
					startTime: Date.now(),
				};
				toolCallStepsMapRef.current.set(stepId, newStep);

				return Array.from(toolCallStepsMapRef.current.values());
			}

			if (event.type === "tool_call_end" && event.tool_name) {
				// 找到对应的工具调用步骤并更新状态
				// 优先匹配还在 running 状态的步骤
				const stepKey = Array.from(toolCallStepsMapRef.current.keys()).find(
					(key) => {
						if (!key.startsWith(event.tool_name as string)) return false;
						const step = toolCallStepsMapRef.current.get(key);
						return step?.status === "running";
					},
				);

				if (stepKey) {
					const existingStep = toolCallStepsMapRef.current.get(stepKey);
					if (existingStep) {
						// 检查是否是错误事件
						const isError = (event as { error?: boolean }).error === true;
						toolCallStepsMapRef.current.set(stepKey, {
							...existingStep,
							status: isError ? "error" : "completed",
							resultPreview: event.result_preview,
							endTime: Date.now(),
						});

						return Array.from(toolCallStepsMapRef.current.values());
					}
				}
			}

			// 其他事件类型（run_started, run_completed）不需要更新 UI
			return null;
		},
		[],
	);

	const getToolCallSteps = useCallback(() => {
		return Array.from(toolCallStepsMapRef.current.values());
	}, []);

	const reset = useCallback(() => {
		toolCallStepsMapRef.current.clear();
	}, []);

	/**
	 * 强制完成所有还在运行中的工具调用步骤
	 * 用于流结束时的兜底清理
	 */
	const finalizeRunningSteps = useCallback((): ToolCallStep[] | null => {
		let hasUpdates = false;

		for (const [key, step] of toolCallStepsMapRef.current.entries()) {
			if (step.status === "running") {
				toolCallStepsMapRef.current.set(key, {
					...step,
					status: "completed",
					endTime: Date.now(),
					// 如果没有结果预览，标记为超时/未知完成
					resultPreview: step.resultPreview || "[Stream ended]",
				});
				hasUpdates = true;
			}
		}

		return hasUpdates
			? Array.from(toolCallStepsMapRef.current.values())
			: null;
	}, []);

	return {
		handleToolEvent,
		getToolCallSteps,
		reset,
		finalizeRunningSteps,
	};
};
