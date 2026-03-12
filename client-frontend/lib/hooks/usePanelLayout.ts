/**
 * Panel 布局计算 Hook
 * 计算 Panel A、B、C 的显示状态和宽度
 */

import { useMemo } from "react";

interface UsePanelLayoutOptions {
	isPanelAOpen: boolean;
	isPanelBOpen: boolean;
	isPanelCOpen: boolean;
	panelAWidth: number;
	panelCWidth: number;
}

export function usePanelLayout({
	isPanelAOpen,
	isPanelBOpen,
	isPanelCOpen,
	panelAWidth,
	panelCWidth,
}: UsePanelLayoutOptions) {
	const layoutState = useMemo(() => {
		// 计算基础宽度（不包括 panelC）
		const baseWidth = isPanelCOpen ? 1 - panelCWidth : 1;
		const actualPanelCWidth = isPanelCOpen ? panelCWidth : 0;

		// 所有面板都关闭的情况
		if (!isPanelAOpen && !isPanelBOpen && !isPanelCOpen) {
			return {
				showPanelA: false,
				showPanelB: false,
				showPanelC: false,
				panelAWidth: 0,
				panelBWidth: 0,
				panelCWidth: 0,
				showPanelAResizeHandle: false,
				showPanelCResizeHandle: false,
			};
		}

		if (isPanelAOpen && isPanelBOpen && isPanelCOpen) {
			// 三个面板都打开
			return {
				showPanelA: true,
				showPanelB: true,
				showPanelC: true,
				panelAWidth: panelAWidth * baseWidth,
				panelBWidth: (1 - panelAWidth) * baseWidth,
				panelCWidth: actualPanelCWidth,
				showPanelAResizeHandle: true,
				showPanelCResizeHandle: true,
			};
		}

		if (isPanelAOpen && isPanelBOpen) {
			// 只有 panelA 和 panelB 打开
			return {
				showPanelA: true,
				showPanelB: true,
				showPanelC: false,
				panelAWidth: panelAWidth,
				panelBWidth: 1 - panelAWidth,
				panelCWidth: 0,
				showPanelAResizeHandle: true,
				showPanelCResizeHandle: false,
			};
		}

		if (isPanelBOpen && isPanelCOpen) {
			// 只有 panelB 和 panelC 打开
			return {
				showPanelA: false,
				showPanelB: true,
				showPanelC: true,
				panelAWidth: 0,
				panelBWidth: baseWidth,
				panelCWidth: actualPanelCWidth,
				showPanelAResizeHandle: false,
				showPanelCResizeHandle: true,
			};
		}

		if (isPanelAOpen && isPanelCOpen) {
			// 只有 panelA 和 panelC 打开
			return {
				showPanelA: true,
				showPanelB: false,
				showPanelC: true,
				panelAWidth: baseWidth,
				panelBWidth: 0,
				panelCWidth: actualPanelCWidth,
				showPanelAResizeHandle: false,
				showPanelCResizeHandle: true,
			};
		}

		if (isPanelAOpen && !isPanelBOpen) {
			// 只有 panelA 打开
			return {
				showPanelA: true,
				showPanelB: false,
				showPanelC: isPanelCOpen,
				panelAWidth: baseWidth,
				panelBWidth: 0,
				panelCWidth: actualPanelCWidth,
				showPanelAResizeHandle: false,
				showPanelCResizeHandle: isPanelCOpen,
			};
		}

		if (!isPanelAOpen && isPanelBOpen) {
			// 只有 panelB 打开
			return {
				showPanelA: false,
				showPanelB: true,
				showPanelC: isPanelCOpen,
				panelAWidth: 0,
				panelBWidth: baseWidth,
				panelCWidth: actualPanelCWidth,
				showPanelAResizeHandle: false,
				showPanelCResizeHandle: isPanelCOpen,
			};
		}

		// 只有 panelC 打开
		return {
			showPanelA: false,
			showPanelB: false,
			showPanelC: true,
			panelAWidth: 0,
			panelBWidth: 0,
			panelCWidth: actualPanelCWidth,
			showPanelAResizeHandle: false,
			showPanelCResizeHandle: false,
		};
	}, [isPanelAOpen, isPanelBOpen, isPanelCOpen, panelAWidth, panelCWidth]);

	return layoutState;
}
