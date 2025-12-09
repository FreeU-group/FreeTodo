/**
 * Panel 配置层
 * 定义功能到位置的映射关系
 * 现在使用动态分配系统，功能可以动态分配到位置
 */

import {
	Award,
	BookOpen,
	CalendarDays,
	FileText,
	LayoutPanelLeft,
	type LucideIcon,
	MessageSquare,
	Settings,
} from "lucide-react";

export type PanelPosition = "panelA" | "panelB" | "panelC";
export type PanelFeature =
	| "calendar"
	| "todos"
	| "chat"
	| "todoDetail"
	| "diary"
	| "settings"
	| "achievements";

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
	"achievements",
];

/**
 * 功能到图标的映射配置
 */
export const FEATURE_ICON_MAP: Record<PanelFeature, LucideIcon> = {
	calendar: CalendarDays,
	todos: LayoutPanelLeft,
	chat: MessageSquare,
	todoDetail: FileText,
	diary: BookOpen,
	settings: Settings,
	achievements: Award,
};
