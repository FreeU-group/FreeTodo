import type { LayoutPreset } from "./types";

// 导出完整的预设布局列表
export const LAYOUT_PRESETS: LayoutPreset[] = [
	{
		id: "default",
		name: "待办模式",
		panelFeatureMap: {
			panelA: "todos",
			panelB: "chat",
			panelC: "diary",
			panelD: "todoDetail",
		},
		isPanelAOpen: true,
		isPanelBOpen: true,
		isPanelCOpen: true,
		isPanelDOpen: true,
		panelAWidth: 1 / 3, // panelA 占左边 1/4，panelC 占右边 1/4，所以 panelA 占剩余空间的 1/3 (即 0.25/0.75)
		panelCWidth: 0.22, // panelC
		panelDWidth: 0.22, // panelD 占右边 1/4
	},
	{
		id: "lifetrace",
		name: "LifeTrace 模式",
		panelFeatureMap: {
			panelA: "diary",
			panelB: "activity",
			panelC: "debugShots",
			panelD: "todoDetail",
		},
		isPanelAOpen: false,
		isPanelBOpen: true,
		isPanelCOpen: true,
		isPanelDOpen: true,
		panelAWidth: 0.5, // 当 panelA 关闭时，这个值不影响布局
		panelCWidth: 1 / 3, // panelC ??? 1/3?panelB ????? 2/3
		panelDWidth: 0.22, // panelD ??? 1/4 占右边 1/3，panelB 自动占左边 2/3
	},
];
