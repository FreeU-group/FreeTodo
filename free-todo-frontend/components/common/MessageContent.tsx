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
	const baseClass = cn(
		"whitespace-pre-wrap break-words text-foreground",
		isStreaming && "animate-pulse",
		className,
	);

	if (isMarkdown) {
		// 简单安全处理：按行拆分渲染，避免直接注入 HTML
		const lines = content.split(/\r?\n/);
		return (
			<div className={cn("prose prose-sm max-w-none text-foreground", className)}>
				{lines.map((line, index) => (
					<p key={`${index}-${line.slice(0, 8)}`}>{line}</p>
				))}
			</div>
		);
	}

	return <p className={baseClass}>{content}</p>;
}
