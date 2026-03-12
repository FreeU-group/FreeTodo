/**
 * Panel 窗口样式管理 Hook
 * 确保 Panel 窗口在拖动和调整大小时保持可见
 */

import { useLayoutEffect } from "react";

interface UsePanelWindowStylesOptions {
	isPanelMode: boolean;
	panelWindowHeight: number;
}

export function usePanelWindowStyles({
	isPanelMode,
	panelWindowHeight,
}: UsePanelWindowStylesOptions) {
	// ✅ 关键修复：监听拖动状态，确保 Panel DOM 元素在拖动时保持可见
	// 使用 useLayoutEffect + 三重 requestAnimationFrame 确保在 React 应用 style 之后执行
	useLayoutEffect(() => {
		if (!isPanelMode) return;

		// 使用三重 requestAnimationFrame 确保在 React 应用 style prop 之后执行
		// 这样设置的样式不会被 React 的 style prop 覆盖
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					const panelWindow = document.querySelector('[data-panel-window]') as HTMLElement;
					if (!panelWindow) return;

					// 强制设置样式，使用 !important 确保优先级高于 React 的 style prop
					panelWindow.style.setProperty('opacity', '1', 'important');
					panelWindow.style.setProperty('background-color', 'white', 'important');
					panelWindow.style.setProperty('background', 'white', 'important');
					panelWindow.style.setProperty('visibility', 'visible', 'important');
					panelWindow.style.setProperty('display', 'flex', 'important');
					panelWindow.style.setProperty('z-index', '1000001', 'important'); // ✅ 确保高于 DynamicIsland
					panelWindow.style.setProperty('position', 'fixed', 'important');
					// ✅ 移除 bottom，使用固定高度，不随 y 位置变化
					panelWindow.style.removeProperty('bottom');
					// 保持高度固定，避免拖动时高度变化
					// panelWindowHeight 是 PanelRegion 高度（包括 Panels 容器 + BottomDock 60px），窗口总高度 = 标题栏(48px) + panelWindowHeight
					const heightValue = panelWindowHeight > 0
						? `${panelWindowHeight + 48}px`
						: `calc(100vh - 40px)`;
					panelWindow.style.setProperty('height', heightValue, 'important');
				});
			});
		});
	}, [isPanelMode, panelWindowHeight]);
}
