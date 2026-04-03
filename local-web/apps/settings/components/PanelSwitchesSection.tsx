"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { CollapsibleSection } from "@/components/common/layout/CollapsibleSection";
import {
	ALL_PANEL_FEATURES,
	DEV_IN_PROGRESS_FEATURES,
	EXTENSION_PANEL_FEATURES,
	FEATURE_ICON_MAP,
	type PanelFeature,
} from "@/lib/config/panel-config";
import { useUiStore } from "@/lib/store/ui-store";
import { toastError, toastSuccess } from "@/lib/toast";
import {
	doesSearchMatch,
	SettingsSearchHighlight,
	SettingsSection,
	useSettingsSearchQuery,
} from "./SettingsSection";
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
	const backendDisabledFeatures = useUiStore(
		(state) => state.backendDisabledFeatures,
	);
	const [showExtensionPanels, setShowExtensionPanels] = useState(false);
	const [showDevPanels, setShowDevPanels] = useState(false);
	const searchQuery = useSettingsSearchQuery();

	// 获取所有可用的面板（排除 settings）
	const availablePanels = ALL_PANEL_FEATURES.filter(
		(feature) => feature !== "settings",
	);

	// 面板分组
	const extensionPanels = availablePanels.filter((feature) =>
		EXTENSION_PANEL_FEATURES.includes(feature),
	);
	const devPanels = availablePanels.filter((feature) =>
		DEV_IN_PROGRESS_FEATURES.includes(feature),
	);
	const regularPanels = availablePanels.filter(
		(feature) =>
			!DEV_IN_PROGRESS_FEATURES.includes(feature) &&
			!EXTENSION_PANEL_FEATURES.includes(feature),
	);
	const panelKeywords = [...regularPanels, ...extensionPanels, ...devPanels].map(
		(feature) => tBottomDock(feature) || feature,
	);

	const extensionPanelKeywords = useMemo(
		() =>
			extensionPanels
				.map((feature) => tBottomDock(feature) || feature)
				.filter(Boolean),
		[extensionPanels, tBottomDock],
	);

	const devPanelKeywords = useMemo(
		() =>
			devPanels.map((feature) => tBottomDock(feature) || feature).filter(Boolean),
		[devPanels, tBottomDock],
	);

	const shouldAutoExpandExtensionPanels = useMemo(() => {
		if (!extensionPanels.length) return false;
		const hasSearchQuery = searchQuery.trim().length > 0;
		if (!hasSearchQuery) return false;
		return doesSearchMatch(searchQuery, [
			tSettings("extensionPanelsTitle"),
			...extensionPanelKeywords,
		]);
	}, [extensionPanels.length, searchQuery, tSettings, extensionPanelKeywords]);

	const shouldAutoExpandDevPanels = useMemo(() => {
		if (!devPanels.length) return false;
		const hasSearchQuery = searchQuery.trim().length > 0;
		if (!hasSearchQuery) return false;
		return doesSearchMatch(searchQuery, [
			tSettings("devPanelsTitle"),
			...devPanelKeywords,
		]);
	}, [devPanels.length, searchQuery, tSettings, devPanelKeywords]);

	useEffect(() => {
		if (shouldAutoExpandExtensionPanels) {
			setShowExtensionPanels(true);
		}
	}, [shouldAutoExpandExtensionPanels]);

	useEffect(() => {
		if (shouldAutoExpandDevPanels) {
			setShowDevPanels(true);
		}
	}, [shouldAutoExpandDevPanels]);

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

	const renderPanelToggle = (feature: PanelFeature) => {
		const enabled = isFeatureEnabled(feature);
		const backendDisabled = backendDisabledFeatures.includes(feature);
		const panelLabel = tBottomDock(feature) || feature;
		const Icon = FEATURE_ICON_MAP[feature];

		return (
			<div key={feature} className="flex items-center justify-between">
				<div className="flex-1 flex items-center gap-2">
					{Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
					<label
						htmlFor={`panel-toggle-${feature}`}
						className="text-sm font-medium text-foreground cursor-pointer"
					>
						<SettingsSearchHighlight text={panelLabel} />
					</label>
				</div>
				<ToggleSwitch
					id={`panel-toggle-${feature}`}
					enabled={enabled}
					disabled={loading || backendDisabled}
					onToggle={(newEnabled) => handleTogglePanel(feature, newEnabled)}
					ariaLabel={panelLabel}
				/>
			</div>
		);
	};

	return (
		<SettingsSection
			title={tSettings("panelSwitchesTitle")}
			description={tSettings("panelSwitchesDescription")}
			searchKeywords={panelKeywords}
		>
			<div className="space-y-3">
				{regularPanels.map(renderPanelToggle)}

				{extensionPanels.length > 0 && (
					<CollapsibleSection
						title={tSettings("extensionPanelsTitle")}
						show={showExtensionPanels}
						onToggle={() => setShowExtensionPanels((prev) => !prev)}
						className="mt-4"
						contentClassName="mt-3"
					>
						<SettingsSection
							title={tSettings("extensionPanelsTitle")}
							description={tSettings("extensionPanelsDescription")}
							searchKeywords={extensionPanelKeywords}
						>
							<div className="space-y-3">
								{extensionPanels.map(renderPanelToggle)}
							</div>
						</SettingsSection>
					</CollapsibleSection>
				)}

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
							searchKeywords={devPanelKeywords}
						>
							<div className="space-y-3">
								{devPanels.map(renderPanelToggle)}
							</div>
						</SettingsSection>
					</CollapsibleSection>
				)}
			</div>
		</SettingsSection>
	);
}
