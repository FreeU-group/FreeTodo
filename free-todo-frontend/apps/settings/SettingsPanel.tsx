"use client";

import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { CollapsibleSection } from "@/components/common/layout/CollapsibleSection";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import { useConfig } from "@/lib/query";
import {
	AutoTodoDetectionSection,
	DifyConfigSection,
	DockDisplayModeSection,
	LlmConfigSection,
	PanelSwitchesSection,
	RecorderConfigSection,
	SchedulerSection,
	SettingsSection,
	TavilyConfigSection,
} from "./components";

/**
 * 设置面板组件
 * 用于配置系统各项功能
 */
export function SettingsPanel() {
	const tPage = useTranslations("page");
	const tSettings = useTranslations("page.settings");

	// 使用 TanStack Query 获取配置
	const { data: config, isLoading: configLoading } = useConfig();

	// 状态管理
	const [showDeveloperOptions, setShowDeveloperOptions] = useState(false);

	const loading = configLoading;

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部标题栏 */}
			<PanelHeader icon={Settings} title={tPage("settingsLabel")} />

			{/* 设置内容区域 */}
			<div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
				{/* LLM 配置 */}
				<LlmConfigSection config={config} loading={loading} />

				{/* Tavily 配置 */}
				<TavilyConfigSection config={config} loading={loading} />

				{/* 自动待办检测设置 */}
				<AutoTodoDetectionSection config={config} loading={loading} />

				{/* Dock 显示模式设置 */}
				<DockDisplayModeSection loading={loading} />

				{/* 面板开关 */}
				<PanelSwitchesSection loading={loading} />

				{/* 开发者选项（整栏可折叠） */}
				<CollapsibleSection
					title={tSettings("developerSectionTitle")}
					show={showDeveloperOptions}
					onToggle={() => setShowDeveloperOptions((prevShow) => !prevShow)}
					className="mt-4"
					contentClassName="mt-3"
				>
					<SettingsSection
						title={tSettings("developerSectionTitle")}
						description={tSettings("developerSectionDescription")}
					>
						{/* 定时任务管理（开发者选项中的第一项） */}
						<SchedulerSection loading={loading} />

						{/* Dify 配置（不再单独折叠） */}
						<div className="mt-4">
							<DifyConfigSection config={config} loading={loading} />
						</div>

						{/* 屏幕录制设置（黑名单等） */}
						<div className="mt-4">
							<RecorderConfigSection config={config} loading={loading} />
						</div>
					</SettingsSection>
				</CollapsibleSection>
			</div>
		</div>
	);
}
