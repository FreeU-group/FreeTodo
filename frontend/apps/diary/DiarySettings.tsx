"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import type { JournalRefreshMode } from "@/lib/store/journal-store";

interface DiarySettingsProps {
	refreshMode: JournalRefreshMode;
	fixedTime: string;
	workHoursStart: string;
	workHoursEnd: string;
	customTime: string;
	autoLinkEnabled: boolean;
	autoGenerateObjectiveEnabled: boolean;
	autoGenerateAiEnabled: boolean;
	onRefreshModeChange: (value: JournalRefreshMode) => void;
	onFixedTimeChange: (value: string) => void;
	onWorkHoursStartChange: (value: string) => void;
	onWorkHoursEndChange: (value: string) => void;
	onCustomTimeChange: (value: string) => void;
	onAutoLinkChange: (value: boolean) => void;
	onAutoGenerateObjectiveChange: (value: boolean) => void;
	onAutoGenerateAiChange: (value: boolean) => void;
}

export function DiarySettings({
	refreshMode,
	fixedTime,
	workHoursStart,
	workHoursEnd,
	customTime,
	autoLinkEnabled,
	autoGenerateObjectiveEnabled,
	autoGenerateAiEnabled,
	onRefreshModeChange,
	onFixedTimeChange,
	onWorkHoursStartChange,
	onWorkHoursEndChange,
	onCustomTimeChange,
	onAutoLinkChange,
	onAutoGenerateObjectiveChange,
	onAutoGenerateAiChange,
}: DiarySettingsProps) {
	const t = useTranslations("journalPanel");
	const fixedId = useId();
	const workStartId = useId();
	const workEndId = useId();
	const customId = useId();

	return (
		<div className="rounded-xl border border-border bg-muted/10 p-4">
			<div className="mb-3 text-sm font-semibold">{t("settingsTitle")}</div>
			<div className="grid gap-3">
				<div className="flex items-center gap-3">
					<span className="text-xs text-muted-foreground">
						{t("refreshModeLabel")}
					</span>
					<select
						value={refreshMode}
						onChange={(event) =>
							onRefreshModeChange(
								event.target.value as JournalRefreshMode,
							)
						}
						className="h-8 rounded-md border border-border bg-background px-2 text-xs"
					>
						<option value="fixed">{t("refreshModeFixed")}</option>
						<option value="workHours">{t("refreshModeWorkHours")}</option>
						<option value="custom">{t("refreshModeCustom")}</option>
					</select>
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					<div className="space-y-1">
						<label htmlFor={fixedId} className="text-xs text-muted-foreground">
							{t("fixedTimeLabel")}
						</label>
						<input
							id={fixedId}
							type="time"
							value={fixedTime}
							onChange={(event) => onFixedTimeChange(event.target.value)}
							className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
						/>
					</div>
					<div className="space-y-1">
						<label
							htmlFor={workStartId}
							className="text-xs text-muted-foreground"
						>
							{t("workHoursLabel")}
						</label>
						<div className="flex items-center gap-2">
							<input
								id={workStartId}
								type="time"
								value={workHoursStart}
								onChange={(event) => onWorkHoursStartChange(event.target.value)}
								className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
							/>
							<span className="text-xs text-muted-foreground">-</span>
							<input
								id={workEndId}
								type="time"
								value={workHoursEnd}
								onChange={(event) => onWorkHoursEndChange(event.target.value)}
								className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
							/>
						</div>
					</div>
					<div className="space-y-1">
						<label
							htmlFor={customId}
							className="text-xs text-muted-foreground"
						>
							{t("customTimeLabel")}
						</label>
						<input
							id={customId}
							type="time"
							value={customTime}
							onChange={(event) => onCustomTimeChange(event.target.value)}
							className="h-8 w-full rounded-md border border-border bg-background px-2 text-xs"
						/>
					</div>
				</div>
				<div className="grid gap-3 md:grid-cols-3">
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						<input
							type="checkbox"
							checked={autoLinkEnabled}
							onChange={(event) => onAutoLinkChange(event.target.checked)}
							className="h-4 w-4 rounded border border-border"
						/>
						{t("autoLinkToggle")}
					</label>
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						<input
							type="checkbox"
							checked={autoGenerateObjectiveEnabled}
							onChange={(event) =>
								onAutoGenerateObjectiveChange(event.target.checked)
							}
							className="h-4 w-4 rounded border border-border"
						/>
						{t("autoObjectiveToggle")}
					</label>
					<label className="flex items-center gap-2 text-xs text-muted-foreground">
						<input
							type="checkbox"
							checked={autoGenerateAiEnabled}
							onChange={(event) =>
								onAutoGenerateAiChange(event.target.checked)
							}
							className="h-4 w-4 rounded border border-border"
						/>
						{t("autoAiToggle")}
					</label>
				</div>
			</div>
		</div>
	);
}
