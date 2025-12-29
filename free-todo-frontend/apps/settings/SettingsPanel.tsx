"use client";

import { Settings } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import {
	ALL_PANEL_FEATURES,
	FEATURE_ICON_MAP,
	IS_DEV_FEATURE_ENABLED,
	type PanelFeature,
} from "@/lib/config/panel-config";
import { useConfig, useSaveConfig } from "@/lib/query";
import { useNotificationStore } from "@/lib/store/notification-store";
import { useUiStore } from "@/lib/store/ui-store";
import { toastError, toastSuccess } from "@/lib/toast";
import {
	DifyConfigSection,
	LlmConfigSection,
	RecorderConfigSection,
	SchedulerSection,
	SettingsSection,
	ToggleSwitch,
} from "./components";

/**
 * 设置面板组件
 * 用于配置系统各项功能
 */
export function SettingsPanel() {
	const tPage = useTranslations("page");
	const tSettings = useTranslations("page.settings");
	const tBottomDock = useTranslations("bottomDock");

	// 使用 TanStack Query 获取配置
	const { data: config, isLoading: configLoading } = useConfig();

	// 使用 TanStack Query 保存配置
	const saveConfigMutation = useSaveConfig();

	// 状态管理
	const [autoTodoDetectionEnabled, setAutoTodoDetectionEnabled] =
		useState(false);
	const setFeatureEnabled = useUiStore((state) => state.setFeatureEnabled);
	const isFeatureEnabled = useUiStore((state) => state.isFeatureEnabled);

	// 用于跟踪最后一次保存的时间戳，防止保存后立即被 refetch 覆盖
	const lastSaveTimeRef = useRef<number>(0);

	// 当配置加载完成后，同步本地状态
	// 但如果刚刚保存过配置（500ms 内），则跳过同步，避免被旧值覆盖
	useEffect(() => {
		if (config) {
			const now = Date.now();
			// 如果刚刚保存过配置（500ms 内），跳过同步
			if (now - lastSaveTimeRef.current < 500) {
				return;
			}
			setAutoTodoDetectionEnabled(
				(config.jobsAutoTodoDetectionEnabled as boolean) ?? false,
			);
		}
	}, [config]);

	const loading = configLoading || saveConfigMutation.isPending;

	// 自动待办检测处理
	const handleToggleAutoTodoDetection = async (enabled: boolean) => {
		try {
			// 记录保存时间戳
			lastSaveTimeRef.current = Date.now();

			await saveConfigMutation.mutateAsync({
				data: {
					jobsAutoTodoDetectionEnabled: enabled,
				},
			});
			setAutoTodoDetectionEnabled(enabled);

			// 同步更新轮询端点状态
			const store = useNotificationStore.getState();
			const existingEndpoint = store.getEndpoint("draft-todos");
			if (existingEndpoint) {
				store.registerEndpoint({
					...existingEndpoint,
					enabled: enabled,
				});
			}

			toastSuccess(
				enabled
					? tSettings("autoTodoDetectionEnabled")
					: tSettings("autoTodoDetectionDisabled"),
			);
		} catch (error) {
			console.error("保存配置失败:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(tSettings("saveFailed", { error: errorMsg }));
			// 失败时清除保存时间戳，允许后续同步
			lastSaveTimeRef.current = 0;
			setAutoTodoDetectionEnabled(!enabled);
		}
	};

	// 面板开关处理
	const handleTogglePanel = async (feature: PanelFeature, enabled: boolean) => {
		try {
			setFeatureEnabled(feature, enabled);

			toastSuccess(
				enabled
					? `${tBottomDock(feature)} ${tSettings("panelEnabled")}`
					: `${tBottomDock(feature)} ${tSettings("panelDisabled")}`,
			);
		} catch (error) {
			console.error("切换面板失败:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(tSettings("saveFailed", { error: errorMsg }));
			// 回滚状态
			setFeatureEnabled(feature, !enabled);
		}
	};

	// 获取所有可用的面板（排除 settings）
	const availablePanels = ALL_PANEL_FEATURES.filter(
		(feature) => feature !== "settings",
	);

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-background">
			{/* 顶部标题栏 */}
			<PanelHeader icon={Settings} title={tPage("settingsLabel")} />

			{/* 设置内容区域 */}
			<div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
				{/* LLM 配置 */}
				<LlmConfigSection config={config} loading={loading} />

				{/* Dify 配置 */}
				<DifyConfigSection config={config} loading={loading} />

				{/* 基础设置（录制配置） */}
				<RecorderConfigSection config={config} loading={loading} />

				{/* 自动待办检测设置 */}
				<SettingsSection
					title={tSettings("autoTodoDetectionTitle")}
					description={tSettings("autoTodoDetectionDescription")}
				>
					<div className="flex items-center justify-between">
						<div className="flex-1">
							<label
								htmlFor="auto-todo-detection-toggle"
								className="text-sm font-medium text-foreground"
							>
								{tSettings("autoTodoDetectionLabel")}
							</label>
						</div>
						<ToggleSwitch
							id="auto-todo-detection-toggle"
							enabled={autoTodoDetectionEnabled}
							disabled={loading}
							onToggle={handleToggleAutoTodoDetection}
							ariaLabel={tSettings("autoTodoDetectionLabel")}
						/>
					</div>
					{autoTodoDetectionEnabled && (
						<div className="mt-3 rounded-md bg-primary/10 p-3">
							<p className="text-xs text-primary">
								{tSettings("autoTodoDetectionHint")}
							</p>
						</div>
					)}
				</SettingsSection>

				{/* 面板开关 */}
				<SettingsSection
					title={tSettings("panelSwitchesTitle")}
					description={tSettings("panelSwitchesDescription")}
				>
					<div className="space-y-3">
						{availablePanels.map((feature) => {
							// 跳过开发模式下的功能（如果不是开发模式）
							if (feature === "debugShots" && !IS_DEV_FEATURE_ENABLED) {
								return null;
							}

							const enabled = isFeatureEnabled(feature);
							const panelLabel = tBottomDock(feature) || feature;
							const Icon = FEATURE_ICON_MAP[feature];

							return (
								<div
									key={feature}
									className="flex items-center justify-between"
								>
									<div className="flex-1 flex items-center gap-2">
										{Icon && (
											<Icon className="h-4 w-4 text-muted-foreground shrink-0" />
										)}
										<label
											htmlFor={`panel-toggle-${feature}`}
											className="text-sm font-medium text-foreground cursor-pointer"
										>
											{panelLabel}
										</label>
									</div>
									<ToggleSwitch
										id={`panel-toggle-${feature}`}
										enabled={enabled}
										disabled={loading}
										onToggle={(newEnabled) =>
											handleTogglePanel(feature, newEnabled)
										}
										ariaLabel={panelLabel}
									/>
								</div>
							);
						})}
					</div>
				</SettingsSection>

				{/* 定时任务管理 */}
				<SchedulerSection loading={loading} />
			</div>
		</div>
	);
}
