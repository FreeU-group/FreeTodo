"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PasswordInput } from "@/components/common/ui/PasswordInput";
import { useSaveConfig } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";

interface GeminiConfigSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

export function GeminiConfigSection({
	config,
	loading = false,
}: GeminiConfigSectionProps) {
	const t = useTranslations("page.settings");
	const saveConfigMutation = useSaveConfig();
	const [apiKey, setApiKey] = useState(
		(config?.banna2ApiKey as string) ?? "",
	);
	const isLoading = loading || saveConfigMutation.isPending;

	useEffect(() => {
		if (config?.banna2ApiKey !== undefined) {
			setApiKey((config.banna2ApiKey as string) ?? "");
		}
	}, [config]);

	const handleBlur = async () => {
		try {
			await saveConfigMutation.mutateAsync({ data: { banna2ApiKey: apiKey } });
			toastSuccess(t("saveSuccess"));
		} catch (e) {
			toastError(t("saveFailed", { error: e instanceof Error ? e.message : String(e) }));
		}
	};

	return (
		<SettingsSection
			title={t("geminiTitle")}
			description={t("geminiDescription")}
			searchKeywords={["gemini", "google", "image", "插画", "api key"]}
		>
			<div className="space-y-1.5">
				<label
					htmlFor="gemini-api-key"
					className="text-sm font-medium text-foreground"
				>
					{t("geminiApiKeyLabel")}
				</label>
				<PasswordInput
					id="gemini-api-key"
					value={apiKey}
					onChange={(e) => setApiKey(e.target.value)}
					onBlur={handleBlur}
					placeholder={t("geminiApiKeyPlaceholder")}
					disabled={isLoading}
				/>
				<p className="text-xs text-muted-foreground">
					{t("geminiApiKeyHint")}
				</p>
			</div>
		</SettingsSection>
	);
}
