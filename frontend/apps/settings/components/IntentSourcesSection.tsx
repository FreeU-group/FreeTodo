"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useSaveConfig } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

interface IntentSourcesSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

interface SourceToggle {
	key: string;
	labelKey: string;
	descKey: string;
}

const SOURCE_TOGGLES: SourceToggle[] = [
	{
		key: "intentSourceMicPc",
		labelKey: "intentSourceMicPcLabel",
		descKey: "intentSourceMicPcDesc",
	},
	{
		key: "intentSourceMicHardware",
		labelKey: "intentSourceMicHardwareLabel",
		descKey: "intentSourceMicHardwareDesc",
	},
	{
		key: "intentSourceSpeakerPc",
		labelKey: "intentSourceSpeakerPcLabel",
		descKey: "intentSourceSpeakerPcDesc",
	},
	{
		key: "intentSourceOcrScreen",
		labelKey: "intentSourceOcrScreenLabel",
		descKey: "intentSourceOcrScreenDesc",
	},
	{
		key: "intentSourceOcrProactive",
		labelKey: "intentSourceOcrProactiveLabel",
		descKey: "intentSourceOcrProactiveDesc",
	},
];

export function IntentSourcesSection({
	config,
	loading = false,
}: IntentSourcesSectionProps) {
	const tSettings = useTranslations("page.settings");
	const saveConfigMutation = useSaveConfig();
	const lastSaveTimeRef = useRef<number>(0);

	const [sources, setSources] = useState<Record<string, boolean>>(() => {
		const init: Record<string, boolean> = {};
		for (const s of SOURCE_TOGGLES) {
			init[s.key] = true;
		}
		return init;
	});

	useEffect(() => {
		if (!config) return;
		if (Date.now() - lastSaveTimeRef.current < 500) return;
		const next: Record<string, boolean> = {};
		for (const s of SOURCE_TOGGLES) {
			next[s.key] = (config[s.key] as boolean | undefined) ?? true;
		}
		setSources(next);
	}, [config]);

	const isLoading = loading || saveConfigMutation.isPending;

	const handleToggle = async (key: string, newValue: boolean) => {
		const oldValue = sources[key];
		setSources((prev) => ({ ...prev, [key]: newValue }));
		try {
			lastSaveTimeRef.current = Date.now();
			await saveConfigMutation.mutateAsync({ data: { [key]: newValue } });
			toastSuccess(tSettings("saveSuccess"));
		} catch (error) {
			lastSaveTimeRef.current = 0;
			setSources((prev) => ({ ...prev, [key]: oldValue }));
			const errorMsg =
				error instanceof Error ? error.message : String(error);
			toastError(tSettings("saveFailed", { error: errorMsg }));
		}
	};

	return (
		<SettingsSection
			title={tSettings("intentSourcesTitle")}
			description={tSettings("intentSourcesDescription")}
			searchKeywords={[
				"source",
				"mic",
				"ocr",
				"audio",
				"数据源",
				"麦克风",
			]}
		>
			<div className="space-y-3">
				{SOURCE_TOGGLES.map((source) => (
					<div
						key={source.key}
						className="flex items-center justify-between"
					>
						<div className="flex-1">
							<label
								htmlFor={`intent-source-${source.key}`}
								className="text-sm font-medium text-foreground"
							>
								{tSettings(
									source.labelKey as Parameters<
										typeof tSettings
									>[0],
								)}
							</label>
							<p className="mt-0.5 text-xs text-muted-foreground">
								{tSettings(
									source.descKey as Parameters<
										typeof tSettings
									>[0],
								)}
							</p>
						</div>
						<ToggleSwitch
							id={`intent-source-${source.key}`}
							enabled={sources[source.key]}
							disabled={isLoading}
							onToggle={(v) => handleToggle(source.key, v)}
						/>
					</div>
				))}
			</div>
		</SettingsSection>
	);
}
