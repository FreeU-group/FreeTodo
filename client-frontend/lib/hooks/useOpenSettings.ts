"use client";

import { useCallback } from "react";
import { useUiStore } from "@/lib/store/ui-store";

/**
 * 计算各面板的实际宽度比例
 * 返回各面板的实际显示宽度（0~1）
 */
function calculatePanelWidths(
	isPanelAOpen: boolean,
	isPanelBOpen: boolean,
	isPanelCOpen: boolean,
	panelAWidth: number,
	panelCWidth: number,
): { panelA: number; panelB: number; panelC: number } {
	// 计算基础宽度（不包括 panelC）
	const baseWidth = isPanelCOpen ? 1 - panelCWidth : 1;
	const actualPanelCWidth = isPanelCOpen ? panelCWidth : 0;

	// 所有面板都关闭
	if (!isPanelAOpen && !isPanelBOpen && !isPanelCOpen) {
		return { panelA: 0, panelB: 0, panelC: 0 };
	}

	// 三个面板都打开
	if (isPanelAOpen && isPanelBOpen && isPanelCOpen) {
		return {
			panelA: panelAWidth * baseWidth,
			panelB: (1 - panelAWidth) * baseWidth,
			panelC: actualPanelCWidth,
		};
	}

	// panelA 和 panelB 打开
	if (isPanelAOpen && isPanelBOpen) {
		return {
			panelA: panelAWidth,
			panelB: 1 - panelAWidth,
			panelC: 0,
		};
	}

	// panelB 和 panelC 打开
	if (isPanelBOpen && isPanelCOpen) {
		return {
			panelA: 0,
			panelB: baseWidth,
			panelC: actualPanelCWidth,
		};
	}

	// panelA 和 panelC 打开
	if (isPanelAOpen && isPanelCOpen) {
		return {
			panelA: baseWidth,
			panelB: 0,
			panelC: actualPanelCWidth,
		};
	}

	// 只有 panelA 打开
	if (isPanelAOpen) {
		return { panelA: 1, panelB: 0, panelC: 0 };
	}

	// 只有 panelB 打开
	if (isPanelBOpen) {
		return { panelA: 0, panelB: 1, panelC: 0 };
	}

	// 只有 panelC 打开
	return { panelA: 0, panelB: 0, panelC: 1 };
}

/**
 * 提供打开设置页面的功能
 * 复用于 SettingsToggle 和 HeaderIsland 等组件
 *
 * 打开设置的逻辑：
 * - 如果 Panel B 已激活，直接切换 Panel B 到设置
 * - 否则找到最宽的 Panel（A 或 C），激活并切换到设置
 */
export function useOpenSettings() {
	const {
		isPanelAOpen,
		isPanelBOpen,
		isPanelCOpen,
		panelAWidth,
		panelCWidth,
		panelFeatureMap,
		setPanelFeature,
		togglePanelA,
		togglePanelB,
		togglePanelC,
	} = useUiStore();

	/**
	 * 计算各面板的实际宽度比例
	 */
	const getPanelWidths = useCallback(() => {
		return calculatePanelWidths(
			isPanelAOpen,
			isPanelBOpen,
			isPanelCOpen,
			panelAWidth,
			panelCWidth,
		);
	}, [isPanelAOpen, isPanelBOpen, isPanelCOpen, panelAWidth, panelCWidth]);

	/**
	 * 打开设置页面
	 */
	const openSettings = useCallback(() => {
		// 检查当前是否已经有面板显示设置
		const isSettingsInA = panelFeatureMap.panelA === "settings";
		const isSettingsInB = panelFeatureMap.panelB === "settings";
		const isSettingsInC = panelFeatureMap.panelC === "settings";

		// 如果设置已经在某个打开的面板中显示，不做任何操作
		if (
			(isSettingsInA && isPanelAOpen) ||
			(isSettingsInB && isPanelBOpen) ||
			(isSettingsInC && isPanelCOpen)
		) {
			return;
		}

		// 情况 1: Panel B 已激活，直接切换到设置
		if (isPanelBOpen) {
			setPanelFeature("panelB", "settings");
			return;
		}

		// 情况 2: Panel B 未激活，找最宽的面板
		const widths = getPanelWidths();

		// 如果没有面板打开，打开 Panel B 并设置为设置
		if (widths.panelA === 0 && widths.panelC === 0) {
			togglePanelB();
			setPanelFeature("panelB", "settings");
			return;
		}

		// 找到最宽的面板并激活/切换到设置
		if (widths.panelA >= widths.panelC) {
			// Panel A 更宽或相等
			if (isPanelAOpen) {
				setPanelFeature("panelA", "settings");
			} else {
				togglePanelA();
				setPanelFeature("panelA", "settings");
			}
		} else {
			// Panel C 更宽
			if (isPanelCOpen) {
				setPanelFeature("panelC", "settings");
			} else {
				togglePanelC();
				setPanelFeature("panelC", "settings");
			}
		}
	}, [
		isPanelAOpen,
		isPanelBOpen,
		isPanelCOpen,
		panelFeatureMap,
		setPanelFeature,
		togglePanelA,
		togglePanelB,
		togglePanelC,
		getPanelWidths,
	]);

	return { openSettings, getPanelWidths };
}
