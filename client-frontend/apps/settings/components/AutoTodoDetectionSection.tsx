"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { useSaveConfig } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

interface AutoTodoDetectionSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

export function AutoTodoDetectionSection({
	config,
	loading = false,
}: AutoTodoDetectionSectionProps) {
	const tSettings = useTranslations("page.settings");
	const saveConfigMutation = useSaveConfig();

	const [enabled, setEnabled] = useState(false);
	const lastSaveTimeRef = useRef<number>(0);

	useEffect(() => {
		if (config) {
			if (Date.now() - lastSaveTimeRef.current < 500) return;
			setEnabled(
				(config.jobsAutoTodoDetectionEnabled as boolean) ?? false,
			);
		}
	}, [config]);

	const isLoading = loading || saveConfigMutation.isPending;

	const handleToggle = async (newValue: boolean) => {
		try {
			lastSaveTimeRef.current = Date.now();
			await saveConfigMutation.mutateAsync({
				data: { jobsAutoTodoDetectionEnabled: newValue },
			});
			setEnabled(newValue);
			toastSuccess(
				newValue
					? tSettings("autoTodoDetectionEnabled")
					: tSettings("autoTodoDetectionDisabled"),
			);
		} catch (error) {
			lastSaveTimeRef.current = 0;
			setEnabled(!newValue);
			const errorMsg =
				error instanceof Error ? error.message : String(error);
			toastError(tSettings("saveFailed", { error: errorMsg }));
		}
	};

	return (
		<SettingsSection
			title={tSettings("intentRecognitionTitle")}
			description={tSettings("intentRecognitionDescription")}
			searchKeywords={["intent", "todo", "detection", "意图", "识别"]}
		>
			<div className="flex items-center justify-between">
				<div className="flex-1">
					<label
						htmlFor="intent-recognition-toggle"
						className="text-sm font-medium text-foreground"
					>
						{tSettings("intentRecognitionLabel")}
					</label>
					<p className="mt-0.5 text-xs text-muted-foreground">
						{tSettings("intentRecognitionHint")}
					</p>
				</div>
				<ToggleSwitch
					id="intent-recognition-toggle"
					enabled={enabled}
					disabled={isLoading}
					onToggle={handleToggle}
					ariaLabel={tSettings("intentRecognitionLabel")}
				/>
			</div>
		</SettingsSection>
	);
}
