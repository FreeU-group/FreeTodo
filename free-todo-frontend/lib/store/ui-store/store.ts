import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { PanelFeature, PanelPosition } from "@/lib/config/panel-config";
import { ALL_PANEL_FEATURES } from "@/lib/config/panel-config";
import { LAYOUT_PRESETS } from "./layout-presets";
import type { DockDisplayMode, UiStoreState } from "./types";
import {
	clampWidth,
	DEFAULT_PANEL_STATE,
	getPositionByFeature,
	validatePanelFeatureMap,
} from "./utils";

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
