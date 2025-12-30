import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PanelFeature, PanelPosition } from "@/lib/config/panel-config";
import {
	ALL_PANEL_FEATURES,
	IS_DEV_FEATURE_ENABLED,
} from "@/lib/config/panel-config";

// Dock 显示模式类型
export type DockDisplayMode = "fixed" | "auto-hide";

// 布局预设类型
export interface LayoutPreset {
	id: string;
	name: string;
	panelFeatureMap: Record<PanelPosition, PanelFeature | null>;
	isPanelAOpen: boolean;
	isPanelBOpen: boolean;
	isPanelCOpen: boolean;
	panelAWidth?: number;
	panelCWidth?: number;
}

// 预设布局列表
const BASE_LAYOUT_PRESETS: LayoutPreset[] = [
	{
		id: "default",
		name: "待办模式",
		panelFeatureMap: {
			panelA: "todos",
			panelB: "chat",
			panelC: "todoDetail",
		},
		isPanelAOpen: true,
		isPanelBOpen: true,
		isPanelCOpen: true,
		panelAWidth: 1 / 3, // panelA 占左边 1/4，panelC 占右边 1/4，所以 panelA 占剩余空间的 1/3 (即 0.25/0.75)
		panelCWidth: 0.25, // panelC 占右边 1/4
	},
];

const DEV_LAYOUT_PRESETS: LayoutPreset[] = [
	{
		id: "lifetrace-dev",
		name: "LifeTrace 模式",
		panelFeatureMap: {
			panelA: "diary",
			panelB: "activity",
			panelC: "debugShots",
		},
		isPanelAOpen: false,
		isPanelBOpen: true,
		isPanelCOpen: true,
		panelAWidth: 0.5, // 当 panelA 关闭时，这个值不影响布局
		panelCWidth: 1 / 3, // panelC 占右边 1/3，panelB 自动占左边 2/3
	},
];

export const LAYOUT_PRESETS: LayoutPreset[] = [
	...BASE_LAYOUT_PRESETS,
	...(IS_DEV_FEATURE_ENABLED ? DEV_LAYOUT_PRESETS : []),
];

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
	// 被禁用的功能列表
	disabledFeatures: PanelFeature[];
	// 自动关闭的panel栈（记录因窗口缩小而自动关闭的panel，从右到左的顺序）
	autoClosedPanels: PanelPosition[];
	// Dock 显示模式：固定显示或鼠标离开时自动隐藏
	dockDisplayMode: DockDisplayMode;
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
	setFeatureEnabled: (feature: PanelFeature, enabled: boolean) => void;
	isFeatureEnabled: (feature: PanelFeature) => boolean;
	// 兼容性方法：为了保持向后兼容，保留基于功能的访问方法
	// 这些方法内部会通过动态映射查找位置
	getIsFeatureOpen: (feature: PanelFeature) => boolean;
	toggleFeature: (feature: PanelFeature) => void;
	getFeatureWidth: (feature: PanelFeature) => number;
	setFeatureWidth: (feature: PanelFeature, width: number) => void;
	// 应用预设布局
	applyLayout: (layoutId: string) => void;
	// 交换两个面板的位置（功能分配）
	swapPanelPositions: (
		position1: PanelPosition,
		position2: PanelPosition,
	) => void;
	// 自动关闭panel管理方法
	setAutoClosePanel: (position: PanelPosition) => void;
	restoreAutoClosedPanel: () => void;
	clearAutoClosedPanels: () => void;
	// Dock 显示模式设置方法
	setDockDisplayMode: (mode: DockDisplayMode) => void;
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

// Panel 配置的默认值
const DEFAULT_PANEL_STATE = {
	isPanelAOpen: true,
	isPanelBOpen: true,
	isPanelCOpen: true,
	panelAWidth: 1 / 3, // panelA 占左边 1/4，panelC 占右边 1/4，所以 panelA 占剩余空间的 1/3 (即 0.25/0.75)
	panelCWidth: 0.25, // panelC 占右边 1/4
	disabledFeatures: [] as PanelFeature[],
	panelFeatureMap: {
		panelA: "todos" as PanelFeature,
		panelB: "chat" as PanelFeature,
		panelC: "todoDetail" as PanelFeature,
	},
	autoClosedPanels: [] as PanelPosition[],
	dockDisplayMode: "auto-hide" as DockDisplayMode,
};

// 验证 panelFeatureMap 的有效性
function validatePanelFeatureMap(
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

export const useUiStore = create<UiStoreState>()(
	persist(
		(set, get) => ({
			// 位置槽位初始状态
			isPanelAOpen: DEFAULT_PANEL_STATE.isPanelAOpen,
			isPanelBOpen: DEFAULT_PANEL_STATE.isPanelBOpen,
			isPanelCOpen: DEFAULT_PANEL_STATE.isPanelCOpen,
			panelAWidth: DEFAULT_PANEL_STATE.panelAWidth,
			panelCWidth: DEFAULT_PANEL_STATE.panelCWidth,
			// 动态功能分配初始状态：默认分配
			panelFeatureMap: DEFAULT_PANEL_STATE.panelFeatureMap,
			// 默认没有禁用的功能
			disabledFeatures: DEFAULT_PANEL_STATE.disabledFeatures,
			// 自动关闭的panel栈
			autoClosedPanels: DEFAULT_PANEL_STATE.autoClosedPanels,
			// Dock 显示模式
			dockDisplayMode: DEFAULT_PANEL_STATE.dockDisplayMode,

			// 位置槽位 toggle 方法
			togglePanelA: () =>
				set((state) => {
					const newIsOpen = !state.isPanelAOpen;
					// 如果用户手动关闭panel，从自动关闭栈中移除
					// 如果用户手动打开panel，清空自动关闭栈（用户意图改变了布局）
					const newAutoClosedPanels = newIsOpen
						? []
						: state.autoClosedPanels.filter((pos) => pos !== "panelA");
					return {
						isPanelAOpen: newIsOpen,
						autoClosedPanels: newAutoClosedPanels,
					};
				}),

			togglePanelB: () =>
				set((state) => {
					const newIsOpen = !state.isPanelBOpen;
					const newAutoClosedPanels = newIsOpen
						? []
						: state.autoClosedPanels.filter((pos) => pos !== "panelB");
					return {
						isPanelBOpen: newIsOpen,
						autoClosedPanels: newAutoClosedPanels,
					};
				}),

			togglePanelC: () =>
				set((state) => {
					const newIsOpen = !state.isPanelCOpen;
					const newAutoClosedPanels = newIsOpen
						? []
						: state.autoClosedPanels.filter((pos) => pos !== "panelC");
					return {
						isPanelCOpen: newIsOpen,
						autoClosedPanels: newAutoClosedPanels,
					};
				}),

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
					// 允许在 panelC 打开且至少有一个左侧面板（A 或 B）打开时调整宽度
					if (
						!state.isPanelCOpen ||
						(!state.isPanelAOpen && !state.isPanelBOpen)
					) {
						return state;
					}

					return {
						panelCWidth: clampWidth(width),
					};
				}),

			// 动态功能分配方法
			setPanelFeature: (position, feature) =>
				set((state) => {
					// 禁用的功能不允许分配
					if (state.disabledFeatures.includes(feature)) {
						return state;
					}
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
				const feature = state.panelFeatureMap[position];
				if (!feature) return null;
				return state.disabledFeatures.includes(feature) ? null : feature;
			},

			getAvailableFeatures: () => {
				const state = get();
				const assignedFeatures = Object.values(state.panelFeatureMap).filter(
					(f): f is PanelFeature => f !== null,
				);
				return ALL_PANEL_FEATURES.filter(
					(feature) =>
						!assignedFeatures.includes(feature) &&
						!state.disabledFeatures.includes(feature),
				);
			},

			setFeatureEnabled: (feature, enabled) =>
				set((state) => {
					const disabledFeatures = new Set(state.disabledFeatures);
					const panelFeatureMap = { ...state.panelFeatureMap };

					if (!enabled) {
						disabledFeatures.add(feature);
						// 移除已分配到任何面板的禁用功能
						for (const position of Object.keys(
							panelFeatureMap,
						) as PanelPosition[]) {
							if (panelFeatureMap[position] === feature) {
								panelFeatureMap[position] = null;
							}
						}
					} else {
						disabledFeatures.delete(feature);
					}

					return {
						disabledFeatures: Array.from(disabledFeatures),
						panelFeatureMap,
					};
				}),

			isFeatureEnabled: (feature) => {
				const state = get();
				return !state.disabledFeatures.includes(feature);
			},

			// 兼容性方法：基于功能的访问
			getIsFeatureOpen: (feature) => {
				const position = getPositionByFeature(feature, get().panelFeatureMap);
				const state = get();
				if (!position || state.disabledFeatures.includes(feature)) return false;
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

			applyLayout: (layoutId) => {
				const layout = LAYOUT_PRESETS.find((l) => l.id === layoutId);
				if (!layout) return;

				set({
					panelFeatureMap: { ...layout.panelFeatureMap },
					isPanelAOpen: layout.isPanelAOpen,
					isPanelBOpen: layout.isPanelBOpen,
					isPanelCOpen: layout.isPanelCOpen,
					...(layout.panelAWidth !== undefined && {
						panelAWidth: layout.panelAWidth,
					}),
					...(layout.panelCWidth !== undefined && {
						panelCWidth: layout.panelCWidth,
					}),
				});
			},

			swapPanelPositions: (position1, position2) => {
				set((state) => {
					// 如果两个位置相同，不需要交换
					if (position1 === position2) return state;

					const newMap = { ...state.panelFeatureMap };
					// 交换两个位置的功能
					const feature1 = newMap[position1];
					const feature2 = newMap[position2];
					newMap[position1] = feature2;
					newMap[position2] = feature1;

					return { panelFeatureMap: newMap };
				});
			},

			// 自动关闭panel管理方法
			setAutoClosePanel: (position) =>
				set((state) => {
					// 如果panel已经在栈中，不重复添加
					if (state.autoClosedPanels.includes(position)) {
						return state;
					}
					// 关闭panel并推入栈
					const newAutoClosedPanels = [...state.autoClosedPanels, position];
					const updates: Partial<UiStoreState> = {
						autoClosedPanels: newAutoClosedPanels,
					};
					switch (position) {
						case "panelA":
							updates.isPanelAOpen = false;
							break;
						case "panelB":
							updates.isPanelBOpen = false;
							break;
						case "panelC":
							updates.isPanelCOpen = false;
							break;
					}
					return updates;
				}),

			restoreAutoClosedPanel: () =>
				set((state) => {
					// 如果栈为空，不执行任何操作
					if (state.autoClosedPanels.length === 0) {
						return state;
					}
					// 从栈顶弹出最近关闭的panel
					const newAutoClosedPanels = [...state.autoClosedPanels];
					const positionToRestore = newAutoClosedPanels.pop();
					// 如果pop返回undefined，不执行任何操作
					if (!positionToRestore) {
						return state;
					}
					const updates: Partial<UiStoreState> = {
						autoClosedPanels: newAutoClosedPanels,
					};
					// 恢复panel
					switch (positionToRestore) {
						case "panelA":
							updates.isPanelAOpen = true;
							break;
						case "panelB":
							updates.isPanelBOpen = true;
							break;
						case "panelC":
							updates.isPanelCOpen = true;
							break;
					}
					return updates;
				}),

			clearAutoClosedPanels: () =>
				set(() => ({
					autoClosedPanels: [],
				})),

			// Dock 显示模式设置方法
			setDockDisplayMode: (mode) =>
				set(() => ({
					dockDisplayMode: mode,
				})),
		}),
		{
			name: "ui-panel-config",
			storage: createJSONStorage(() => {
				const customStorage = {
					getItem: (name: string): string | null => {
						if (typeof window === "undefined") return null;

						try {
							const stored = localStorage.getItem(name);
							if (!stored) return null;

							const parsed = JSON.parse(stored);
							const state = parsed.state || parsed;

							// 验证并修复 panelFeatureMap
							if (state.panelFeatureMap) {
								state.panelFeatureMap = validatePanelFeatureMap(
									state.panelFeatureMap,
								);
							}

							// 验证宽度值
							if (
								typeof state.panelAWidth === "number" &&
								!Number.isNaN(state.panelAWidth)
							) {
								state.panelAWidth = clampWidth(state.panelAWidth);
							} else {
								state.panelAWidth = DEFAULT_PANEL_STATE.panelAWidth;
							}

							if (
								typeof state.panelCWidth === "number" &&
								!Number.isNaN(state.panelCWidth)
							) {
								state.panelCWidth = clampWidth(state.panelCWidth);
							} else {
								state.panelCWidth = DEFAULT_PANEL_STATE.panelCWidth;
							}

							// 验证布尔值
							if (typeof state.isPanelAOpen !== "boolean") {
								state.isPanelAOpen = DEFAULT_PANEL_STATE.isPanelAOpen;
							}
							if (typeof state.isPanelBOpen !== "boolean") {
								state.isPanelBOpen = DEFAULT_PANEL_STATE.isPanelBOpen;
							}
							if (typeof state.isPanelCOpen !== "boolean") {
								state.isPanelCOpen = DEFAULT_PANEL_STATE.isPanelCOpen;
							}

							// 校验禁用功能列表
							if (Array.isArray(state.disabledFeatures)) {
								state.disabledFeatures = state.disabledFeatures.filter(
									(feature: PanelFeature): feature is PanelFeature =>
										ALL_PANEL_FEATURES.includes(feature),
								);
							} else {
								state.disabledFeatures = DEFAULT_PANEL_STATE.disabledFeatures;
							}

							// 校验自动关闭的panel栈
							if (Array.isArray(state.autoClosedPanels)) {
								const validPositions: PanelPosition[] = [
									"panelA",
									"panelB",
									"panelC",
								];
								state.autoClosedPanels = state.autoClosedPanels.filter(
									(pos: unknown): pos is PanelPosition =>
										typeof pos === "string" &&
										validPositions.includes(pos as PanelPosition),
								);
							} else {
								state.autoClosedPanels = DEFAULT_PANEL_STATE.autoClosedPanels;
							}

							// 校验 dock 显示模式
							const validDockModes: DockDisplayMode[] = ["fixed", "auto-hide"];
							if (
								!state.dockDisplayMode ||
								!validDockModes.includes(state.dockDisplayMode)
							) {
								state.dockDisplayMode = DEFAULT_PANEL_STATE.dockDisplayMode;
							}

							// 如果有功能被禁用，确保对应位置不再保留
							for (const position of Object.keys(
								state.panelFeatureMap,
							) as PanelPosition[]) {
								const feature = state.panelFeatureMap[position];
								if (
									feature &&
									state.disabledFeatures.includes(feature as PanelFeature)
								) {
									state.panelFeatureMap[position] = null;
								}
							}

							return JSON.stringify({ state });
						} catch (e) {
							console.error("Error loading panel config:", e);
							return null;
						}
					},
					setItem: (name: string, value: string): void => {
						if (typeof window === "undefined") return;

						try {
							localStorage.setItem(name, value);
						} catch (e) {
							console.error("Error saving panel config:", e);
						}
					},
					removeItem: (name: string): void => {
						if (typeof window === "undefined") return;
						localStorage.removeItem(name);
					},
				};
				return customStorage;
			}),
		},
	),
);
