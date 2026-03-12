"use client";

import { useTranslations } from "next-intl";
import { Suspense, useEffect, useState } from "react";
import {
	PanelHeader,
	PanelPositionProvider,
} from "@/components/common/layout/PanelHeader";
import type { PanelPosition } from "@/lib/config/panel-config";
import {
	getPanelLazyComponent,
	getPanelPlugin,
} from "@/lib/plugins/registry";
import { useUiStore } from "@/lib/store/ui-store";

interface PanelContentProps {
	position: PanelPosition;
}

export function PanelContent({ position }: PanelContentProps) {
	const { getFeatureByPosition, panelFeatureMap, backendDisabledFeatures } =
		useUiStore();
	const t = useTranslations("page");
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	// 在 SSR 时使用 null，避免 hydration 错误
	const feature = mounted ? getFeatureByPosition(position) : null;
	const assignedFeature = mounted ? panelFeatureMap[position] : null;
	const backendDisabled =
		assignedFeature !== null &&
		backendDisabledFeatures.includes(assignedFeature);
	const plugin = assignedFeature ? getPanelPlugin(assignedFeature) : null;
	const LazyPanel = feature ? getPanelLazyComponent(feature) : null;
	const label = mounted && plugin ? t(plugin.labelKey) : "";
	const placeholder = mounted && plugin ? t(plugin.placeholderKey) : "";
	const Icon = plugin?.icon ?? null;
	const unavailableBadge = backendDisabled ? (
		<span
			className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700"
			title={t("backendUnavailableTooltip")}
		>
			{t("backendUnavailableBadge")}
		</span>
	) : null;

	const placeholderView = (
		<div className="flex h-full flex-col rounded-(--radius) overflow-hidden">
			{Icon && (
				<PanelHeader icon={Icon} title={label} actions={unavailableBadge} />
			)}
			<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
				{backendDisabled ? (
					<div className="flex flex-col items-center gap-1 px-4 text-center">
						<span className="font-medium">
							{t("backendUnavailableTitle")}
						</span>
						<span className="text-xs text-muted-foreground">
							{t("backendUnavailableDescription")}
						</span>
					</div>
				) : (
					placeholder
				)}
			</div>
		</div>
	);

	if (LazyPanel) {
		return (
			<PanelPositionProvider position={position}>
				<Suspense fallback={placeholderView}>
					<LazyPanel />
				</Suspense>
			</PanelPositionProvider>
		);
	}

	return <PanelPositionProvider position={position}>{placeholderView}</PanelPositionProvider>;
}
