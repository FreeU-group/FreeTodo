"use client";

import { cn } from "@/lib/utils";

interface MessageContentProps {
	content: string;
	isMarkdown?: boolean;
	isStreaming?: boolean;
	className?: string;
}

export default function MessageContent({
	content,
	isMarkdown,
	isStreaming,
	className,
}: MessageContentProps) {
	// 这里不再做 markdown 解析，EventsPage 已经把 markdown 转成 HTML 传入时会走另一条逻辑
	if (isMarkdown) {
		return (
			<div
				className={cn("prose prose-sm max-w-none text-foreground", className)}
				dangerouslySetInnerHTML={{ __html: content }}
			/>
		);
	}

	return (
		<p
			className={cn(
				"whitespace-pre-wrap break-words text-foreground",
				isStreaming && "animate-pulse",
				className,
			)}
		>
			{content}
		</p>
	);
}
