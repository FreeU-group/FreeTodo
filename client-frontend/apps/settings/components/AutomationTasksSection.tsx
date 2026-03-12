"use client";

import {
	Check,
	Clock,
	Play,
	Plus,
	Power,
	Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
	useAutomationTasks,
	useCreateAutomationTask,
	useDeleteAutomationTask,
	useRunAutomationTask,
	useToggleAutomationTask,
} from "@/lib/query";
import { toastError, toastSuccess } from "@/lib/toast";
import type { AutomationSchedule, AutomationScheduleType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SettingsSection } from "./SettingsSection";

interface AutomationTasksSectionProps {
	loading?: boolean;
}

export function AutomationTasksSection({
	loading = false,
}: AutomationTasksSectionProps) {
	const t = useTranslations("automationTasks");
	const { data, isLoading } = useAutomationTasks();
	const createMutation = useCreateAutomationTask();
	const deleteMutation = useDeleteAutomationTask();
	const runMutation = useRunAutomationTask();
	const toggleMutation = useToggleAutomationTask();

	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [url, setUrl] = useState("");
	const [method, setMethod] = useState("GET");
	const [scheduleType, setScheduleType] =
		useState<AutomationScheduleType>("interval");
	const [intervalMinutes, setIntervalMinutes] = useState(30);
	const [cronExpr, setCronExpr] = useState("0 9 * * *");
	const [runAt, setRunAt] = useState("");
	const [enabled, setEnabled] = useState(true);

	const tasks = data?.tasks ?? [];
	const busy =
		loading ||
		isLoading ||
		createMutation.isPending ||
		deleteMutation.isPending ||
		runMutation.isPending ||
		toggleMutation.isPending;

	const scheduleSummary = (task: {
		schedule: {
			type: AutomationScheduleType;
			intervalSeconds?: number;
			cron?: string;
			runAt?: string;
		};
	}) => {
		const schedule = task.schedule;
		if (schedule.type === "interval") {
			const minutes = Math.max(
				1,
				Math.round((schedule.intervalSeconds ?? 60) / 60),
			);
			return t("scheduleSummary.interval", { minutes });
		}
		if (schedule.type === "cron") {
			return t("scheduleSummary.cron", { cron: schedule.cron ?? "-" });
		}
		if (schedule.type === "once") {
			const label = schedule.runAt
				? new Date(schedule.runAt).toLocaleString(t("dateLocale"))
				: "-";
			return t("scheduleSummary.once", { time: label });
		}
		return "-";
	};

	const lastRunLabel = (value?: string) => {
		if (!value) return t("status.never");
		return new Date(value).toLocaleString(t("dateLocale"));
	};

	const schedulePayload = useMemo<AutomationSchedule>(() => {
		if (scheduleType === "interval") {
			return {
				type: "interval",
				intervalSeconds: intervalMinutes * 60,
			};
		}
		if (scheduleType === "cron") {
			return { type: "cron", cron: cronExpr };
		}
		const runAtIso = runAt ? new Date(runAt).toISOString() : undefined;
		return { type: "once", runAt: runAtIso };
	}, [cronExpr, intervalMinutes, runAt, scheduleType]);

	const handleCreate = async () => {
		if (!name.trim()) {
			toastError(t("errors.nameRequired"));
			return;
		}
		if (!url.trim()) {
			toastError(t("errors.urlRequired"));
			return;
		}
		if (scheduleType === "interval" && intervalMinutes <= 0) {
			toastError(t("errors.intervalRequired"));
			return;
		}
		if (scheduleType === "cron" && !cronExpr.trim()) {
			toastError(t("errors.cronRequired"));
			return;
		}
		if (scheduleType === "once" && !runAt) {
			toastError(t("errors.runAtRequired"));
			return;
		}
		try {
			await createMutation.mutateAsync({
				name: name.trim(),
				description: description.trim() || undefined,
				enabled,
				schedule: schedulePayload,
				action: {
					type: "web_fetch",
					payload: {
						url: url.trim(),
						method,
					},
				},
			});
			toastSuccess(t("messages.created"));
			setName("");
			setDescription("");
			setUrl("");
			setMethod("GET");
			setScheduleType("interval");
			setIntervalMinutes(30);
			setCronExpr("0 9 * * *");
			setRunAt("");
			setEnabled(true);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("errors.createFailed", { error: msg }));
		}
	};

	const handleRun = async (id: number) => {
		try {
			await runMutation.mutateAsync(id);
			toastSuccess(t("messages.ran"));
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("errors.runFailed", { error: msg }));
		}
	};

	const handleToggle = async (id: number, nextEnabled: boolean) => {
		try {
			await toggleMutation.mutateAsync({ id, enabled: nextEnabled });
			toastSuccess(
				nextEnabled ? t("messages.enabled") : t("messages.disabled"),
			);
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("errors.updateFailed", { error: msg }));
		}
	};

	const handleDelete = async (id: number) => {
		if (!window.confirm(t("confirmDelete"))) {
			return;
		}
		try {
			await deleteMutation.mutateAsync(id);
			toastSuccess(t("messages.deleted"));
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			toastError(t("errors.deleteFailed", { error: msg }));
		}
	};

	return (
		<SettingsSection title={t("title")} description={t("description")}>
			<div className="rounded-lg border border-border/70 bg-muted/30 p-4">
				<div className="mb-3 flex items-center justify-between">
					<p className="text-sm font-medium text-foreground">
						{t("createTitle")}
					</p>
					<span className="text-xs text-muted-foreground">
						{t("createHint")}
					</span>
				</div>
				<div className="grid gap-3 md:grid-cols-2">
					<div className="space-y-2">
						<label
							htmlFor="automation-task-name"
							className="text-xs text-muted-foreground"
						>
							{t("labels.name")}
						</label>
						<input
							id="automation-task-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder={t("placeholders.name")}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						/>
					</div>
					<div className="space-y-2">
						<label
							htmlFor="automation-task-url"
							className="text-xs text-muted-foreground"
						>
							{t("labels.url")}
						</label>
						<input
							id="automation-task-url"
							value={url}
							onChange={(event) => setUrl(event.target.value)}
							placeholder="https://"
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						/>
					</div>
					<div className="space-y-2 md:col-span-2">
						<label
							htmlFor="automation-task-description"
							className="text-xs text-muted-foreground"
						>
							{t("labels.description")}
						</label>
						<input
							id="automation-task-description"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							placeholder={t("placeholders.description")}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						/>
					</div>
					<div className="space-y-2">
						<label
							htmlFor="automation-task-method"
							className="text-xs text-muted-foreground"
						>
							{t("labels.method")}
						</label>
						<select
							id="automation-task-method"
							value={method}
							onChange={(event) => setMethod(event.target.value)}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						>
							<option value="GET">GET</option>
							<option value="POST">POST</option>
						</select>
					</div>
					<div className="space-y-2">
						<label
							htmlFor="automation-task-enabled"
							className="text-xs text-muted-foreground"
						>
							{t("labels.enabled")}
						</label>
						<button
							id="automation-task-enabled"
							type="button"
							onClick={() => setEnabled((prev) => !prev)}
							className={cn(
								"inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm",
								enabled
									? "border-primary/40 bg-primary/10 text-primary"
									: "border-border text-muted-foreground",
							)}
						>
							<Power className="h-4 w-4" />
							{enabled ? t("labels.enabledOn") : t("labels.enabledOff")}
						</button>
					</div>
					<div className="space-y-2">
						<label
							htmlFor="automation-task-schedule-type"
							className="text-xs text-muted-foreground"
						>
							{t("labels.scheduleType")}
						</label>
						<select
							id="automation-task-schedule-type"
							value={scheduleType}
							onChange={(event) =>
								setScheduleType(event.target.value as AutomationScheduleType)
							}
							className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
						>
							<option value="interval">{t("scheduleType.interval")}</option>
							<option value="cron">{t("scheduleType.cron")}</option>
							<option value="once">{t("scheduleType.once")}</option>
						</select>
					</div>
					{scheduleType === "interval" && (
						<div className="space-y-2">
							<label
								htmlFor="automation-task-interval"
								className="text-xs text-muted-foreground"
							>
								{t("labels.intervalMinutes")}
							</label>
							<input
								id="automation-task-interval"
								type="number"
								min={1}
								value={intervalMinutes}
								onChange={(event) =>
									setIntervalMinutes(
										Math.max(1, Number.parseInt(event.target.value, 10) || 1),
									)
								}
								className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
							/>
						</div>
					)}
					{scheduleType === "cron" && (
						<div className="space-y-2">
							<label
								htmlFor="automation-task-cron"
								className="text-xs text-muted-foreground"
							>
								{t("labels.cron")}
							</label>
							<input
								id="automation-task-cron"
								value={cronExpr}
								onChange={(event) => setCronExpr(event.target.value)}
								placeholder="0 9 * * *"
								className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
							/>
						</div>
					)}
					{scheduleType === "once" && (
						<div className="space-y-2">
							<label
								htmlFor="automation-task-run-at"
								className="text-xs text-muted-foreground"
							>
								{t("labels.runAt")}
							</label>
							<input
								id="automation-task-run-at"
								type="datetime-local"
								value={runAt}
								onChange={(event) => setRunAt(event.target.value)}
								className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
							/>
						</div>
					)}
				</div>
				<div className="mt-4 flex items-center gap-2">
					<button
						type="button"
						onClick={handleCreate}
						disabled={busy}
						className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
					>
						<Plus className="h-4 w-4" />
						{t("actions.create")}
					</button>
				</div>
			</div>

			<div className="mt-4 space-y-2">
				{tasks.length === 0 && !isLoading && (
					<p className="text-sm text-muted-foreground">{t("empty")}</p>
				)}

				{tasks.map((task) => (
					<div
						key={task.id}
						className="rounded-lg border border-border bg-background/70 px-3 py-3"
					>
						<div className="flex flex-wrap items-center justify-between gap-2">
							<div className="min-w-0">
								<p className="text-sm font-medium text-foreground">
									{task.name}
								</p>
								{task.description && (
									<p className="text-xs text-muted-foreground truncate">
										{task.description}
									</p>
								)}
							</div>
							<div className="flex items-center gap-2">
								<button
									type="button"
									onClick={() => handleRun(task.id)}
									disabled={busy}
									className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-foreground"
								>
									<Play className="h-3 w-3" />
									{t("actions.run")}
								</button>
								<button
									type="button"
									onClick={() => handleToggle(task.id, !task.enabled)}
									disabled={busy}
									className={cn(
										"inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs",
										task.enabled
											? "border-primary/40 text-primary"
											: "border-border text-muted-foreground",
									)}
								>
									<Check className="h-3 w-3" />
									{task.enabled
										? t("actions.disable")
										: t("actions.enable")}
								</button>
								<button
									type="button"
									onClick={() => handleDelete(task.id)}
									disabled={busy}
									className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-destructive"
								>
									<Trash2 className="h-3 w-3" />
									{t("actions.delete")}
								</button>
							</div>
						</div>
						<div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
							<span className="inline-flex items-center gap-1">
								<Clock className="h-3 w-3" />
								{scheduleSummary(task)}
							</span>
							<span>{t("labels.lastRun", { time: lastRunLabel(task.lastRunAt) })}</span>
							<span>
								{t("labels.status")}:{" "}
								{task.lastStatus ? t(`status.${task.lastStatus}`) : t("status.never")}
							</span>
						</div>
						{task.lastError && (
							<p className="mt-2 text-xs text-destructive">{task.lastError}</p>
						)}
						{task.lastOutput && (
							<p className="mt-2 text-xs text-muted-foreground line-clamp-2">
								{task.lastOutput}
							</p>
						)}
					</div>
				))}
			</div>
		</SettingsSection>
	);
}
