import { create } from "zustand";
import type { PanelFeature, PanelPosition } from "@/lib/config/panel-config";
import { ALL_PANEL_FEATURES } from "@/lib/config/panel-config";

interface UiStoreState {
	// 位置槽位状态
	isPanelAOpen: boolean;
	isPanelBOpen: boolean;
	isPanelCOpen: boolean;
	// 位置槽位宽度
	panelAWidth: number;
	panelCWidth: number;
	// panelBWidth 是计算值，不需要单独存储
	// 动态功能分配映射：每个位置当前显示的功能
	panelFeatureMap: Record<PanelPosition, PanelFeature | null>;
	// 位置槽位 toggle 方法
	togglePanelA: () => void;
	togglePanelB: () => void;
	togglePanelC: () => void;
	// 位置槽位宽度设置方法
	setPanelAWidth: (width: number) => void;
	setPanelCWidth: (width: number) => void;
	// panelBWidth 是计算值，不需要单独设置方法
	// 动态功能分配方法
	setPanelFeature: (position: PanelPosition, feature: PanelFeature) => void;
	getFeatureByPosition: (position: PanelPosition) => PanelFeature | null;
	getAvailableFeatures: () => PanelFeature[];
	// 兼容性方法：为了保持向后兼容，保留基于功能的访问方法
	// 这些方法内部会通过动态映射查找位置
	getIsFeatureOpen: (feature: PanelFeature) => boolean;
	toggleFeature: (feature: PanelFeature) => void;
	getFeatureWidth: (feature: PanelFeature) => number;
	setFeatureWidth: (feature: PanelFeature, width: number) => void;
}

const MIN_PANEL_WIDTH = 0.2;
const MAX_PANEL_WIDTH = 0.8;

function clampWidth(width: number): number {
	if (Number.isNaN(width)) return 0.5;
	if (width < MIN_PANEL_WIDTH) return MIN_PANEL_WIDTH;
	if (width > MAX_PANEL_WIDTH) return MAX_PANEL_WIDTH;
	return width;
}

// 根据功能查找其所在的位置
function getPositionByFeature(
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

export const useUiStore = create<UiStoreState>((set, get) => ({
	// 位置槽位初始状态
	isPanelAOpen: true,
	isPanelBOpen: true,
	isPanelCOpen: true,
	panelAWidth: 0.5,
	panelCWidth: 0.3,
	// 动态功能分配初始状态：默认分配
	panelFeatureMap: {
		panelA: "todos",
		panelB: "todoDetail",
		panelC: "chat",
	},

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

	// 动态功能分配方法
	setPanelFeature: (position, feature) =>
		set((state) => {
			// 如果该功能已经在其他位置，先清除那个位置的分配
			const currentMap = { ...state.panelFeatureMap };
			for (const [pos, assignedFeature] of Object.entries(currentMap) as [
				PanelPosition,
				PanelFeature | null,
			][]) {
				if (assignedFeature === feature && pos !== position) {
					currentMap[pos] = null;
				}
			}
			// 设置新位置的功能
			currentMap[position] = feature;
			return { panelFeatureMap: currentMap };
		}),

	getFeatureByPosition: (position) => {
		const state = get();
		return state.panelFeatureMap[position];
	},

	getAvailableFeatures: () => {
		const state = get();
		const assignedFeatures = Object.values(state.panelFeatureMap).filter(
			(f): f is PanelFeature => f !== null,
		);
		return ALL_PANEL_FEATURES.filter(
			(feature) => !assignedFeatures.includes(feature),
		);
	},

	// 兼容性方法：基于功能的访问
	getIsFeatureOpen: (feature) => {
		const position = getPositionByFeature(feature, get().panelFeatureMap);
		if (!position) return false;
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
		const position = getPositionByFeature(feature, get().panelFeatureMap);
		if (!position) return;
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
		const position = getPositionByFeature(feature, get().panelFeatureMap);
		if (!position) return 0;
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
		const position = getPositionByFeature(feature, get().panelFeatureMap);
		if (!position) return;
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
