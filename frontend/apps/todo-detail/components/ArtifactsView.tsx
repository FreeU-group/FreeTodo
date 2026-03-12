"use client";

import {
	FileUp,
	FolderOpen,
	GripVertical,
	ImageIcon,
	NotebookText,
	Paperclip,
	Play,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ChangeEvent, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getAttachmentFileUrl, MAX_ATTACHMENT_SIZE_BYTES } from "@/lib/attachments";
import { toastError } from "@/lib/toast";
import type { Todo, TodoAttachment } from "@/lib/types";
import type { PlanSpec } from "@/lib/types/plan";
import { usePlanProgress } from "../hooks/usePlanProgress";

interface ArtifactsViewProps {
	todo: Todo;
	attachments: TodoAttachment[];
	onUpload: (files: File[]) => void;
	onRemove: (attachmentId: number) => void;
	onSelectAttachment: (attachment: TodoAttachment) => void;
	onShowDetail: () => void;
}

const formatBytes = (value?: number) => {
	if (!value && value !== 0) return "—";
	const units = ["B", "KB", "MB", "GB"];
	let size = value;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex += 1;
	}
	return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

export function ArtifactsView({
	todo,
	attachments,
	onUpload,
	onRemove,
	onSelectAttachment,
	onShowDetail,
}: ArtifactsViewProps) {
	const t = useTranslations("todoDetail");
	const uploadInputRef = useRef<HTMLInputElement | null>(null);
	const planProgress = usePlanProgress(todo);

	const stepMetaById = useMemo(() => {
		const map = new Map<string, PlanSpec["steps"][number]>();
		if (planProgress.plan) {
			for (const step of planProgress.plan.steps) {
				map.set(step.stepId, step);
			}
		}
		return map;
	}, [planProgress.plan]);

	const { artifacts, contextAttachments } = useMemo(() => {
		const artifactsList: TodoAttachment[] = [];
		const contextList: TodoAttachment[] = [];
		for (const attachment of attachments) {
			if (attachment.source === "ai") {
				artifactsList.push(attachment);
			} else {
				contextList.push(attachment);
			}
		}
		return { artifacts: artifactsList, contextAttachments: contextList };
	}, [attachments]);

	const handleSelectFiles = (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files || []);
		if (files.length === 0) return;

		const oversized = files.find((file) => file.size > MAX_ATTACHMENT_SIZE_BYTES);
		if (oversized) {
			toastError(t("uploadSizeLimit"));
			event.target.value = "";
			return;
		}

		onUpload(files);
		event.target.value = "";
	};

	const renderAttachmentRow = (attachment: TodoAttachment) => {
		return (
			<div
				key={attachment.id}
				className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-xs"
			>
				<div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted/40">
					{attachment.mimeType?.startsWith("image/") ? (
						<ImageIcon className="h-4 w-4 text-muted-foreground" />
					) : (
						<Paperclip className="h-4 w-4 text-muted-foreground" />
					)}
				</div>
				<div className="flex-1 truncate">
					<div className="truncate text-sm font-medium text-foreground">
						{attachment.fileName}
					</div>
					<div className="flex items-center gap-2 text-xs text-muted-foreground">
						<span>{attachment.mimeType || "unknown"}</span>
						<span>•</span>
						<span>{formatBytes(attachment.fileSize)}</span>
					</div>
				</div>
				<button
					type="button"
					onClick={() => onSelectAttachment(attachment)}
					className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
				>
					{t("previewLabel")}
				</button>
				<a
					href={getAttachmentFileUrl(attachment.id)}
					target="_blank"
					rel="noreferrer"
					className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
				>
					{t("downloadLabel")}
				</a>
				<button
					type="button"
					onClick={() => onRemove(attachment.id)}
					className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
				>
					<Trash2 className="h-3.5 w-3.5" />
				</button>
			</div>
		);
	};

	const statusConfig = {
		pending: {
			label: t("planStatusPending"),
			badge: "bg-muted text-muted-foreground",
			dot: "bg-muted-foreground/40",
			motion: "",
		},
		running: {
			label: t("planStatusRunning"),
			badge: "bg-primary/15 text-primary plan-status-pulse",
			dot: "bg-primary plan-status-pulse",
			motion: "plan-status-pulse",
		},
		success: {
			label: t("planStatusSuccess"),
			badge: "bg-emerald-500/15 text-emerald-600 plan-status-pop",
			dot: "bg-emerald-500 plan-status-pop",
			motion: "plan-status-pop",
		},
		failed: {
			label: t("planStatusFailed"),
			badge: "bg-rose-500/15 text-rose-600 plan-status-shake",
			dot: "bg-rose-500 plan-status-shake",
			motion: "plan-status-shake",
		},
		rollbacking: {
			label: t("planStatusRollbacking"),
			badge: "bg-amber-500/15 text-amber-600 plan-status-pulse",
			dot: "bg-amber-500 plan-status-pulse",
			motion: "plan-status-pulse",
		},
		rolled_back: {
			label: t("planStatusRolledBack"),
			badge: "bg-amber-500/10 text-amber-700",
			dot: "bg-amber-500",
			motion: "",
		},
		skipped: {
			label: t("planStatusSkipped"),
			badge: "bg-muted text-muted-foreground",
			dot: "bg-muted-foreground/40",
			motion: "",
		},
	};

	const renderPlanStep = (step: (typeof planProgress.steps)[number]) => {
		const meta = stepMetaById.get(step.stepId);
		const status =
			statusConfig[step.status as keyof typeof statusConfig] ||
			statusConfig.pending;
		const dependsOn = meta?.dependsOn?.length
			? meta.dependsOn.join(", ")
			: null;
		const parallelGroup = meta?.parallelGroup ?? null;

		return (
			<div
				key={step.stepId}
				className="rounded-lg border border-border bg-background px-3 py-2"
			>
				<div className="flex items-start gap-3">
					<span
						className={`mt-1.5 h-2.5 w-2.5 rounded-full ${status.dot} ${status.motion}`}
					/>
					<div className="flex-1 space-y-1">
						<div className="flex flex-wrap items-center gap-2">
							<span className="text-sm font-medium text-foreground">
								{meta?.name ?? step.stepName}
							</span>
							<span
								className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.badge}`}
							>
								{status.label}
							</span>
						</div>
						{meta?.tool && (
							<p className="text-xs text-muted-foreground">
								{t("planToolLabel", { tool: meta.tool })}
							</p>
						)}
						{dependsOn && (
							<p className="text-xs text-muted-foreground">
								{t("planDependsOn", { steps: dependsOn })}
							</p>
						)}
						{parallelGroup && (
							<p className="text-xs text-muted-foreground">
								{t("planParallelGroup", { group: parallelGroup })}
							</p>
						)}
						{step.error && (
							<p className="text-xs text-rose-500">{step.error}</p>
						)}
					</div>
				</div>
			</div>
		);
	};

	return (
		<div className="flex min-w-0 flex-1 flex-col gap-6">
			<section className="rounded-xl border border-border bg-muted/20 px-4 py-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						<GripVertical className="h-4 w-4" />
						<span>{t("progressLabel")}</span>
					</div>
					<div className="flex items-center gap-2">
						{planProgress.hasPlan && (
							<button
								type="button"
								onClick={planProgress.refresh}
								disabled={planProgress.loading}
								className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
							>
								<RefreshCw className="h-3 w-3" />
								{t("planRefresh")}
							</button>
						)}
						<button
							type="button"
							onClick={() =>
								planProgress.plan
									? planProgress.runPlan(planProgress.plan.planId)
									: planProgress.createAndRun()
							}
							disabled={planProgress.loading || planProgress.running}
							className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
						>
							<Play className="h-3 w-3" />
							{planProgress.running
								? t("planRunning")
								: planProgress.hasPlan
									? t("planRun")
									: t("planGenerate")}
						</button>
					</div>
				</div>
				{planProgress.hasPlan ? (
					<div className="mt-4 space-y-3">
						<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							<span className="font-semibold text-foreground">
								{planProgress.plan?.title}
							</span>
							<span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase">
								{t("planStatusLabel", { status: planProgress.runStatus })}
							</span>
						</div>
						{planProgress.error && (
							<p className="text-xs text-rose-500">
								{planProgress.error}
							</p>
						)}
						<div className="space-y-2">
							{planProgress.steps.length === 0 ? (
								<div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-4 text-center text-xs text-muted-foreground">
									{t("planNoSteps")}
								</div>
							) : (
								planProgress.steps.map(renderPlanStep)
							)}
						</div>
					</div>
				) : (
					<div className="mt-3 space-y-2 text-sm text-muted-foreground">
						<p>{t("progressEmptyTitle")}</p>
						<p className="text-xs">{t("progressEmptyHint")}</p>
					</div>
				)}
			</section>

			<section className="rounded-xl border border-border bg-background px-4 py-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						<FolderOpen className="h-4 w-4" />
						<span>{t("artifactsLabel")}</span>
					</div>
				</div>
				<div className="mt-4 space-y-2">
					{artifacts.length === 0 ? (
						<div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
							{t("artifactsEmpty")}
						</div>
					) : (
						artifacts.map(renderAttachmentRow)
					)}
				</div>
			</section>

			<section className="rounded-xl border border-border bg-background px-4 py-4">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						<NotebookText className="h-4 w-4" />
						<span>{t("contextLabel")}</span>
					</div>
					<button
						type="button"
						onClick={onShowDetail}
						className="text-xs text-muted-foreground hover:text-foreground transition-colors"
					>
						{t("editContext")}
					</button>
				</div>

				<div className="mt-4 grid gap-4">
					<div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
						<div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							{t("backgroundLabel")}
						</div>
						{todo.description ? (
							<div className="text-sm text-foreground markdown-content">
								<ReactMarkdown remarkPlugins={[remarkGfm]}>
									{todo.description}
								</ReactMarkdown>
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								{t("backgroundEmptyPlaceholder")}
							</p>
						)}
					</div>
					<div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
						<div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
							{t("notesLabel")}
						</div>
						{todo.userNotes ? (
							<div className="text-sm text-foreground markdown-content">
								<ReactMarkdown remarkPlugins={[remarkGfm]}>
									{todo.userNotes}
								</ReactMarkdown>
							</div>
						) : (
							<p className="text-sm text-muted-foreground">
								{t("notesEmptyPlaceholder")}
							</p>
						)}
					</div>

					<div className="rounded-lg border border-border bg-muted/10 px-3 py-3">
						<div className="mb-3 flex items-center justify-between">
							<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
								<Paperclip className="h-4 w-4" />
								<span>{t("contextAttachmentsLabel")}</span>
							</div>
							<input
								ref={uploadInputRef}
								type="file"
								multiple
								className="hidden"
								onChange={handleSelectFiles}
							/>
							<button
								type="button"
								onClick={() => uploadInputRef.current?.click()}
								className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
							>
								<FileUp className="h-3.5 w-3.5" />
								{t("uploadLabel")}
							</button>
						</div>
						{contextAttachments.length === 0 ? (
							<div className="rounded-md border border-dashed border-border bg-background px-4 py-4 text-center text-sm text-muted-foreground">
								{t("contextAttachmentsEmpty")}
							</div>
						) : (
							<div className="space-y-2">
								{contextAttachments.map(renderAttachmentRow)}
							</div>
						)}
						<p className="mt-2 text-xs text-muted-foreground">
							{t("uploadHint")}
						</p>
					</div>
				</div>
			</section>
		</div>
	);
}
