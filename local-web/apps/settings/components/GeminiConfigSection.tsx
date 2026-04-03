"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { PasswordInput } from "@/components/common/ui/PasswordInput";
import { customFetcher } from "@/lib/api/fetcher";
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
	const [refImagePath, setRefImagePath] = useState(
		(config?.banna2RefImagePath as string) ?? "",
	);
	const [saved, setSaved] = useState(false);
	const isLoading = loading || saveConfigMutation.isPending;

	useEffect(() => {
		if (config?.banna2ApiKey !== undefined) {
			setApiKey((config.banna2ApiKey as string) ?? "");
		}
		if (config?.banna2RefImagePath !== undefined) {
			setRefImagePath((config.banna2RefImagePath as string) ?? "");
		}
	}, [config]);

	const handleSave = async () => {
		if (!apiKey.trim()) return;
		try {
			const testResult = (await customFetcher("/api/test-diary-illustration-provider", {
				method: "POST",
				data: {
					provider: "gemini",
					banna2ApiKey: apiKey.trim(),
					banna2RefImagePath: refImagePath.trim(),
				},
			})) as { success?: boolean; error?: string };

			if (!testResult.success) {
				throw new Error(testResult.error || "Gemini API test failed");
			}

			await saveConfigMutation.mutateAsync({
				data: {
					banna2ApiKey: apiKey.trim(),
					banna2RefImagePath: refImagePath.trim(),
				},
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
				<div className="space-y-1.5">
					<label
						htmlFor="gemini-ref-image-path"
						className="text-sm font-medium text-foreground"
					>
						{t("geminiRefImagePathLabel")}
					</label>
					<input
						id="gemini-ref-image-path"
						type="text"
						value={refImagePath}
						onChange={(event) => {
							setRefImagePath(event.target.value);
							setSaved(false);
						}}
						placeholder={t("geminiRefImagePathPlaceholder")}
						disabled={isLoading}
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
					/>
					<p className="text-xs text-muted-foreground">
						{t("geminiRefImagePathHint")}
					</p>
				</div>
			</div>
		</SettingsSection>
	);
}
