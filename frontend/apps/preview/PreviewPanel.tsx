"use client";

import {
	Code2,
	ExternalLink,
	Eye,
	FileCode2,
	FileImage,
	FileQuestion,
	FileText,
	Folder,
	FolderOpen,
	Loader2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChangeEvent } from "react";
import { useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PanelActionButton, PanelHeader } from "@/components/common/layout/PanelHeader";
import { openExternalFile, revealFileInFolder } from "@/lib/preview/commands";
import { usePreviewStore } from "@/lib/preview/store";
import type { PreviewFileKind } from "@/lib/preview/utils";
import { formatBytes, supportsCodeMode } from "@/lib/preview/utils";
import { cn } from "@/lib/utils";
import { isElectron, isTauri } from "@/lib/utils/platform";

type FileKindMeta = {
	labelKey: string;
	Icon: typeof FileText;
	badgeClass: string;
};

const FILE_KIND_META: Record<PreviewFileKind, FileKindMeta> = {
	markdown: {
		labelKey: "types.markdown",
		Icon: FileText,
		badgeClass:
			"border-emerald-200/70 bg-emerald-50 text-emerald-700 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-200",
	},
	html: {
		labelKey: "types.html",
		Icon: FileCode2,
		badgeClass:
			"border-sky-200/70 bg-sky-50 text-sky-700 dark:border-sky-400/40 dark:bg-sky-500/10 dark:text-sky-200",
	},
	pdf: {
		labelKey: "types.pdf",
		Icon: FileText,
		badgeClass:
			"border-amber-200/70 bg-amber-50 text-amber-700 dark:border-amber-400/40 dark:bg-amber-500/10 dark:text-amber-200",
	},
	image: {
		labelKey: "types.image",
		Icon: FileImage,
		badgeClass:
			"border-purple-200/70 bg-purple-50 text-purple-700 dark:border-purple-400/40 dark:bg-purple-500/10 dark:text-purple-200",
	},
	text: {
		labelKey: "types.text",
		Icon: FileText,
		badgeClass:
			"border-slate-200/70 bg-slate-50 text-slate-700 dark:border-slate-400/40 dark:bg-slate-500/10 dark:text-slate-200",
	},
	binary: {
		labelKey: "types.binary",
		Icon: FileQuestion,
		badgeClass:
			"border-zinc-200/70 bg-zinc-50 text-zinc-700 dark:border-zinc-400/40 dark:bg-zinc-500/10 dark:text-zinc-200",
	},
};

const STATUS_META = {
	loading: {
		labelKey: "status.loading",
		dotClass: "bg-sky-500 animate-pulse",
		textClass: "text-sky-700 dark:text-sky-200",
	},
	ready: {
		labelKey: "status.ready",
		dotClass: "bg-emerald-500",
		textClass: "text-emerald-700 dark:text-emerald-200",
	},
	error: {
		labelKey: "status.error",
		dotClass: "bg-rose-500",
		textClass: "text-rose-700 dark:text-rose-200",
	},
};

export function PreviewPanel() {
	const tPage = useTranslations("page");
	const t = useTranslations("previewPanel");

	const activeFile = usePreviewStore((state) => state.activeFile);
	const recentFiles = usePreviewStore((state) => state.recentFiles);
	const mode = usePreviewStore((state) => state.mode);
	const setMode = usePreviewStore((state) => state.setMode);
	const openFromPath = usePreviewStore((state) => state.openFromPath);
	const openFromPicker = usePreviewStore((state) => state.openFromPicker);
	const activateRecent = usePreviewStore((state) => state.activateRecent);

	const fileInputRef = useRef<HTMLInputElement | null>(null);

	const supportsCode = activeFile ? supportsCodeMode(activeFile.kind) : false;
	const kindMeta = activeFile ? FILE_KIND_META[activeFile.kind] : null;
	const statusMeta =
		activeFile && activeFile.status !== "idle"
			? STATUS_META[activeFile.status]
			: null;

	const updatedLabel = useMemo(() => {
		if (!activeFile?.updatedAt) return t("timeUnknown");
		const date = new Date(activeFile.updatedAt);
		return date.toLocaleString();
	}, [activeFile?.updatedAt, t]);

	const canReveal = Boolean(activeFile?.path) && (isElectron() || isTauri());
	const canOpenExternal = Boolean(activeFile?.path || activeFile?.objectUrl);

	const handlePickFile = async () => {
		if (window.electronAPI?.previewOpenFile) {
			const result = await window.electronAPI.previewOpenFile();
			if (result?.path) {
				await openFromPath(result.path, "picker");
			}
			return;
		}
		fileInputRef.current?.click();
	};

	const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (file) {
			void openFromPicker(file);
		}
		event.target.value = "";
	};

	const handleOpenExternal = async () => {
		if (!activeFile) return;
		await openExternalFile(activeFile.path, activeFile.objectUrl);
	};

	const handleReveal = async () => {
		if (!activeFile?.path) return;
		await revealFileInFolder(activeFile.path);
	};

	return (
		<div className="flex h-full flex-col bg-background">
			<PanelHeader
				icon={Eye}
				title={tPage("previewLabel")}
				actions={
					<div className="flex items-center gap-1">
						<PanelActionButton
							icon={FolderOpen}
							aria-label={t("openFile")}
							onClick={handlePickFile}
						/>
						<PanelActionButton
							icon={ExternalLink}
							aria-label={t("openExternal")}
							disabled={!canOpenExternal}
							onClick={handleOpenExternal}
						/>
						<PanelActionButton
							icon={Folder}
							aria-label={t("revealInFolder")}
							disabled={!canReveal}
							onClick={handleReveal}
						/>
					</div>
				}
			/>

			<input
				ref={fileInputRef}
				type="file"
				className="hidden"
				onChange={handleFileChange}
			/>

			<div className="border-b bg-muted/20 px-4 py-3">
				{activeFile ? (
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="flex min-w-[220px] items-center gap-3">
							<div className="rounded-lg border border-border bg-background p-2">
								{kindMeta ? (
									<kindMeta.Icon className="h-5 w-5 text-muted-foreground" />
								) : (
									<FileText className="h-5 w-5 text-muted-foreground" />
								)}
							</div>
							<div>
								<div className="text-sm font-semibold text-foreground">
									{activeFile.name}
								</div>
								<div className="text-xs text-muted-foreground">
									{activeFile.path ?? t("localFile")}
								</div>
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-2 text-xs">
							{kindMeta && (
								<span
									className={cn(
										"inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
										kindMeta.badgeClass,
									)}
								>
									{t(kindMeta.labelKey)}
								</span>
							)}
							<span className="text-muted-foreground">
								{activeFile.size !== undefined
									? formatBytes(activeFile.size)
									: t("sizeUnknown")}
							</span>
							<span className="text-muted-foreground">•</span>
							<span className="text-muted-foreground">
								{t("updatedAt", { time: updatedLabel })}
							</span>
							{statusMeta && (
								<>
									<span className="text-muted-foreground">•</span>
									<span
										className={cn(
											"inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 font-medium",
											statusMeta.textClass,
										)}
									>
										<span
											className={cn(
												"h-2 w-2 rounded-full",
												statusMeta.dotClass,
											)}
										/>
										{t(statusMeta.labelKey)}
									</span>
								</>
							)}
						</div>
					</div>
				) : (
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="text-sm text-muted-foreground">
							{t("emptyDescription")}
						</div>
						<button
							type="button"
							onClick={handlePickFile}
							className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
						>
							<FolderOpen className="h-3.5 w-3.5" />
							{t("openFile")}
						</button>
					</div>
				)}

				{recentFiles.length > 0 && (
					<div className="mt-3 flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-2 text-xs text-muted-foreground">
							<span className="uppercase tracking-wide">
								{t("recentFiles")}
							</span>
							<div className="flex flex-wrap items-center gap-2">
								{recentFiles.map((file) => {
									const isActive = file.id === activeFile?.id;
									return (
										<button
											key={file.id}
											type="button"
											onClick={() => activateRecent(file.id)}
											className={cn(
												"inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
												isActive
													? "border-primary/40 bg-primary/10 text-primary"
													: "border-border bg-background text-muted-foreground hover:text-foreground",
											)}
										>
											{file.name}
										</button>
									);
								})}
							</div>
						</div>
					</div>
				)}

				{activeFile && (
					<div className="mt-3 flex flex-wrap items-center justify-end gap-2">
						<div className="inline-flex rounded-lg border border-border bg-background/80 p-0.5">
							<button
								type="button"
								onClick={() => setMode("code")}
								disabled={!supportsCode}
								className={cn(
									"inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
									mode === "code"
										? "bg-foreground text-background"
										: "text-muted-foreground",
									!supportsCode && "cursor-not-allowed opacity-40",
								)}
							>
								<Code2 className="h-3.5 w-3.5" />
								{t("modeCode")}
							</button>
							<button
								type="button"
								onClick={() => setMode("view")}
								className={cn(
									"inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors",
									mode === "view"
										? "bg-foreground text-background"
										: "text-muted-foreground",
								)}
							>
								<Eye className="h-3.5 w-3.5" />
								{t("modeView")}
							</button>
						</div>
						{!supportsCode && (
							<span className="text-xs font-medium text-muted-foreground">
								{t("viewOnly")}
							</span>
						)}
					</div>
				)}
			</div>

			<div className="flex-1 overflow-hidden">
				<div className="h-full overflow-y-auto bg-muted/10 px-6 py-6">
					{!activeFile && (
						<div className="flex h-full flex-col items-center justify-center gap-4 text-center">
							<div className="rounded-full border border-border bg-background p-3">
								<Eye className="h-6 w-6 text-muted-foreground" />
							</div>
							<div className="space-y-1">
								<div className="text-base font-semibold text-foreground">
									{t("emptyTitle")}
								</div>
								<div className="text-sm text-muted-foreground">
									{t("emptyDescription")}
								</div>
							</div>
							<button
								type="button"
								onClick={handlePickFile}
								className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-muted"
							>
								<FolderOpen className="h-4 w-4" />
								{t("openFile")}
							</button>
						</div>
					)}

					{activeFile && activeFile.status === "loading" && (
						<div className="flex h-full flex-col items-center justify-center gap-3 text-center text-muted-foreground">
							<Loader2 className="h-6 w-6 animate-spin" />
							<div className="text-sm font-medium">{t("loadingTitle")}</div>
						</div>
					)}

					{activeFile && activeFile.status === "error" && (
						<div className="rounded-2xl border border-border bg-background p-6 text-sm text-muted-foreground shadow-sm">
							<div className="text-base font-semibold text-foreground">
								{t("errorTitle")}
							</div>
							<div className="mt-2">{activeFile.error || t("errorHint")}</div>
							<button
								type="button"
								onClick={handleOpenExternal}
								className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
							>
								<ExternalLink className="h-3.5 w-3.5" />
								{t("openExternal")}
							</button>
						</div>
					)}

					{activeFile && activeFile.status === "ready" && (
						<div className="space-y-6">
							{mode === "code" && supportsCode ? (
								<div className="rounded-xl border border-border bg-background p-4 shadow-sm">
									<div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
										<Code2 className="h-3.5 w-3.5" />
										{t("codeModeTitle")}
									</div>
									<pre className="max-h-[520px] overflow-auto rounded-lg bg-muted/40 p-4 text-xs text-foreground">
										<code className="font-mono">
											{activeFile.text || t("contentUnavailable")}
										</code>
									</pre>
								</div>
							) : (
								<>
									{activeFile.kind === "markdown" && (
										<div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
											<div className="prose prose-sm max-w-none text-foreground dark:prose-invert">
												<ReactMarkdown remarkPlugins={[remarkGfm]}>
													{activeFile.text || t("contentUnavailable")}
												</ReactMarkdown>
											</div>
										</div>
									)}

									{activeFile.kind === "html" && (
										<div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
											<div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
												{t("renderedHtml")}
												<span className="rounded-full border border-border bg-muted/30 px-2 py-0.5 text-[10px]">
													{t("fullRender")}
												</span>
											</div>
											<div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm dark:bg-slate-900">
												<iframe
													title={activeFile.name}
													className="h-[520px] w-full bg-white"
													srcDoc={activeFile.text || ""}
												/>
											</div>
										</div>
									)}

									{activeFile.kind === "pdf" && (
										<div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
											<div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
												{t("pdfPreviewTitle")}
											</div>
											{activeFile.objectUrl ? (
												<object
													data={activeFile.objectUrl}
													type="application/pdf"
													className="h-[640px] w-full rounded-lg border border-border"
												>
													<div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
														{t("unsupported")}
													</div>
												</object>
											) : (
												<div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
													{t("unsupported")}
												</div>
											)}
										</div>
									)}

									{activeFile.kind === "image" && (
										<div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
											{activeFile.objectUrl ? (
												<img
													src={activeFile.objectUrl}
													alt={activeFile.name}
													className="mx-auto max-h-[620px] w-auto rounded-lg object-contain"
												/>
											) : (
												<div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
													{t("unsupported")}
												</div>
											)}
										</div>
									)}

									{activeFile.kind === "text" && (
										<div className="rounded-2xl border border-border bg-background p-5 shadow-sm">
											<pre className="max-h-[520px] overflow-auto rounded-lg bg-muted/40 p-4 text-xs text-foreground">
												<code className="font-mono">
													{activeFile.text || t("contentUnavailable")}
												</code>
											</pre>
										</div>
									)}

									{activeFile.kind === "binary" && (
										<div className="rounded-2xl border border-border bg-background p-6 text-sm text-muted-foreground shadow-sm">
											{t("unsupported")}
										</div>
									)}
								</>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
