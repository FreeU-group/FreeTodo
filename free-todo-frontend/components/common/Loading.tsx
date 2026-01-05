"use client";

import { cn } from "@/lib/utils";

interface LoadingProps {
	text?: string;
	className?: string;
}

export default function Loading({ text, className }: LoadingProps) {
	return (
		<div
			className={cn(
				"flex items-center justify-center gap-2 text-sm text-muted-foreground",
				className,
			)}
		>
			<span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent" />
			<span>{text ?? "加载中..."}</span>
		</div>
	);
}
