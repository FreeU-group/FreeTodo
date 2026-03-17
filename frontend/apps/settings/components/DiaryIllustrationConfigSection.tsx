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

type GenerationStatus = {
	date: string;
	exists: boolean;
	count: number;
	state: string;
	message?: string | null;
	isGenerating: boolean;
	completedPanels: number;
	totalPanels: number;
	error?: string | null;
	startedAt?: number | null;
	updatedAt?: number | null;
};

const POLL_INTERVAL_MS = 1500;

function normalizeGenerationStatus(payload: Record<string, unknown>): GenerationStatus {
	return {
		date: String(payload.date ?? ""),
		exists: Boolean(payload.exists),
		count: Number(payload.count ?? 0),
		state: String(payload.state ?? "idle"),
		message: payload.message ? String(payload.message) : null,
		isGenerating: Boolean(payload.is_generating),
		completedPanels: Number(payload.completed_panels ?? 0),
		totalPanels: Number(payload.total_panels ?? 0),
		error: payload.error ? String(payload.error) : null,
		startedAt:
			typeof payload.started_at === "number" ? payload.started_at : null,
		updatedAt:
			typeof payload.updated_at === "number" ? payload.updated_at : null,
	};
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
	const [generationStatus, setGenerationStatus] = useState<GenerationStatus | null>(null);
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
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

	useEffect(() => {
		if (!generating || !generationStatus?.date) return;

		let cancelled = false;

		const pollStatus = async () => {
			try {
				const response = await fetch(
					`/api/diary-illustration/status/${encodeURIComponent(generationStatus.date)}`,
				);
				if (!response.ok) return;
				const payload = (await response.json()) as Record<string, unknown>;
				if (cancelled) return;
				const nextStatus = normalizeGenerationStatus(payload);
				setGenerationStatus(nextStatus);

				if (!nextStatus.isGenerating) {
					setGenerating(false);
					if (nextStatus.state === "completed") {
						toastSuccess(t("generateSuccess"));
					} else if (nextStatus.error) {
						toastError(
							t("generateFailed", {
								error: nextStatus.error,
							}),
						);
					}
				}
			} catch {
				// Keep polling silently while generation is in progress.
			}
		};

		void pollStatus();
		const timer = window.setInterval(() => {
			void pollStatus();
		}, POLL_INTERVAL_MS);

		return () => {
			cancelled = true;
			window.clearInterval(timer);
		};
	}, [generationStatus?.date, generating, t]);

	useEffect(() => {
		if (!generating) {
			setElapsedSeconds(0);
			return;
		}

		const updateElapsed = () => {
			const startedAt = generationStatus?.startedAt;
			if (!startedAt) return;
			setElapsedSeconds(Math.max(0, Math.floor(Date.now() / 1000 - startedAt)));
		};

		updateElapsed();
		const timer = window.setInterval(updateElapsed, 1000);
		return () => window.clearInterval(timer);
	}, [generationStatus?.startedAt, generating]);

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
			setGenerationStatus(null);
			const response = await fetch("/api/diary-illustration/generate?async_mode=true", {
				method: "POST",
			});
			if (!response.ok) {
				const error = await response.json().catch(() => ({}));
				throw new Error(error.detail ?? `HTTP ${response.status}`);
			}
			const payload = (await response.json()) as Record<string, unknown>;
			setGenerationStatus(normalizeGenerationStatus(payload));
		} catch (error) {
			setGenerating(false);
			toastError(
				t("generateFailed", {
					error: error instanceof Error ? error.message : String(error),
				}),
			);
		}
	};

	const stageLabel = generationStatus
		? generationStatus.state === "preparing"
			? t("progressPreparing")
			: generationStatus.state === "storyboarding"
				? t("progressStoryboarding")
				: generationStatus.state === "rendering"
					? t("progressRendering")
					: generationStatus.state === "completed"
						? t("progressCompleted")
						: generationStatus.state === "failed"
							? t("progressFailed")
							: t("generating")
		: t("generating");

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

				{generating && generationStatus ? (
					<div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
						<div className="flex items-center justify-between gap-3">
							<div>
								<p className="font-medium text-foreground">{stageLabel}</p>
								<p className="mt-1 text-xs text-muted-foreground">
									{generationStatus.message ?? t("progressWaiting")}
								</p>
							</div>
							<p className="shrink-0 text-xs text-muted-foreground">
								{t("progressElapsed", { seconds: elapsedSeconds })}
							</p>
						</div>
						{generationStatus.totalPanels > 0 ? (
							<p className="mt-2 text-xs text-muted-foreground">
								{t("progressPanels", {
									completed: generationStatus.completedPanels,
									total: generationStatus.totalPanels,
								})}
							</p>
						) : null}
						<p className="mt-2 text-xs text-muted-foreground">
							{t("progressHint")}
						</p>
					</div>
				) : null}
			</div>
		</SettingsSection>
	);
}
