import { Download, FileText, Image as ImageIcon } from "lucide-react";
import type { ChatAttachment } from "@/apps/chat/types";
import { getChatAttachmentDownloadUrl } from "@/lib/chat-attachments";

const formatBytes = (bytes?: number): string => {
	if (!bytes || Number.isNaN(bytes)) return "";
	const units = ["B", "KB", "MB", "GB", "TB"];
	let size = bytes;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex += 1;
	}
	const fixed = unitIndex === 0 ? 0 : size < 10 ? 1 : 0;
	return `${size.toFixed(fixed)} ${units[unitIndex]}`;
};

const isImageAttachment = (attachment: ChatAttachment): boolean =>
	attachment.kind === "image" ||
	Boolean(attachment.mimeType && attachment.mimeType.startsWith("image/"));

export type MessageAttachmentsProps = {
	attachments: ChatAttachment[];
};

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
	if (!attachments || attachments.length === 0) return null;

	const imageAttachments = attachments.filter(isImageAttachment);
	const fileAttachments = attachments.filter(
		(attachment) => !isImageAttachment(attachment),
	);

	return (
		<div className="mt-3 flex flex-col gap-2">
			{imageAttachments.length > 0 && (
				<div className="grid grid-cols-2 gap-2">
					{imageAttachments.map((attachment) => {
						const url = getChatAttachmentDownloadUrl(
							attachment.downloadUrl || "",
						);
						if (!url) return null;
						const label = attachment.fileName || "Image";
						return (
							<a
								key={attachment.id}
								href={url}
								target="_blank"
								rel="noreferrer"
								className="group flex flex-col gap-1"
							>
								<img
									src={url}
									alt={label}
									className="h-28 w-full rounded-lg object-cover shadow-sm"
								/>
								<span className="truncate text-[11px] text-muted-foreground">
									{label}
								</span>
							</a>
						);
					})}
				</div>
			)}
			{fileAttachments.length > 0 && (
				<div className="flex flex-col gap-2">
					{fileAttachments.map((attachment) => {
						const url = getChatAttachmentDownloadUrl(
							attachment.downloadUrl || "",
						);
						if (!url) return null;
						const label = attachment.fileName || "Attachment";
						const sizeLabel = formatBytes(attachment.fileSize);
						return (
							<a
								key={attachment.id}
								href={url}
								target="_blank"
								rel="noreferrer"
								download
								className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/60 px-2 py-1.5 text-xs transition-colors hover:bg-background"
							>
								<FileText className="h-3.5 w-3.5 text-muted-foreground" />
								<span className="min-w-0 flex-1 truncate">{label}</span>
								{sizeLabel && (
									<span className="text-[10px] text-muted-foreground">
										{sizeLabel}
									</span>
								)}
								<Download className="h-3.5 w-3.5 text-muted-foreground" />
							</a>
						);
					})}
				</div>
			)}
			{imageAttachments.length === 0 && fileAttachments.length === 0 && (
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<ImageIcon className="h-3.5 w-3.5" />
					<span>Attachments unavailable</span>
				</div>
			)}
		</div>
	);
}
