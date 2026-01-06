import type { PanelFeature, PanelPosition } from "@/lib/config/panel-config";
import {
	ALL_PANEL_FEATURES,
	DEV_IN_PROGRESS_FEATURES,
} from "@/lib/config/panel-config";
import type { DockDisplayMode } from "./types";

// 宽度限制常量
export const MIN_PANEL_WIDTH = 0.2;
export const MAX_PANEL_WIDTH = 0.8;

/**
 * 限制宽度在有效范围内
 */
export function clampWidth(width: number): number {
	if (Number.isNaN(width)) return 0.5;
	if (width < MIN_PANEL_WIDTH) return MIN_PANEL_WIDTH;
	if (width > MAX_PANEL_WIDTH) return MAX_PANEL_WIDTH;
	return width;
}

/**
 * 根据功能查找其所在的位置
 */
export function getPositionByFeature(
	feature: PanelFeature,
	panelFeatureMap: Record<PanelPosition, PanelFeature | null>,
): PanelPosition | null {
	for (const [position, assignedFeature] of Object.entries(panelFeatureMap) as [
		PanelPosition,
		PanelFeature | null,
	][]) {
		if (assignedFeature === feature) {
			return position;
		}
	}
	return null;
}

// Panel 配置的默认值
export const DEFAULT_PANEL_STATE = {
	isPanelAOpen: true,
	isPanelBOpen: true,
	isPanelCOpen: true,
	panelAWidth: 1 / 3, // panelA 占左边 1/4，panelC 占右边 1/4，所以 panelA 占剩余空间的 1/3 (即 0.25/0.75)
	panelCWidth: 0.25, // panelC 占右边 1/4
	// 默认关闭的功能：开发中的面板（用户可在设置中手动开启）
	disabledFeatures: DEV_IN_PROGRESS_FEATURES as PanelFeature[],
	panelFeatureMap: {
		panelA: "todos" as PanelFeature,
		panelB: "chat" as PanelFeature,
		panelC: "todoDetail" as PanelFeature,
	},
	autoClosedPanels: [] as PanelPosition[],
	dockDisplayMode: "auto-hide" as DockDisplayMode,
};

/**
 * 验证 panelFeatureMap 的有效性
 */
export function validatePanelFeatureMap(
	map: Record<PanelPosition, PanelFeature | null>,
): Record<PanelPosition, PanelFeature | null> {
	const validated: Record<PanelPosition, PanelFeature | null> = {
		panelA: null,
		panelB: null,
		panelC: null,
	};

	for (const [position, feature] of Object.entries(map) as [
		PanelPosition,
		PanelFeature | null,
	][]) {
		if (feature && ALL_PANEL_FEATURES.includes(feature)) {
			validated[position] = feature;
		}
	}

	// 如果验证后所有位置都是 null，使用默认值
	if (
		validated.panelA === null &&
		validated.panelB === null &&
		validated.panelC === null
	) {
		return DEFAULT_PANEL_STATE.panelFeatureMap;
	}

	return validated;
}
