"use client";

import { useEffect, useRef } from "react";
import type { PanelPosition } from "@/lib/config/panel-config";
import { useUiStore } from "@/lib/store/ui-store";

const MIN_PANEL_WIDTH_PX = 300;

/**
 * Hook for adaptive panel management based on window width
 * Automatically closes/opens panels when window width changes
 */
export function useWindowAdaptivePanels(
	containerRef: React.RefObject<HTMLDivElement | null>,
) {
	const { setAutoClosePanel, restoreAutoClosedPanel } = useUiStore();

	// 使用ref来存储上一次的宽度，避免重复计算
	const lastWidthRef = useRef<number>(0);
	const timeoutRef = useRef<NodeJS.Timeout | null>(null);
	// 使用ref存储store的getState函数，避免依赖变化
	const storeRef = useRef(useUiStore.getState());

	// 更新store引用
	useEffect(() => {
		storeRef.current = useUiStore.getState();
	});

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		// 计算当前打开的panel数量
		const getOpenPanelCount = (): number => {
			const state = storeRef.current;
			let count = 0;
			if (state.isPanelAOpen) count++;
			if (state.isPanelBOpen) count++;
			if (state.isPanelCOpen) count++;
			return count;
		};

		// 找到最右侧打开的panel
		const getRightmostOpenPanel = (): PanelPosition | null => {
			const state = storeRef.current;
			// 优先级：panelC > panelB > panelA（从右到左）
			if (state.isPanelCOpen) return "panelC";
			if (state.isPanelBOpen) return "panelB";
			if (state.isPanelAOpen) return "panelA";
			return null;
		};

		// 处理窗口宽度变化
		const handleResize = () => {
			// 清除之前的timeout
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}

			// 防抖处理：200ms延迟
			timeoutRef.current = setTimeout(() => {
				const rect = container.getBoundingClientRect();
				const containerWidth = rect.width;

				// 如果宽度没有变化，跳过
				if (Math.abs(containerWidth - lastWidthRef.current) < 1) {
					return;
				}

				lastWidthRef.current = containerWidth;

				// 计算能容纳的最大panel数量
				const maxPanels = Math.floor(containerWidth / MIN_PANEL_WIDTH_PX);
				const openPanelCount = getOpenPanelCount();
				const state = storeRef.current;

				// 如果打开的panel数量超过能容纳的数量，关闭最右侧的panel
				if (openPanelCount > maxPanels) {
					const rightmostPanel = getRightmostOpenPanel();
					if (rightmostPanel) {
						setAutoClosePanel(rightmostPanel);
					}
				}
				// 如果打开的panel数量小于能容纳的数量，且有自动关闭的panel，恢复最近关闭的panel
				else if (
					openPanelCount < maxPanels &&
					state.autoClosedPanels.length > 0
				) {
					restoreAutoClosedPanel();
				}
			}, 200);
		};

		// 使用ResizeObserver监听容器宽度变化
		const resizeObserver = new ResizeObserver(handleResize);
		resizeObserver.observe(container);

		// 初始检查
		handleResize();

		// 清理函数
		return () => {
			resizeObserver.disconnect();
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
		};
	}, [containerRef, setAutoClosePanel, restoreAutoClosedPanel]);
}
