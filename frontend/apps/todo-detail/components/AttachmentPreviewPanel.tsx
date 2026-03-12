"use client";

import { Download, X } from "lucide-react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { getAttachmentFileUrl } from "@/lib/attachments";
import type { TodoAttachment } from "@/lib/types";

interface AttachmentPreviewPanelProps {
	attachment: TodoAttachment;
	onClose: () => void;
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

export function AttachmentPreviewPanel({
	attachment,
	onClose,
}: AttachmentPreviewPanelProps) {
	const t = useTranslations("todoDetail");
	const previewUrl = getAttachmentFileUrl(attachment.id);
	const isImage = attachment.mimeType?.startsWith("image/");

	return (
		<div className="flex min-w-[240px] flex-1 flex-col rounded-xl border border-border bg-background px-4 py-4">
			<div className="flex items-center justify-between">
				<div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
					{t("previewLabel")}
				</div>
				<button
					type="button"
					onClick={onClose}
					className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
				>
					<X className="h-4 w-4" />
				</button>
			</div>

			<div className="mt-3 flex-1 overflow-hidden rounded-lg border border-border bg-muted/10 relative">
				{isImage ? (
					<Image
						src={previewUrl}
						alt={attachment.fileName}
						fill
						sizes="(max-width: 768px) 100vw, 50vw"
						className="object-contain"
					/>
				) : (
					<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
						{t("previewUnavailable")}
					</div>
				)}
			</div>

			<div className="mt-4 space-y-2">
				<div className="truncate text-sm font-medium text-foreground">
					{attachment.fileName}
				</div>
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span>{attachment.mimeType || "unknown"}</span>
					<span>•</span>
					<span>{formatBytes(attachment.fileSize)}</span>
				</div>
				<a
					href={previewUrl}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/10 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					<Download className="h-3.5 w-3.5" />
					{t("downloadLabel")}
				</a>
			</div>
		</div>
	);
}
