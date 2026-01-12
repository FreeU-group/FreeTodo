/**
 * Panel 配置层
 * 定义功能到位置的映射关系
 * 现在使用动态分配系统，功能可以动态分配到位置
 */

import {
	Activity,
	Award,
	BookOpen,
	CalendarDays,
	Camera,
	DollarSign,
	FileText,
	ListTodo,
	type LucideIcon,
	MessageSquare,
	Settings,
} from "lucide-react";

export type PanelPosition = "panelA" | "panelB" | "panelC";
export type PanelFeature =
	| "calendar"
	| "activity"
	| "todos"
	| "chat"
	| "todoDetail"
	| "diary"
	| "settings"
	| "costTracking"
	| "achievements"
	| "debugShots";

/**
 * 开发中的面板功能列表
 * 这些功能默认在 UI 中处于关闭状态，由用户手动开启
 * 在设置面板的"开发选项"中统一管理
 */
export const DEV_IN_PROGRESS_FEATURES: PanelFeature[] = [
	"diary",
	"activity",
	"debugShots",
	"achievements",
];

/**
 * 所有可用的功能列表
 */
export const ALL_PANEL_FEATURES: PanelFeature[] = [
	"calendar",
	"activity",
	"todos",
	"chat",
	"todoDetail",
	"diary",
	"settings",
	"costTracking",
	"achievements",
	"debugShots",
];

/**
 * 功能到图标的映射配置
 */
export const FEATURE_ICON_MAP: Record<PanelFeature, LucideIcon> = {
	calendar: CalendarDays,
	activity: Activity,
	todos: ListTodo,
	chat: MessageSquare,
	todoDetail: FileText,
	diary: BookOpen,
	settings: Settings,
	costTracking: DollarSign,
	achievements: Award,
	debugShots: Camera,
};
