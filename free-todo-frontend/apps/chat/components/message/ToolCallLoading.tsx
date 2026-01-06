"use client";

import { cn } from "@/lib/utils";

type ToolCallLoadingProps = {
	toolName: string;
	searchQuery?: string;
	className?: string;
};

export function ToolCallLoading({
	toolName,
	searchQuery,
	className,
}: ToolCallLoadingProps) {
	// 工具名称映射（可选，用于显示更友好的名称）
	const toolNameMap: Record<string, string> = {
		web_search: "联网搜索",
	};

	const displayName = toolNameMap[toolName] || toolName;

	return (
		<div className={cn("flex flex-col gap-1 text-sm", className)}>
			<span className="shimmer-text font-medium">
				正在使用 {displayName}...
			</span>
			{searchQuery && (
				<span className="text-xs text-muted-foreground ml-0">
					搜索关键词: <span className="font-medium">{searchQuery}</span>
				</span>
			)}
		</div>
	);
}
