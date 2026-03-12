import type { ChatAttachment } from "@/apps/chat/types";
import { formatBytes } from "@/lib/preview/utils";

type MessageAttachmentsProps = {
	attachments?: ChatAttachment[];
};

export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
	if (!attachments || attachments.length === 0) return null;

	return (
		<div className="mt-2 flex flex-col gap-2">
			{attachments.map((attachment) => (
				<div
					key={attachment.id}
					className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-xs"
				>
					<div className="flex min-w-0 flex-col">
						<span className="truncate font-medium">{attachment.name}</span>
						<span className="text-muted-foreground">
							{attachment.kind === "image" ? "图片" : "文本"} ·
							 {formatBytes(attachment.size)}
						</span>
					</div>
					<a
						href={attachment.url}
						target="_blank"
						rel="noreferrer"
						className="text-primary hover:underline"
					>
						查看
					</a>
				</div>
			))}
		</div>
	);
}
