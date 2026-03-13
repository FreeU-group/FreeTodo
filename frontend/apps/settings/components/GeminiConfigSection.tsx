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
	const [apiKey, setApiKey] = useState((config?.banna2ApiKey as string) ?? "");
	const [saved, setSaved] = useState(false);
	const isLoading = loading || saveConfigMutation.isPending;

	useEffect(() => {
		if (config?.banna2ApiKey !== undefined) {
			setApiKey((config.banna2ApiKey as string) ?? "");
		}
	}, [config]);

	const handleSave = async () => {
		if (!apiKey.trim()) return;
		try {
			await saveConfigMutation.mutateAsync({
				data: { banna2ApiKey: apiKey.trim() },
			});
			toastSuccess(t("saveSuccess"));
			setSaved(true);
			window.setTimeout(() => setSaved(false), 2000);
		} catch (error) {
			toastError(
				t("saveFailed", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	};

	return (
		<SettingsSection
			title={t("geminiTitle")}
			description={t("geminiDescription")}
			searchKeywords={["gemini", "google", "image", "illustration", "api key"]}
		>
			<div className="space-y-3">
				<div className="space-y-1.5">
					<label
						htmlFor="gemini-api-key"
						className="text-sm font-medium text-foreground"
					>
						{t("geminiApiKeyLabel")}
					</label>
					<div className="flex gap-2">
						<div className="flex-1">
							<PasswordInput
								id="gemini-api-key"
								value={apiKey}
								onChange={(event) => {
									setApiKey(event.target.value);
									setSaved(false);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter") void handleSave();
								}}
								placeholder={t("geminiApiKeyPlaceholder")}
								disabled={isLoading}
							/>
						</div>
						<button
							type="button"
							onClick={handleSave}
							disabled={isLoading || !apiKey.trim()}
							className="shrink-0 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
						>
							{saved ? "OK" : t("save")}
						</button>
					</div>
					<p className="text-xs text-muted-foreground">
						{t("geminiApiKeyHint")}
					</p>
				</div>
			</div>
		</SettingsSection>
	);
}
