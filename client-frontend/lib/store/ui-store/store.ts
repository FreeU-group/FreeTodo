import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PanelFeature, PanelPosition } from "@/lib/config/panel-config";
import { ALL_PANEL_FEATURES } from "@/lib/config/panel-config";
import { createLayoutActions } from "./layout-actions";
import { createUiStoreStorage } from "./storage";
import type { UiStoreState } from "./types";
import {
	clampWidth,
	DEFAULT_PANEL_STATE,
	getPositionByFeature,
} from "./utils";

/**
 * 同步通知弹窗配置到文件，供独立 Electron 弹窗进程读取
 */
async function syncNotificationPopupConfig(
	enabled: boolean,
): Promise<void> {
	try {
		await fetch("/api/notification-popup-config", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ enabled }),
		});
	} catch {
		// 静默失败：API 不可用时（如纯静态部署）不影响 UI
	}
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
			panelPinMap: DEFAULT_PANEL_STATE.panelPinMap,
			// 默认没有禁用的功能
			disabledFeatures: DEFAULT_PANEL_STATE.disabledFeatures,
			backendDisabledFeatures: DEFAULT_PANEL_STATE.backendDisabledFeatures,
			// 自动关闭的panel栈
			autoClosedPanels: DEFAULT_PANEL_STATE.autoClosedPanels,
			// Dock 显示模式
			dockDisplayMode: DEFAULT_PANEL_STATE.dockDisplayMode,
			// 是否显示 Agno 工具选择器
			showAgnoToolSelector: DEFAULT_PANEL_STATE.showAgnoToolSelector,
			// Agno 模式下选中的 FreeTodo 工具
			selectedAgnoTools: DEFAULT_PANEL_STATE.selectedAgnoTools,
			// Agno 模式下选中的外部工具
			selectedExternalTools: DEFAULT_PANEL_STATE.selectedExternalTools,
			// 用户自定义布局
			customLayouts: DEFAULT_PANEL_STATE.customLayouts,

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
					if (
						!state.isPanelAOpen ||
						(!state.isPanelBOpen && !state.isPanelCOpen)
					) {
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
					if (
						state.disabledFeatures.includes(feature) ||
						state.backendDisabledFeatures.includes(feature)
					) {
						return state;
					}
					// 固定面板不允许替换
					const currentMap = { ...state.panelFeatureMap };
					const currentFeature = currentMap[position];
					if (
						state.panelPinMap[position] &&
						currentFeature !== feature
					) {
						return state;
					}

					// 如果该功能已经在其他位置，先清除那个位置的分配
					for (const [pos, assignedFeature] of Object.entries(currentMap) as [
						PanelPosition,
						PanelFeature | null,
					][]) {
						if (assignedFeature === feature && pos !== position) {
							if (state.panelPinMap[pos]) {
								return state;
							}
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
				if (state.disabledFeatures.includes(feature)) return null;
				if (state.backendDisabledFeatures.includes(feature)) return null;
				return feature;
			},

			getAvailableFeatures: () => {
				const state = get();
				const disabledSet = new Set([
					...state.disabledFeatures,
					...state.backendDisabledFeatures,
				]);
				const assignedFeatures = Object.values(state.panelFeatureMap).filter(
					(f): f is PanelFeature => f !== null,
				);
				return ALL_PANEL_FEATURES.filter(
					(feature) =>
						!assignedFeatures.includes(feature) && !disabledSet.has(feature),
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
						if (!state.backendDisabledFeatures.includes(feature)) {
							disabledFeatures.delete(feature);
						}
					}

					return {
						disabledFeatures: Array.from(disabledFeatures),
						panelFeatureMap,
					};
				}),

			isFeatureEnabled: (feature) => {
				const state = get();
				return (
					!state.disabledFeatures.includes(feature) &&
					!state.backendDisabledFeatures.includes(feature)
				);
			},

			setPanelPinned: (position, pinned) =>
				set((state) => ({
					panelPinMap: {
						...state.panelPinMap,
						[position]: pinned,
					},
				})),

			togglePanelPinned: (position) =>
				set((state) => ({
					panelPinMap: {
						...state.panelPinMap,
						[position]: !state.panelPinMap[position],
					},
				})),

			// 兼容性方法：基于功能的访问
			getIsFeatureOpen: (feature) => {
				const position = getPositionByFeature(feature, get().panelFeatureMap);
				const state = get();
				if (
					!position ||
					state.disabledFeatures.includes(feature) ||
					state.backendDisabledFeatures.includes(feature)
				) {
					return false;
				}
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

			...createLayoutActions(set, get),

			swapPanelPositions: (position1, position2) => {
				set((state) => {
					// 如果两个位置相同，不需要交换
					if (position1 === position2) return state;
					if (state.panelPinMap[position1] || state.panelPinMap[position2]) {
						return state;
					}

					const newMap = { ...state.panelFeatureMap };
					// 交换两个位置的功能
					const feature1 = newMap[position1];
					const feature2 = newMap[position2];
					newMap[position1] = feature2;
					newMap[position2] = feature1;

					// 获取两个位置的当前激活状态
					const getIsOpen = (pos: PanelPosition): boolean => {
						switch (pos) {
							case "panelA":
								return state.isPanelAOpen;
							case "panelB":
								return state.isPanelBOpen;
							case "panelC":
								return state.isPanelCOpen;
						}
					};

					const isOpen1 = getIsOpen(position1);
					const isOpen2 = getIsOpen(position2);

					// 构建更新对象，同时交换功能映射和激活状态
					const updates: Partial<UiStoreState> = {
						panelFeatureMap: newMap,
					};

					// 交换激活状态：将 position1 的激活状态设置为 position2 的，反之亦然
					const setPanelOpen = (
						pos: PanelPosition,
						isOpen: boolean,
					) => {
						switch (pos) {
							case "panelA":
								updates.isPanelAOpen = isOpen;
								break;
							case "panelB":
								updates.isPanelBOpen = isOpen;
								break;
							case "panelC":
								updates.isPanelCOpen = isOpen;
								break;
						}
					};

					setPanelOpen(position1, isOpen2);
					setPanelOpen(position2, isOpen1);

					return updates;
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

			// 设置是否显示 Agno 工具选择器
			setShowAgnoToolSelector: (show) =>
				set(() => ({
					showAgnoToolSelector: show,
				})),

			// 设置 Agno 模式下选中的 FreeTodo 工具
			setSelectedAgnoTools: (tools) =>
				set(() => ({
					selectedAgnoTools: tools,
				})),

		// 设置 Agno 模式下选中的外部工具
		setSelectedExternalTools: (tools) =>
			set(() => ({
				selectedExternalTools: tools,
			})),

		// 通知弹窗设置
		notificationPopupEnabled: DEFAULT_PANEL_STATE.notificationPopupEnabled,

		setNotificationPopupEnabled: (enabled) => {
			set(() => ({ notificationPopupEnabled: enabled }));
			// 同步到配置文件，供独立弹窗进程读取
			void syncNotificationPopupConfig(enabled);
		},

			setBackendDisabledFeatures: (features) =>
				set((state) => {
					const sanitized = features.filter((feature) =>
						ALL_PANEL_FEATURES.includes(feature),
					);
					const panelFeatureMap = { ...state.panelFeatureMap };

					for (const position of Object.keys(
						panelFeatureMap,
					) as PanelPosition[]) {
						const feature = panelFeatureMap[position];
						if (feature && sanitized.includes(feature)) {
							panelFeatureMap[position] = null;
						}
					}

					return {
						backendDisabledFeatures: sanitized,
						panelFeatureMap,
					};
				}),
		}),
		{
			name: "ui-panel-config",
			storage: createUiStoreStorage(),
		},
	),
);
