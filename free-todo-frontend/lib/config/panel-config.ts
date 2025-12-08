/**
 * Panel 配置层
 * 定义功能到位置的映射关系
 * 现在使用动态分配系统，功能可以动态分配到位置
 */

export type PanelPosition = "panelA" | "panelB" | "panelC";
export type PanelFeature =
	| "calendar"
	| "todos"
	| "chat"
	| "todoDetail"
	| "diary"
	| "settings";

/**
 * 所有可用的功能列表
 */
export const ALL_PANEL_FEATURES: PanelFeature[] = [
	"calendar",
	"todos",
	"chat",
	"todoDetail",
	"diary",
	"settings",
];
