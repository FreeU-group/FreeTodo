"use client";

import { useTranslations } from "next-intl";
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
	const t = useTranslations("chat.toolCall");

	// 工具名称映射（使用本地化）
	const displayName =
		t(`toolNames.${toolName}` as any, { defaultValue: toolName }) || toolName;

	return (
		<div className={cn("flex flex-col gap-1 text-sm", className)}>
			<span className="shimmer-text font-medium">
				{t("using", { toolName: displayName })}
			</span>
			{searchQuery && (
				<span className="text-xs text-muted-foreground ml-0">
					{t("searchQueryLabel")}{" "}
					<span className="font-medium">{searchQuery}</span>
				</span>
			)}
		</div>
	);
}
