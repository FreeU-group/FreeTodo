import { useCallback, useRef } from "react";
import { createId } from "@/apps/chat/utils/id";

/**
 * 创建请求的返回值
 */
export interface CreateRequestResult {
	/** 请求唯一 ID */
	requestId: string;
	/** 用于取消请求的 AbortController */
	abortController: AbortController;
}

/**
 * 流式控制器 Hook 返回值接口
 */
export interface StreamControllerReturn {
	/** 创建新的请求（返回 requestId 和 abortController） */
	createRequest: () => CreateRequestResult;
	/** 取消当前请求 */
	cancelRequest: () => void;
	/** 检查指定请求是否是当前活跃请求 */
	isActiveRequest: (requestId: string) => boolean;
	/** 清空活跃请求 ID（让旧请求的回调忽略 UI 更新） */
	clearActiveRequest: () => void;
	/** 清理 abortController 引用 */
	cleanupAbortController: () => void;
	/** 获取当前的 abort signal */
	getAbortSignal: () => AbortSignal | undefined;
}

/**
 * 管理流式请求的取消和活跃状态
 *
 * 支持：
 * - 创建带有唯一 ID 的请求
 * - 取消正在进行的请求
 * - 判断回调是否来自当前活跃请求
 *
 * @returns 流式控制器方法
 */
export const useStreamController = (): StreamControllerReturn => {
	// 用于取消流式请求的 AbortController
	const abortControllerRef = useRef<AbortController | null>(null);

	// 跟踪当前活跃的请求 ID，用于在切换对话时忽略旧请求的 UI 更新
	const activeRequestIdRef = useRef<string | null>(null);

	const createRequest = useCallback((): CreateRequestResult => {
		// 生成当前请求的唯一 ID
		const requestId = createId();
		activeRequestIdRef.current = requestId;

		// 创建新的 AbortController
		const abortController = new AbortController();
		abortControllerRef.current = abortController;

		return { requestId, abortController };
	}, []);

	const cancelRequest = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
			abortControllerRef.current = null;
		}
	}, []);

	const isActiveRequest = useCallback((requestId: string) => {
		return activeRequestIdRef.current === requestId;
	}, []);

	const clearActiveRequest = useCallback(() => {
		activeRequestIdRef.current = null;
	}, []);

	const cleanupAbortController = useCallback(() => {
		abortControllerRef.current = null;
	}, []);

	const getAbortSignal = useCallback(() => {
		return abortControllerRef.current?.signal;
	}, []);

	return {
		createRequest,
		cancelRequest,
		isActiveRequest,
		clearActiveRequest,
		cleanupAbortController,
		getAbortSignal,
	};
};
