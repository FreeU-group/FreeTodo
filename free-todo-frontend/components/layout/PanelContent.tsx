"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AchievementsPanel } from "@/apps/achievements/AchievementsPanel";
import { ActivityPanel } from "@/apps/activity/ActivityPanel";
import { CalendarPanel } from "@/apps/calendar/CalendarPanel";
import { ChatPanel } from "@/apps/chat/ChatPanel";
import { CostTrackingPanel } from "@/apps/cost-tracking";
import { DebugCapturePanel } from "@/apps/debug/DebugCapturePanel";
import { SettingsPanel } from "@/apps/settings";
import { TodoDetail } from "@/apps/todo-detail";
import { TodoList } from "@/apps/todo-list";
import {
	PanelHeader,
	PanelPositionProvider,
} from "@/components/common/layout/PanelHeader";
import type { PanelPosition } from "@/lib/config/panel-config";
import { FEATURE_ICON_MAP } from "@/lib/config/panel-config";
import { useUiStore } from "@/lib/store/ui-store";

interface PanelContentProps {
	position: PanelPosition;
}

export function PanelContent({ position }: PanelContentProps) {
	const { getFeatureByPosition } = useUiStore();
	const t = useTranslations("page");
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
		const labelKeyMap: Record<string, string> = {
			calendar: "calendarLabel",
			activity: "activityLabel",
			todos: "todosLabel",
			chat: "chatLabel",
			todoDetail: "todoDetailLabel",
			diary: "diaryLabel",
			settings: "settingsLabel",
			costTracking: "costTrackingLabel",
			achievements: "achievementsLabel",
			debugShots: "debugShotsLabel",
		};
		const key = labelKeyMap[feat];
		return key ? t(key) : "";
	};

	const getFeaturePlaceholder = (pos: PanelPosition): string => {
		if (!mounted) return "";
		const feat = getFeatureByPosition(pos);
		if (!feat) return "";
		const placeholderKeyMap: Record<string, string> = {
			calendar: "calendarPlaceholder",
			activity: "activityPlaceholder",
			todos: "todosPlaceholder",
			chat: "chatPlaceholder",
			todoDetail: "todoDetailPlaceholder",
			diary: "diaryPlaceholder",
			settings: "settingsPlaceholder",
			costTracking: "costTrackingPlaceholder",
			achievements: "achievementsPlaceholder",
			debugShots: "debugShotsPlaceholder",
		};
		const key = placeholderKeyMap[feat];
		return key ? t(key) : "";
	};

	// 获取对应的图标
	const Icon = feature ? FEATURE_ICON_MAP[feature] : null;

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

	// 如果是调试截图面板
	if (feature === "debugShots") {
		return (
			<PanelPositionProvider position={position}>
				<DebugCapturePanel />
			</PanelPositionProvider>
		);
	}

	// 其他功能显示占位符
	return (
		<PanelPositionProvider position={position}>
			<div className="flex h-full flex-col rounded-(--radius) overflow-hidden">
				{Icon && <PanelHeader icon={Icon} title={getFeatureLabel(position)} />}
				<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
					{getFeaturePlaceholder(position)}
				</div>
			</div>
		</PanelPositionProvider>
	);
}
