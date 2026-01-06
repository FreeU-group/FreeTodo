/**
 * 错误处理 Hook
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useErrorHandler() {
	const [error, setError] = useState<string | null>(null);
	const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);

	// 设置错误提示，3秒后自动清除
	const setErrorWithAutoHide = useCallback((errorMessage: string | null) => {
		// 清除之前的定时器
		if (errorTimeoutRef.current) {
			clearTimeout(errorTimeoutRef.current);
			errorTimeoutRef.current = null;
		}

		setError(errorMessage);

		// 如果有错误消息，3秒后自动清除
		if (errorMessage) {
			errorTimeoutRef.current = setTimeout(() => {
				setError(null);
				errorTimeoutRef.current = null;
			}, 3000);
		}
	}, []);

	// 组件卸载时清除定时器
	useEffect(() => {
		return () => {
			if (errorTimeoutRef.current) {
				clearTimeout(errorTimeoutRef.current);
				errorTimeoutRef.current = null;
			}
		};
	}, []);

	return { error, setError, setErrorWithAutoHide };
}
