import { create } from "zustand";
import type { PanelPosition } from "@/lib/config/panel-config";

interface UiStoreState {
	// 位置槽位状态
	isPanelAOpen: boolean;
	isPanelBOpen: boolean;
	isPanelCOpen: boolean;
	// 位置槽位宽度
	panelAWidth: number;
	panelCWidth: number;
	// panelBWidth 是计算值，不需要单独存储
	// 位置槽位 toggle 方法
	togglePanelA: () => void;
	togglePanelB: () => void;
	togglePanelC: () => void;
	// 位置槽位宽度设置方法
	setPanelAWidth: (width: number) => void;
	setPanelCWidth: (width: number) => void;
	// panelBWidth 是计算值，不需要单独设置方法
	// 兼容性方法：为了保持向后兼容，保留基于功能的访问方法
	// 这些方法内部会通过配置映射到位置槽位
	getIsFeatureOpen: (feature: "calendar" | "todos" | "chat") => boolean;
	toggleFeature: (feature: "calendar" | "todos" | "chat") => void;
	getFeatureWidth: (feature: "calendar" | "todos" | "chat") => number;
	setFeatureWidth: (
		feature: "calendar" | "todos" | "chat",
		width: number,
	) => void;
}

const MIN_PANEL_WIDTH = 0.2;
const MAX_PANEL_WIDTH = 0.8;

function clampWidth(width: number): number {
	if (Number.isNaN(width)) return 0.5;
	if (width < MIN_PANEL_WIDTH) return MIN_PANEL_WIDTH;
	if (width > MAX_PANEL_WIDTH) return MAX_PANEL_WIDTH;
	return width;
}

// 功能到位置的映射（从配置导入）
import { FEATURE_TO_POSITION } from "@/lib/config/panel-config";

function getPositionByFeature(
	feature: "calendar" | "todos" | "chat",
): PanelPosition {
	return FEATURE_TO_POSITION[feature];
}

export const useUiStore = create<UiStoreState>((set, get) => ({
	// 位置槽位初始状态
	isPanelAOpen: true,
	isPanelBOpen: true,
	isPanelCOpen: false,
	panelAWidth: 0.5,
	panelCWidth: 0.3,

	// 位置槽位 toggle 方法
	togglePanelA: () =>
		set((state) => ({
			isPanelAOpen: !state.isPanelAOpen,
		})),

	togglePanelB: () =>
		set((state) => ({
			isPanelBOpen: !state.isPanelBOpen,
		})),

	togglePanelC: () =>
		set((state) => ({
			isPanelCOpen: !state.isPanelCOpen,
		})),

	// 位置槽位宽度设置方法
	setPanelAWidth: (width: number) =>
		set((state) => {
			if (!state.isPanelAOpen || !state.isPanelBOpen) {
				return state;
			}

			return {
				panelAWidth: clampWidth(width),
			};
		}),

	setPanelCWidth: (width: number) =>
		set((state) => {
			if (!state.isPanelBOpen || !state.isPanelCOpen) {
				return state;
			}

			return {
				panelCWidth: clampWidth(width),
			};
		}),

	// 兼容性方法：基于功能的访问
	getIsFeatureOpen: (feature) => {
		const position = getPositionByFeature(feature);
		const state = get();
		switch (position) {
			case "panelA":
				return state.isPanelAOpen;
			case "panelB":
				return state.isPanelBOpen;
			case "panelC":
				return state.isPanelCOpen;
		}
	},

	toggleFeature: (feature) => {
		const position = getPositionByFeature(feature);
		const state = get();
		switch (position) {
			case "panelA":
				state.togglePanelA();
				break;
			case "panelB":
				state.togglePanelB();
				break;
			case "panelC":
				state.togglePanelC();
				break;
		}
	},

	getFeatureWidth: (feature) => {
		const position = getPositionByFeature(feature);
		const state = get();
		switch (position) {
			case "panelA":
				return state.panelAWidth;
			case "panelB":
				// panelB 的宽度是计算值：1 - panelAWidth
				return 1 - state.panelAWidth;
			case "panelC":
				return state.panelCWidth;
		}
	},

	setFeatureWidth: (feature, width) => {
		const position = getPositionByFeature(feature);
		const state = get();
		switch (position) {
			case "panelA":
				state.setPanelAWidth(width);
				break;
			case "panelB":
				// panelB 的宽度通过设置 panelA 的宽度来间接设置
				// 如果设置 panelB 的宽度为 w，则 panelA 的宽度应该是 1 - w
				state.setPanelAWidth(1 - width);
				break;
			case "panelC":
				state.setPanelCWidth(width);
				break;
		}
	},
}));
