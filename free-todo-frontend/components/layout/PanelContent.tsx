"use client";

import { AchievementsPanel } from "@/components/achievements/AchievementsPanel";
import { ActivityPanel } from "@/components/activity/ActivityPanel";
import { CalendarPanel } from "@/components/calendar/CalendarPanel";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { TodoDetail } from "@/components/todo/TodoDetail";
import { TodoList } from "@/components/todo/TodoList";
import type { PanelPosition } from "@/lib/config/panel-config";
import {
	FEATURE_ICON_MAP,
	IS_DEV_FEATURE_ENABLED,
} from "@/lib/config/panel-config";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";
import { useUiStore } from "@/lib/store/ui-store";

const DebugCapturePanel = IS_DEV_FEATURE_ENABLED
	? require("@/components/debug/DebugCapturePanel").DebugCapturePanel
	: null;

interface PanelContentProps {
	position: PanelPosition;
}

export function PanelContent({ position }: PanelContentProps) {
	const { getFeatureByPosition } = useUiStore();
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);

	const feature = getFeatureByPosition(position);

	// 获取位置对应的功能标签和占位符
	const getFeatureLabel = (pos: PanelPosition): string => {
		const feat = getFeatureByPosition(pos);
		if (!feat) return "";
		const labelMap: Record<string, string> = {
			calendar: t.page.calendarLabel,
			activity: t.page.activityLabel,
			todos: t.page.todosLabel,
			chat: t.page.chatLabel,
			todoDetail: t.page.todoDetailLabel,
			diary: t.page.diaryLabel,
			settings: t.page.settingsLabel,
			achievements: t.page.achievementsLabel,
			debugShots: t.page.debugShotsLabel,
		};
		return labelMap[feat] || "";
	};

	const getFeaturePlaceholder = (pos: PanelPosition): string => {
		const feat = getFeatureByPosition(pos);
		if (!feat) return "";
		const placeholderMap: Record<string, string> = {
			calendar: t.page.calendarPlaceholder,
			activity: t.page.activityPlaceholder,
			todos: t.page.todosPlaceholder,
			chat: t.page.chatPlaceholder,
			todoDetail: t.page.todoDetailPlaceholder,
			diary: t.page.diaryPlaceholder,
			settings: t.page.settingsPlaceholder,
			achievements: t.page.achievementsPlaceholder,
			debugShots: t.page.debugShotsPlaceholder,
		};
		return placeholderMap[feat] || "";
	};

	// 获取对应的图标
	const Icon = feature ? FEATURE_ICON_MAP[feature] : null;

	// 如果是待办功能，显示待办组件
	if (feature === "todos") {
		return <TodoList />;
	}

	// 如果是日历功能，显示日历组件
	if (feature === "calendar") {
		return <CalendarPanel />;
	}

	// 如果是活动功能，显示活动面板
	if (feature === "activity") {
		return <ActivityPanel />;
	}

	// 如果是成就功能，显示成就组件
	if (feature === "achievements") {
		return <AchievementsPanel />;
	}

	// 如果是待办详情功能，显示待办详情组件
	if (feature === "todoDetail") {
		return <TodoDetail />;
	}

	// 如果是聊天功能，显示聊天组件
	if (feature === "chat") {
		return <ChatPanel />;
	}

	// 如果是开发调试截图面板（仅开发环境可见）
	if (feature === "debugShots" && IS_DEV_FEATURE_ENABLED && DebugCapturePanel) {
		const Panel = DebugCapturePanel;
		return <Panel />;
	}

	// 其他功能显示占位符
	return (
		<div className="flex h-full flex-col">
			<div className="flex h-10 shrink-0 items-center gap-2 bg-muted/30 px-4">
				{Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
				<h2 className="text-sm font-medium text-foreground">
					{getFeatureLabel(position)}
				</h2>
			</div>
			<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
				{getFeaturePlaceholder(position)}
			</div>
		</div>
	);
}
