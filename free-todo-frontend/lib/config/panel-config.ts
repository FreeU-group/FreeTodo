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

const IS_DEV_ENV = process.env.NODE_ENV === "development";

export type PanelPosition = "panelA" | "panelB" | "panelC";
export type CorePanelFeature =
	| "calendar"
	| "activity"
	| "todos"
	| "chat"
	| "todoDetail"
	| "diary"
	| "settings"
	| "costTracking"
	| "achievements";
export type DevPanelFeature = "debugShots";
export type PanelFeature = CorePanelFeature | DevPanelFeature;

/**
 * 开发中的面板功能列表
 * 这些功能默认在 UI 中处于关闭状态，由用户手动开启
 */
export const DEV_IN_PROGRESS_FEATURES: PanelFeature[] = [
	"diary",
	"activity",
	"debugShots",
	"achievements",
];

const CORE_PANEL_FEATURES: CorePanelFeature[] = [
	"calendar",
	"activity",
	"todos",
	"chat",
	"todoDetail",
	"diary",
	"settings",
	"costTracking",
	"achievements",
];
const DEV_PANEL_FEATURES: DevPanelFeature[] = IS_DEV_ENV ? ["debugShots"] : [];

/**
 * 所有可用的功能列表
 */
export const ALL_PANEL_FEATURES: PanelFeature[] = [
	...CORE_PANEL_FEATURES,
	...DEV_PANEL_FEATURES,
];

export const DEV_FEATURES = DEV_PANEL_FEATURES;
export const IS_DEV_FEATURE_ENABLED = IS_DEV_ENV;

/**
 * 功能到图标的映射配置
 */
const CORE_FEATURE_ICON_MAP: Record<CorePanelFeature, LucideIcon> = {
	calendar: CalendarDays,
	activity: Activity,
	todos: ListTodo,
	chat: MessageSquare,
	todoDetail: FileText,
	diary: BookOpen,
	settings: Settings,
	costTracking: DollarSign,
	achievements: Award,
};

const DEV_FEATURE_ICON_MAP: Record<DevPanelFeature, LucideIcon> = {
	debugShots: Camera,
};

export const FEATURE_ICON_MAP: Record<PanelFeature, LucideIcon> = IS_DEV_ENV
	? {
			...CORE_FEATURE_ICON_MAP,
			...DEV_FEATURE_ICON_MAP,
		}
	: (CORE_FEATURE_ICON_MAP as Record<PanelFeature, LucideIcon>);
