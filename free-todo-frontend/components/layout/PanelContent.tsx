"use client";

import { useEffect, useState } from "react";
import { AchievementsPanel } from "@/apps/achievements/AchievementsPanel";
import { ActivityPanel } from "@/apps/activity/ActivityPanel";
import { CalendarPanel } from "@/apps/calendar/CalendarPanel";
import { ChatPanel } from "@/apps/chat/ChatPanel";
import { CostTrackingPanel } from "@/apps/cost-tracking";
import { SettingsPanel } from "@/apps/settings";
import { TodoDetail } from "@/apps/todo-detail";
import { TodoList } from "@/apps/todo-list";
import { PanelPositionProvider } from "@/components/common/PanelHeader";
import type { PanelPosition } from "@/lib/config/panel-config";
import {
	FEATURE_ICON_MAP,
	IS_DEV_FEATURE_ENABLED,
} from "@/lib/config/panel-config";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";
import { useUiStore } from "@/lib/store/ui-store";

// 动态导入调试面板（仅开发环境）
const DebugCapturePanel = IS_DEV_FEATURE_ENABLED
	? require("@/apps/debug/DebugCapturePanel").DebugCapturePanel
	: null;

interface PanelContentProps {
	position: PanelPosition;
}

export function PanelContent({ position }: PanelContentProps) {
	const { getFeatureByPosition } = useUiStore();
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	// 在 SSR 时使用 null，避免 hydration 错误
	const feature = mounted ? getFeatureByPosition(position) : null;

	// 获取位置对应的功能标签和占位符
	const getFeatureLabel = (pos: PanelPosition): string => {
		if (!mounted) return "";
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
			costTracking: t.page.costTrackingLabel,
			achievements: t.page.achievementsLabel,
			debugShots: t.page.debugShotsLabel,
		};
		return labelMap[feat] || "";
	};

	const getFeaturePlaceholder = (pos: PanelPosition): string => {
		if (!mounted) return "";
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
			costTracking: t.page.costTrackingPlaceholder,
			achievements: t.page.achievementsPlaceholder,
			debugShots: t.page.debugShotsPlaceholder,
		};
		return placeholderMap[feat] || "";
	};

	// 获取对应的图标
	const Icon = feature ? FEATURE_ICON_MAP[feature] : null;

	// 在 hydration 完成前，对于可能从 localStorage 读取的功能，显示占位符以避免不匹配
	// 特别是 debugShots 功能，因为它依赖于开发环境配置
	if (!mounted && feature === "debugShots") {
		return (
			<div className="flex h-full flex-col rounded-(--radius) overflow-hidden">
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

	// 如果是待办功能，显示待办组件
	if (feature === "todos") {
		return (
			<PanelPositionProvider position={position}>
				<TodoList />
			</PanelPositionProvider>
		);
	}

	// 如果是日历功能，显示日历组件
	if (feature === "calendar") {
		return (
			<PanelPositionProvider position={position}>
				<CalendarPanel />
			</PanelPositionProvider>
		);
	}

	// 如果是活动功能，显示活动面板
	if (feature === "activity") {
		return (
			<PanelPositionProvider position={position}>
				<ActivityPanel />
			</PanelPositionProvider>
		);
	}

	// 如果是成就功能，显示成就组件
	if (feature === "achievements") {
		return (
			<PanelPositionProvider position={position}>
				<AchievementsPanel />
			</PanelPositionProvider>
		);
	}

	// 如果是待办详情功能，显示待办详情组件
	if (feature === "todoDetail") {
		return (
			<PanelPositionProvider position={position}>
				<TodoDetail />
			</PanelPositionProvider>
		);
	}

	// 如果是聊天功能，显示聊天组件
	if (feature === "chat") {
		return (
			<PanelPositionProvider position={position}>
				<ChatPanel />
			</PanelPositionProvider>
		);
	}

	// 如果是设置功能，显示设置组件
	if (feature === "settings") {
		return (
			<PanelPositionProvider position={position}>
				<SettingsPanel />
			</PanelPositionProvider>
		);
	}

	// 如果是费用统计功能，显示费用面板
	if (feature === "costTracking") {
		return (
			<PanelPositionProvider position={position}>
				<CostTrackingPanel />
			</PanelPositionProvider>
		);
	}

	// 如果是开发调试截图面板（仅开发环境可见）
	if (feature === "debugShots" && IS_DEV_FEATURE_ENABLED && DebugCapturePanel) {
		const Panel = DebugCapturePanel;
		return (
			<PanelPositionProvider position={position}>
				<Panel />
			</PanelPositionProvider>
		);
	}

	// 其他功能显示占位符
	return (
		<div className="flex h-full flex-col rounded-(--radius) overflow-hidden">
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
