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
	const saveConfigMutation = useSaveConfig();

	const [refImagePath, setRefImagePath] = useState(
		(config?.banna2RefImagePath as string) ?? "",
	);
	const [enabled, setEnabled] = useState(
		(config?.jobsDiaryIllustrationEnabled as boolean) ?? false,
	);
	const [cron, setCron] = useState(
		(config?.jobsDiaryIllustrationCron as string) ?? "0 22 * * *",
	);
	const [generating, setGenerating] = useState(false);

	const isLoading = loading || saveConfigMutation.isPending;

	useEffect(() => {
		if (!config) return;
		if (config.banna2RefImagePath !== undefined)
			setRefImagePath(config.banna2RefImagePath as string);
		if (config.jobsDiaryIllustrationEnabled !== undefined)
			setEnabled(config.jobsDiaryIllustrationEnabled as boolean);
		if (config.jobsDiaryIllustrationCron !== undefined)
			setCron(config.jobsDiaryIllustrationCron as string);
	}, [config]);

	const handleSave = async (patch: Record<string, unknown>) => {
		try {
			await saveConfigMutation.mutateAsync({ data: patch });
			toastSuccess(t("saved"));
		} catch (e) {
			toastError(t("saveFailed", { error: e instanceof Error ? e.message : String(e) }));
		}
	};

	const handleGenerateNow = async () => {
		try {
			setGenerating(true);
			const resp = await fetch("/api/diary-illustration/generate", {
				method: "POST",
			});
			if (!resp.ok) {
				const err = await resp.json().catch(() => ({}));
				throw new Error(err.detail ?? `HTTP ${resp.status}`);
			}
			toastSuccess(t("generateSuccess"));
		} catch (e) {
			toastError(t("generateFailed", { error: e instanceof Error ? e.message : String(e) }));
		} finally {
			setGenerating(false);
		}
	};

	return (
		<SettingsSection
			title={t("title")}
			description={t("description")}
			searchKeywords={["diary", "illustration", "banna2", "插画", "漫画"]}
		>
			<div className="space-y-5">
				{/* Enable toggle */}
				<div className="flex items-center justify-between">
					<div>
						<p className="text-sm font-medium text-foreground">{t("enableLabel")}</p>
						<p className="mt-0.5 text-xs text-muted-foreground">{t("enableHint")}</p>
					</div>
					<ToggleSwitch
						enabled={enabled}
						disabled={isLoading}
						onToggle={(v) => {
							setEnabled(v);
							void handleSave({ jobsDiaryIllustrationEnabled: v });
						}}
					/>
				</div>

				{/* Reference image path */}
				<div className="space-y-1.5">
					<label className="flex items-center gap-2 text-sm font-medium text-foreground">
						<ImageIcon className="h-3.5 w-3.5" />
						{t("refImageLabel")}
						<input
							type="text"
							value={refImagePath}
							onChange={(e) => setRefImagePath(e.target.value)}
							onBlur={() => void handleSave({ banna2RefImagePath: refImagePath })}
							placeholder={t("refImagePlaceholder")}
							disabled={isLoading}
							className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
						/>
					</label>
					<p className="text-xs text-muted-foreground">{t("refImageHint")}</p>
				</div>

				{/* Cron expression */}
				<div className="space-y-1.5">
					<label className="text-sm font-medium text-foreground">
						{t("cronLabel")}
						<input
							type="text"
							value={cron}
							onChange={(e) => setCron(e.target.value)}
							onBlur={() => void handleSave({ jobsDiaryIllustrationCron: cron })}
							placeholder="0 22 * * *"
							disabled={isLoading}
						className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
						/>
					</label>
					<p className="text-xs text-muted-foreground">{t("cronHint")}</p>
				</div>

				{/* Manual trigger */}
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
