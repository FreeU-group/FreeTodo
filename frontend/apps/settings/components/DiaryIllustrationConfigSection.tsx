"use client";

import { ImageIcon, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useSaveConfig } from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

interface DiaryIllustrationConfigSectionProps {
	config: Record<string, unknown> | undefined;
	loading?: boolean;
}

export function DiaryIllustrationConfigSection({
	config,
	loading = false,
}: DiaryIllustrationConfigSectionProps) {
	const t = useTranslations("diaryIllustration");
	const refImageInputId = "diary-illustration-ref-image";
	const cronInputId = "diary-illustration-cron";
	const saveConfigMutation = useSaveConfig();
	const [refImagePath, setRefImagePath] = useState(
		(config?.banna2RefImagePath as string) ?? "",
	);
	const [enabled, setEnabled] = useState(
		(config?.jobsDiaryIllustrationEnabled as boolean) ?? false,
	);
	const [provider, setProvider] = useState(
		(config?.jobsDiaryIllustrationProvider as string) ?? "volcengine",
	);
	const [cron, setCron] = useState(
		(config?.jobsDiaryIllustrationCron as string) ?? "0 22 * * *",
	);
	const [generating, setGenerating] = useState(false);
	const isLoading = loading || saveConfigMutation.isPending;

	useEffect(() => {
		if (!config) return;
		if (config.banna2RefImagePath !== undefined) {
			setRefImagePath((config.banna2RefImagePath as string) ?? "");
		}
		if (config.jobsDiaryIllustrationEnabled !== undefined) {
			setEnabled(Boolean(config.jobsDiaryIllustrationEnabled));
		}
		if (config.jobsDiaryIllustrationProvider !== undefined) {
			setProvider((config.jobsDiaryIllustrationProvider as string) ?? "volcengine");
		}
		if (config.jobsDiaryIllustrationCron !== undefined) {
			setCron((config.jobsDiaryIllustrationCron as string) ?? "0 22 * * *");
		}
	}, [config]);

	const handleSave = async (patch: Record<string, unknown>) => {
		try {
			await saveConfigMutation.mutateAsync({ data: patch });
			toastSuccess(t("saved"));
		} catch (error) {
			toastError(
				t("saveFailed", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	};

	const handleGenerateNow = async () => {
		try {
			setGenerating(true);
			const response = await fetch("/api/diary-illustration/generate", {
				method: "POST",
			});
			if (!response.ok) {
				const error = await response.json().catch(() => ({}));
				throw new Error(error.detail ?? `HTTP ${response.status}`);
			}
			toastSuccess(t("generateSuccess"));
		} catch (error) {
			toastError(
				t("generateFailed", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		} finally {
			setGenerating(false);
		}
	};

	return (
		<SettingsSection
			title={t("title")}
			description={t("description")}
			searchKeywords={["diary", "illustration", "comic", "volcengine", "gemini"]}
		>
			<div className="space-y-5">
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-medium text-foreground">
							{t("enableLabel")}
						</p>
						<p className="mt-0.5 text-xs text-muted-foreground">
							{t("enableHint")}
						</p>
					</div>
					<ToggleSwitch
						enabled={enabled}
						disabled={isLoading}
						onToggle={(value) => {
							setEnabled(value);
							void handleSave({ jobsDiaryIllustrationEnabled: value });
						}}
					/>
				</div>

				<div className="space-y-1.5">
					<label
						htmlFor="diary-illustration-provider"
						className="text-sm font-medium text-foreground"
					>
						{t("providerLabel")}
					</label>
					<select
						id="diary-illustration-provider"
						value={provider}
						onChange={(event) => {
							const nextProvider = event.target.value;
							setProvider(nextProvider);
							void handleSave({ jobsDiaryIllustrationProvider: nextProvider });
						}}
						disabled={isLoading}
						className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
					>
						<option value="volcengine">{t("providerVolcengine")}</option>
						<option value="gemini">{t("providerGemini")}</option>
					</select>
					<p className="text-xs text-muted-foreground">{t("providerHint")}</p>
				</div>

				<div className="space-y-1.5">
					<label
						htmlFor={refImageInputId}
						className="flex items-center gap-2 text-sm font-medium text-foreground"
					>
						<ImageIcon className="h-3.5 w-3.5" />
						{t("refImageLabel")}
					</label>
					<input
						id={refImageInputId}
						type="text"
						value={refImagePath}
						onChange={(event) => setRefImagePath(event.target.value)}
						onBlur={() =>
							void handleSave({ banna2RefImagePath: refImagePath.trim() })
						}
						placeholder={t("refImagePlaceholder")}
						disabled={isLoading}
						className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
					/>
					<p className="text-xs text-muted-foreground">
						{provider === "gemini" ? t("refImageGeminiHint") : t("refImageHint")}
					</p>
				</div>

				<div className="space-y-1.5">
					<label
						htmlFor={cronInputId}
						className="text-sm font-medium text-foreground"
					>
						{t("cronLabel")}
					</label>
					<input
						id={cronInputId}
						type="text"
						value={cron}
						onChange={(event) => setCron(event.target.value)}
						onBlur={() =>
							void handleSave({
								jobsDiaryIllustrationCron: cron.trim() || "0 22 * * *",
							})
						}
						placeholder="0 22 * * *"
						disabled={isLoading}
						className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
					/>
					<p className="text-xs text-muted-foreground">{t("cronHint")}</p>
				</div>

				<button
					type="button"
					onClick={handleGenerateNow}
					disabled={generating || isLoading}
					className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
				>
					{generating ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Sparkles className="h-4 w-4" />
					)}
					{generating ? t("generating") : t("generateNow")}
				</button>
			</div>
		</SettingsSection>
	);
}
