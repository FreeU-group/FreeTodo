"use client";

import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useEffect, useMemo } from "react";
import { PanelHeader } from "@/components/common/layout/PanelHeader";
import {
	ALL_PANEL_FEATURES,
	type PanelFeature,
} from "@/lib/config/panel-config";
import { GlobalDndProvider } from "@/lib/dnd";
import {
	getPanelLazyComponent,
	getPanelPlugin,
} from "@/lib/plugins/registry";

function isPanelFeature(value: string | null): value is PanelFeature {
	if (!value) return false;
	return (ALL_PANEL_FEATURES as string[]).includes(value);
}

export default function PanelWindowPage() {
	const searchParams = useSearchParams();
	const t = useTranslations("page");
	const tDock = useTranslations("bottomDock");
	const featureParam = searchParams.get("feature");

	const feature = useMemo<PanelFeature | null>(
		() => (isPanelFeature(featureParam) ? featureParam : null),
		[featureParam],
	);

	const plugin = feature ? getPanelPlugin(feature) : null;
	const LazyPanel = feature ? getPanelLazyComponent(feature) : null;
	const label = plugin ? t(plugin.labelKey) : tDock("unknown");
	const placeholder = plugin ? t(plugin.placeholderKey) : tDock("unknown");
	const Icon = plugin?.icon || null;

	useEffect(() => {
		document.title = label;
	}, [label]);

	const placeholderView = (
		<div className="flex h-full flex-col rounded-(--radius) overflow-hidden">
			{Icon ? <PanelHeader icon={Icon} title={label} disableDrag /> : null}
			<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
				{placeholder}
			</div>
		</div>
	);

	return (
		<GlobalDndProvider>
			<div className="h-screen w-screen bg-background text-foreground">
				<div className="flex h-full flex-col">
					{LazyPanel ? (
						<Suspense fallback={placeholderView}>
							<LazyPanel />
						</Suspense>
					) : (
						placeholderView
					)}
				</div>
			</div>
		</GlobalDndProvider>
	);
}
