import type { LayoutPreset } from "./types";

// 导出完整的预设布局列表
export const LAYOUT_PRESETS: LayoutPreset[] = [
	{
		id: "default",
		name: "待办列表模式",
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
	{
		id: "calendar",
		name: "待办日历模式",
		panelFeatureMap: {
			panelA: "calendar",
			panelB: "todoDetail",
			panelC: "chat",
		},
		isPanelAOpen: true,
		isPanelBOpen: true,
		isPanelCOpen: true,
		panelAWidth: 0.6, // panelA 占左边 1/2
		panelCWidth: 0.25, // panelC 占右边 1/4
	},
	{
		id: "lifetrace",
		name: "LifeTrace 模式",
		panelFeatureMap: {
			panelA: "activity",
			panelB: "debugShots",
			panelC: null,
		},
		isPanelAOpen: true,
		isPanelBOpen: true,
		isPanelCOpen: false,
		panelAWidth: 2 / 3, // 当 panelA 关闭时，这个值不影响布局
		panelCWidth: 1 / 4,
	},
];
