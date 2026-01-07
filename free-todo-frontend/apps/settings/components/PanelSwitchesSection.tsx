"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { CollapsibleSection } from "@/components/common/layout/CollapsibleSection";
import {
	ALL_PANEL_FEATURES,
	DEV_IN_PROGRESS_FEATURES,
	FEATURE_ICON_MAP,
	IS_DEV_FEATURE_ENABLED,
	type PanelFeature,
} from "@/lib/config/panel-config";
import { useUiStore } from "@/lib/store/ui-store";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

interface PanelSwitchesSectionProps {
	loading?: boolean;
}

/**
 * 面板开关设置区块组件
 */
export function PanelSwitchesSection({
	loading = false,
}: PanelSwitchesSectionProps) {
	const tSettings = useTranslations("page.settings");
	const tBottomDock = useTranslations("bottomDock");
	const setFeatureEnabled = useUiStore((state) => state.setFeatureEnabled);
	const isFeatureEnabled = useUiStore((state) => state.isFeatureEnabled);
	const [showDevPanels, setShowDevPanels] = useState(false);

	// 获取所有可用的面板（排除 settings）
	const availablePanels = ALL_PANEL_FEATURES.filter(
		(feature) => feature !== "settings",
	);

	// 开发中的面板 & 常规面板分组
	const devPanels = availablePanels.filter((feature) =>
		DEV_IN_PROGRESS_FEATURES.includes(feature),
	);
	const regularPanels = availablePanels.filter(
		(feature) => !DEV_IN_PROGRESS_FEATURES.includes(feature),
	);

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

	return (
		<SettingsSection
			title={tSettings("panelSwitchesTitle")}
			description={tSettings("panelSwitchesDescription")}
		>
			<div className="space-y-3">
				{regularPanels.map((feature) => {
					// 跳过开发模式下的功能（如果不是开发模式）
					if (feature === "debugShots" && !IS_DEV_FEATURE_ENABLED) {
						return null;
					}

					const enabled = isFeatureEnabled(feature);
					const panelLabel = tBottomDock(feature) || feature;
					const Icon = FEATURE_ICON_MAP[feature];

					return (
						<div key={feature} className="flex items-center justify-between">
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

				{/* 开发中的面板（折叠分组，位于面板开关内部底部） */}
				{devPanels.length > 0 && (
					<CollapsibleSection
						title={tSettings("devPanelsTitle")}
						show={showDevPanels}
						onToggle={() => setShowDevPanels((prev) => !prev)}
						className="mt-4"
						contentClassName="mt-3"
					>
						<SettingsSection
							title={tSettings("devPanelsTitle")}
							description={tSettings("devPanelsDescription")}
						>
							<div className="space-y-3">
								{devPanels.map((feature) => {
									// 开发中的截图调试面板仅在开发模式下展示
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
					</CollapsibleSection>
				)}
			</div>
		</SettingsSection>
	);
}
