"use client";

import { Paperclip } from "lucide-react";
import type { TodoAttachment } from "@/lib/types/todo";

interface DescriptionSectionProps {
	description?: string;
	attachments?: TodoAttachment[];
}

export function DescriptionSection({
	description,
	attachments,
}: DescriptionSectionProps) {
	const hasAttachments = attachments && attachments.length > 0;

	return (
		<div className="mb-8">
			<h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
				Description
			</h2>
			<div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-foreground">
				{description || "暂无描述"}
			</div>

			{hasAttachments && (
				<div className="mt-6">
					<h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
						Attachments
					</h3>
					<div className="space-y-2">
						{attachments?.map((file) => (
							<div
								key={file.id}
								className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm"
							>
								<Paperclip className="h-4 w-4 text-muted-foreground" />
								<div className="flex-1 truncate">
									<div className="font-medium text-foreground">
										{file.fileName}
									</div>
									<div className="text-xs text-muted-foreground">
										{file.mimeType || "unknown"}
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
