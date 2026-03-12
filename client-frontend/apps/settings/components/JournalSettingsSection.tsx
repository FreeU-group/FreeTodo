"use client";

import { useTranslations } from "next-intl";
import { useId } from "react";
import { useJournalStore } from "@/lib/store/journal-store";
import { SettingsSection } from "./SettingsSection";
import { ToggleSwitch } from "./ToggleSwitch";

export function JournalSettingsSection() {
	const tSettings = useTranslations("page.settings");
	const {
		refreshMode,
		fixedTime,
		workHoursStart,
		workHoursEnd,
		customTime,
		autoLinkEnabled,
		autoGenerateObjectiveEnabled,
		autoGenerateAiEnabled,
		setRefreshMode,
		setFixedTime,
		setWorkHoursStart,
		setWorkHoursEnd,
		setCustomTime,
		setAutoLinkEnabled,
		setAutoGenerateObjectiveEnabled,
		setAutoGenerateAiEnabled,
	} = useJournalStore();

	const fixedId = useId();
	const workStartId = useId();
	const workEndId = useId();
	const customId = useId();
	const refreshModeId = useId();
	const autoLinkId = useId();
	const autoObjectiveId = useId();
	const autoAiId = useId();

	return (
		<SettingsSection
			title={tSettings("journalSettingsTitle")}
			description={tSettings("journalSettingsDescription")}
			searchKeywords={[
				tSettings("journalRefreshModeLabel"),
				tSettings("journalAutoLinkLabel"),
			]}
		>
			<div className="space-y-4">
				<div className="grid gap-3 md:grid-cols-2">
					<div className="space-y-1">
						<label
							htmlFor={refreshModeId}
							className="text-sm font-medium text-foreground"
						>
							{tSettings("journalRefreshModeLabel")}
						</label>
						<select
							id={refreshModeId}
							value={refreshMode}
							onChange={(event) =>
								setRefreshMode(
									event.target.value as typeof refreshMode,
								)
							}
							className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
						>
							<option value="fixed">
								{tSettings("journalRefreshModeFixed")}
							</option>
							<option value="workHours">
								{tSettings("journalRefreshModeWorkHours")}
							</option>
							<option value="custom">
								{tSettings("journalRefreshModeCustom")}
							</option>
						</select>
					</div>
				</div>

				<div className="grid gap-3 md:grid-cols-3">
					<div className="space-y-1">
						<label
							htmlFor={fixedId}
							className="text-sm text-muted-foreground"
						>
							{tSettings("journalFixedTimeLabel")}
						</label>
						<input
							id={fixedId}
							type="time"
							value={fixedTime}
							onChange={(event) => setFixedTime(event.target.value)}
							className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
						/>
					</div>
					<div className="space-y-1">
						<label
							htmlFor={workStartId}
							className="text-sm text-muted-foreground"
						>
							{tSettings("journalWorkHoursLabel")}
						</label>
						<div className="flex items-center gap-2">
							<input
								id={workStartId}
								type="time"
								value={workHoursStart}
								onChange={(event) =>
									setWorkHoursStart(event.target.value)
								}
								className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
							/>
							<span className="text-xs text-muted-foreground">-</span>
							<input
								id={workEndId}
								type="time"
								value={workHoursEnd}
								onChange={(event) => setWorkHoursEnd(event.target.value)}
								className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
							/>
						</div>
					</div>
					<div className="space-y-1">
						<label
							htmlFor={customId}
							className="text-sm text-muted-foreground"
						>
							{tSettings("journalCustomTimeLabel")}
						</label>
						<input
							id={customId}
							type="time"
							value={customTime}
							onChange={(event) => setCustomTime(event.target.value)}
							className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
						/>
					</div>
				</div>

				<div className="grid gap-3">
					<div className="flex items-center justify-between">
						<label
							htmlFor={autoLinkId}
							className="text-sm font-medium text-foreground"
						>
							{tSettings("journalAutoLinkLabel")}
						</label>
						<ToggleSwitch
							id={autoLinkId}
							enabled={autoLinkEnabled}
							onToggle={setAutoLinkEnabled}
							ariaLabel={tSettings("journalAutoLinkLabel")}
						/>
					</div>
					<div className="flex items-center justify-between">
						<label
							htmlFor={autoObjectiveId}
							className="text-sm font-medium text-foreground"
						>
							{tSettings("journalAutoObjectiveLabel")}
						</label>
						<ToggleSwitch
							id={autoObjectiveId}
							enabled={autoGenerateObjectiveEnabled}
							onToggle={setAutoGenerateObjectiveEnabled}
							ariaLabel={tSettings("journalAutoObjectiveLabel")}
						/>
					</div>
					<div className="flex items-center justify-between">
						<label
							htmlFor={autoAiId}
							className="text-sm font-medium text-foreground"
						>
							{tSettings("journalAutoAiLabel")}
						</label>
						<ToggleSwitch
							id={autoAiId}
							enabled={autoGenerateAiEnabled}
							onToggle={setAutoGenerateAiEnabled}
							ariaLabel={tSettings("journalAutoAiLabel")}
						/>
					</div>
				</div>
			</div>
		</SettingsSection>
	);
}
