import { createJSONStorage } from "zustand/middleware";
import type { PanelFeature, PanelPosition } from "@/lib/config/panel-config";
import { ALL_PANEL_FEATURES } from "@/lib/config/panel-config";
import type { DockDisplayMode, LayoutPreset, UiStoreState } from "./types";
import { clampWidth, DEFAULT_PANEL_STATE, validatePanelFeatureMap } from "./utils";

type PersistedState = Partial<UiStoreState> & {
	panelFeatureMap?: Record<PanelPosition, PanelFeature | null>;
	panelPinMap?: Record<PanelPosition, boolean>;
	customLayouts?: LayoutPreset[];
};

const VALID_POSITIONS: PanelPosition[] = ["panelA", "panelB", "panelC"];
const VALID_DOCK_MODES: DockDisplayMode[] = ["fixed", "auto-hide"];
const VALID_EXTERNAL_TOOL_IDS = new Set(DEFAULT_PANEL_STATE.selectedExternalTools);

export const createUiStoreStorage = () =>
	createJSONStorage<UiStoreState>(() => {
		const customStorage = {
			getItem: (name: string): string | null => {
				if (typeof window === "undefined") return null;

				try {
					const stored = localStorage.getItem(name);
					if (!stored) return null;

					const parsed = JSON.parse(stored) as { state?: PersistedState };
					const state = (parsed.state ?? parsed) as PersistedState;

					// 验证并修复 panelFeatureMap
					if (state.panelFeatureMap) {
						state.panelFeatureMap = validatePanelFeatureMap(state.panelFeatureMap);
					}

					// 校验 panelPinMap
					const normalizedPinMap: Record<PanelPosition, boolean> = {
						...DEFAULT_PANEL_STATE.panelPinMap,
					};
					if (state.panelPinMap && typeof state.panelPinMap === "object") {
						for (const position of VALID_POSITIONS) {
							const value = (state.panelPinMap as Record<string, unknown>)[
								position
							];
							if (typeof value === "boolean") {
								normalizedPinMap[position] = value;
							}
						}
					}
					state.panelPinMap = normalizedPinMap;

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

					// 校验后端禁用功能列表
					if (Array.isArray(state.backendDisabledFeatures)) {
						state.backendDisabledFeatures = state.backendDisabledFeatures.filter(
							(feature: PanelFeature): feature is PanelFeature =>
								ALL_PANEL_FEATURES.includes(feature),
						);
					} else {
						state.backendDisabledFeatures =
							DEFAULT_PANEL_STATE.backendDisabledFeatures;
					}
					// 后端能力禁用列表不持久化，启动后依赖同步结果
					state.backendDisabledFeatures =
						DEFAULT_PANEL_STATE.backendDisabledFeatures;

					// 校验自动关闭的panel栈
					if (Array.isArray(state.autoClosedPanels)) {
						state.autoClosedPanels = state.autoClosedPanels.filter(
							(pos: unknown): pos is PanelPosition =>
								typeof pos === "string" &&
								VALID_POSITIONS.includes(pos as PanelPosition),
						);
					} else {
						state.autoClosedPanels = DEFAULT_PANEL_STATE.autoClosedPanels;
					}

					// 校验 dock 显示模式
					if (
						!state.dockDisplayMode ||
						!VALID_DOCK_MODES.includes(state.dockDisplayMode)
					) {
						state.dockDisplayMode = DEFAULT_PANEL_STATE.dockDisplayMode;
					}

					// 校验 showAgnoToolSelector（默认 false）
					if (typeof state.showAgnoToolSelector !== "boolean") {
						state.showAgnoToolSelector =
							DEFAULT_PANEL_STATE.showAgnoToolSelector;
					}

					// 校验 selectedAgnoTools（默认空数组）
					if (!Array.isArray(state.selectedAgnoTools)) {
						state.selectedAgnoTools = DEFAULT_PANEL_STATE.selectedAgnoTools;
					} else {
						// 确保数组中的元素都是字符串
						state.selectedAgnoTools = state.selectedAgnoTools.filter(
							(tool: unknown): tool is string => typeof tool === "string",
						);
					}

					// 校验 selectedExternalTools（默认空数组）
					if (!Array.isArray(state.selectedExternalTools)) {
						state.selectedExternalTools =
							DEFAULT_PANEL_STATE.selectedExternalTools;
					} else {
						// 确保数组中的元素都是字符串
						state.selectedExternalTools = state.selectedExternalTools.filter(
							(tool: unknown): tool is string =>
								typeof tool === "string" && VALID_EXTERNAL_TOOL_IDS.has(tool),
						);
					}

					// 校验通知弹窗设置
				if (typeof state.notificationPopupEnabled !== "boolean") {
					state.notificationPopupEnabled =
						DEFAULT_PANEL_STATE.notificationPopupEnabled;
				}
				// 校验 customLayouts（默认空数组）
					if (Array.isArray(state.customLayouts)) {
						const seenNames = new Set<string>();
						state.customLayouts = state.customLayouts
							.map((layout: unknown): LayoutPreset | null => {
								if (!layout || typeof layout !== "object") return null;
								const raw = layout as {
									id?: unknown;
									name?: unknown;
									panelFeatureMap?: unknown;
									isPanelAOpen?: unknown;
									isPanelBOpen?: unknown;
									isPanelCOpen?: unknown;
									panelAWidth?: unknown;
									panelCWidth?: unknown;
								};

								if (typeof raw.name !== "string") return null;
								const name = raw.name.trim();
								if (!name) return null;
								const nameKey = name.toLocaleLowerCase();
								if (seenNames.has(nameKey)) return null;
								seenNames.add(nameKey);

								const panelFeatureMap = raw.panelFeatureMap
									? validatePanelFeatureMap(
											raw.panelFeatureMap as Record<
												PanelPosition,
												PanelFeature | null
											>,
										)
									: DEFAULT_PANEL_STATE.panelFeatureMap;

								const panelAWidth =
									typeof raw.panelAWidth === "number"
										? clampWidth(raw.panelAWidth)
										: DEFAULT_PANEL_STATE.panelAWidth;
								const panelCWidth =
									typeof raw.panelCWidth === "number"
										? clampWidth(raw.panelCWidth)
										: DEFAULT_PANEL_STATE.panelCWidth;

								return {
									id:
										typeof raw.id === "string" && raw.id
											? raw.id
											: `custom:${encodeURIComponent(name)}`,
									name,
									panelFeatureMap,
									isPanelAOpen:
										typeof raw.isPanelAOpen === "boolean"
											? raw.isPanelAOpen
											: DEFAULT_PANEL_STATE.isPanelAOpen,
									isPanelBOpen:
										typeof raw.isPanelBOpen === "boolean"
											? raw.isPanelBOpen
											: DEFAULT_PANEL_STATE.isPanelBOpen,
									isPanelCOpen:
										typeof raw.isPanelCOpen === "boolean"
											? raw.isPanelCOpen
											: DEFAULT_PANEL_STATE.isPanelCOpen,
									panelAWidth,
									panelCWidth,
								};
							})
							.filter(
								(layout): layout is LayoutPreset => Boolean(layout),
							);
					} else {
						state.customLayouts = DEFAULT_PANEL_STATE.customLayouts;
					}

					// 如果有功能被禁用，确保对应位置不再保留
					for (const position of Object.keys(
						state.panelFeatureMap ?? {},
					) as PanelPosition[]) {
						const feature = state.panelFeatureMap?.[position];
						if (
							feature &&
							(state.disabledFeatures?.includes(feature) ||
								state.backendDisabledFeatures?.includes(feature))
						) {
							if (state.panelFeatureMap) {
								state.panelFeatureMap[position] = null;
							}
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
	});
