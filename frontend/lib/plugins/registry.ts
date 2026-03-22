import { type ComponentType, type LazyExoticComponent, lazy } from "react";

import type { PanelFeature } from "@/lib/config/panel-config";
import { FEATURE_ICON_MAP } from "@/lib/config/panel-config";

export type PanelPlugin = {
	id: PanelFeature;
	labelKey: string;
	placeholderKey: string;
	icon: (typeof FEATURE_ICON_MAP)[PanelFeature];
	loader?: () => Promise<{ default: ComponentType }>;
	backendModules?: string[];
};

const panelRegistry: Record<PanelFeature, PanelPlugin> = {
	calendar: {
		id: "calendar",
		labelKey: "calendarLabel",
		placeholderKey: "calendarPlaceholder",
		icon: FEATURE_ICON_MAP.calendar,
		backendModules: ["event"],
		loader: () =>
			import("@/apps/calendar/CalendarPanel").then((mod) => ({
				default: mod.CalendarPanel,
			})),
	},
	activity: {
		id: "activity",
		labelKey: "activityLabel",
		placeholderKey: "activityPlaceholder",
		icon: FEATURE_ICON_MAP.activity,
		backendModules: ["activity"],
		loader: () =>
			import("@/apps/activity/ActivityPanel").then((mod) => ({
				default: mod.ActivityPanel,
			})),
	},
	todos: {
		id: "todos",
		labelKey: "todosLabel",
		placeholderKey: "todosPlaceholder",
		icon: FEATURE_ICON_MAP.todos,
		backendModules: ["todo"],
		loader: () =>
			import("@/apps/todo-list").then((mod) => ({
				default: mod.TodoList,
			})),
	},
	chat: {
		id: "chat",
		labelKey: "chatLabel",
		placeholderKey: "chatPlaceholder",
		icon: FEATURE_ICON_MAP.chat,
		backendModules: ["chat"],
		loader: () =>
			import("@/apps/chat/ChatPanel").then((mod) => ({
				default: mod.ChatPanel,
			})),
	},
	todoDetail: {
		id: "todoDetail",
		labelKey: "todoDetailLabel",
		placeholderKey: "todoDetailPlaceholder",
		icon: FEATURE_ICON_MAP.todoDetail,
		backendModules: ["todo"],
		loader: () =>
			import("@/apps/todo-detail").then((mod) => ({
				default: mod.TodoDetail,
			})),
	},
	diary: {
		id: "diary",
		labelKey: "diaryLabel",
		placeholderKey: "diaryPlaceholder",
		icon: FEATURE_ICON_MAP.diary,
		backendModules: ["journal"],
		loader: () =>
			import("@/apps/diary").then((mod) => ({
				default: mod.DiaryPanel,
			})),
	},
	settings: {
		id: "settings",
		labelKey: "settingsLabel",
		placeholderKey: "settingsPlaceholder",
		icon: FEATURE_ICON_MAP.settings,
		backendModules: ["config"],
		loader: () =>
			import("@/apps/settings").then((mod) => ({
				default: mod.SettingsPanel,
			})),
	},
	costTracking: {
		id: "costTracking",
		labelKey: "costTrackingLabel",
		placeholderKey: "costTrackingPlaceholder",
		icon: FEATURE_ICON_MAP.costTracking,
		backendModules: ["cost_tracking"],
		loader: () =>
			import("@/apps/cost-tracking").then((mod) => ({
				default: mod.CostTrackingPanel,
			})),
	},
	achievements: {
		id: "achievements",
		labelKey: "achievementsLabel",
		placeholderKey: "achievementsPlaceholder",
		icon: FEATURE_ICON_MAP.achievements,
		loader: () =>
			import("@/apps/achievements/AchievementsPanel").then((mod) => ({
				default: mod.AchievementsPanel,
			})),
	},
	debugShots: {
		id: "debugShots",
		labelKey: "debugShotsLabel",
		placeholderKey: "debugShotsPlaceholder",
		icon: FEATURE_ICON_MAP.debugShots,
		backendModules: ["event"],
		loader: () =>
			import("@/apps/debug/DebugCapturePanel").then((mod) => ({
				default: mod.DebugCapturePanel,
			})),
	},
	crawler: {
		id: "crawler",
		labelKey: "crawlerLabel",
		placeholderKey: "crawlerPlaceholder",
		icon: FEATURE_ICON_MAP.crawler,
		backendModules: ["crawler"],
		loader: () =>
			import("@/apps/crawler").then((mod) => ({
				default: mod.CrawlerPanel,
			})),
	},
	crawlerDetail: {
		id: "crawlerDetail",
		labelKey: "crawlerDetailLabel",
		placeholderKey: "crawlerDetailPlaceholder",
		icon: FEATURE_ICON_MAP.crawlerDetail,
		backendModules: ["crawler"],
		loader: () =>
			import("@/apps/crawler").then((mod) => ({
				default: mod.CrawlerDetailPanel,
			})),
	},
	audio: {
		id: "audio",
		labelKey: "audioLabel",
		placeholderKey: "audioPlaceholder",
		icon: FEATURE_ICON_MAP.audio,
		backendModules: ["audio"],
		loader: () =>
			import("@/apps/audio/AudioPanel").then((mod) => ({
				default: mod.AudioPanel,
			})),
	},
	speakerLive: {
		id: "speakerLive",
		labelKey: "speakerLiveLabel",
		placeholderKey: "speakerLivePlaceholder",
		icon: FEATURE_ICON_MAP.speakerLive,
		backendModules: ["audio"],
		loader: () =>
			import("@/apps/speaker-live/SpeakerLivePanel").then((mod) => ({
				default: mod.SpeakerLivePanel,
			})),
	},
	preview: {
		id: "preview",
		labelKey: "previewLabel",
		placeholderKey: "previewPlaceholder",
		icon: FEATURE_ICON_MAP.preview,
		loader: () =>
			import("@/apps/preview").then((mod) => ({
				default: mod.PreviewPanel,
			})),
	},
	perceptionStream: {
		id: "perceptionStream",
		labelKey: "perceptionStreamLabel",
		placeholderKey: "perceptionStreamPlaceholder",
		icon: FEATURE_ICON_MAP.perceptionStream,
		backendModules: ["perception"],
		loader: () =>
			import("@/apps/perception-stream/PerceptionStreamPanel").then((mod) => ({
				default: mod.PerceptionStreamPanel,
			})),
	},
	todoIntent: {
		id: "todoIntent",
		labelKey: "todoIntentLabel",
		placeholderKey: "todoIntentPlaceholder",
		icon: FEATURE_ICON_MAP.todoIntent,
		backendModules: ["perception"],
		loader: () =>
			import("@/apps/todo-intent/TodoIntentPanel").then((mod) => ({
				default: mod.TodoIntentPanel,
			})),
	},
	eventStream: {
		id: "eventStream",
		labelKey: "eventStreamLabel",
		placeholderKey: "eventStreamPlaceholder",
		icon: FEATURE_ICON_MAP.eventStream,
		backendModules: ["memory"],
		loader: () =>
			import("@/apps/event-stream/EventStreamPanel").then((mod) => ({
				default: mod.EventStreamPanel,
			})),
	},
	userProfile: {
		id: "userProfile",
		labelKey: "userProfileLabel",
		placeholderKey: "userProfilePlaceholder",
		icon: FEATURE_ICON_MAP.userProfile,
		backendModules: ["memory"],
		loader: () =>
			import("@/apps/user-profile/UserProfilePanel").then((mod) => ({
				default: mod.UserProfilePanel,
			})),
	},
};

const lazyPanelCache = new Map<PanelFeature, LazyExoticComponent<ComponentType>>();

export function getPanelPlugin(feature: PanelFeature | null): PanelPlugin | null {
	if (!feature) return null;
	return panelRegistry[feature] ?? null;
}

export function getPanelPlugins(): PanelPlugin[] {
	return Object.values(panelRegistry);
}

export function getPanelLazyComponent(
	feature: PanelFeature | null,
): LazyExoticComponent<ComponentType> | null {
	if (!feature) return null;
	const plugin = panelRegistry[feature];
	if (!plugin?.loader) return null;
	const cached = lazyPanelCache.get(feature);
	if (cached) return cached;
	const lazyComponent = lazy(plugin.loader);
	lazyPanelCache.set(feature, lazyComponent);
	return lazyComponent;
}
