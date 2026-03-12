"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useSaveConfig } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

interface AudioConfigSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

/**
 * 音频录制配置区块组件
 * 配置自动启动录音开关
 */
export function AudioConfigSection({
	config,
	loading = false,
}: AudioConfigSectionProps) {
	const t = useTranslations("page.settings");
	const saveConfigMutation = useSaveConfig();

	const [is24x7Enabled, setIs24x7Enabled] = useState<boolean>(
		(config?.audioIs24x7 as boolean | undefined) ?? false,
	);

	const isLoading = loading || saveConfigMutation.isPending;

	// 当配置加载完成后，同步本地状态
	useEffect(() => {
		if (config && config.audioIs24x7 !== undefined) {
			setIs24x7Enabled((config.audioIs24x7 as boolean) ?? false);
		}
	}, [config]);

	const handleToggle24x7 = async (newValue: boolean) => {
		setIs24x7Enabled(newValue);
		try {
			await saveConfigMutation.mutateAsync({
				data: {
					audioIs24x7: newValue,
				},
			});
			toastSuccess(t("saveSuccess"));
		} catch (error) {
			setIs24x7Enabled(!newValue);
			console.error("保存自动启动录音配置失败:", error);
			const errorMsg = error instanceof Error ? error.message : String(error);
			toastError(t("saveFailed", { error: errorMsg }));
		}
	};

	return (
		<SettingsSection title={t("audioSettings")}>
			<div className="space-y-4">
				{/* 自动启动录音开关 */}
				<div className="flex items-center justify-between">
					<div className="flex-1">
						<p className="text-sm font-medium text-foreground">
							{t("enable24x7Recording")}
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{t("enable24x7RecordingDesc")}
						</p>
					</div>
					<ToggleSwitch
						enabled={is24x7Enabled}
						disabled={isLoading}
						onToggle={handleToggle24x7}
					/>
				</div>
			</div>
		</SettingsSection>
	);
}
