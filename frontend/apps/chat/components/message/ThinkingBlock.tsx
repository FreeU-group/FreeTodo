"use client";

import { ChevronDown, ChevronRight, Brain } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type ThinkingBlockProps = {
	content: string;
	isThinking?: boolean;
};

export function ThinkingBlock({ content, isThinking = false }: ThinkingBlockProps) {
	const [expanded, setExpanded] = useState(false);

	if (!content && !isThinking) return null;

	return (
		<div className="mb-2">
			<button
				type="button"
				onClick={() => setExpanded((v) => !v)}
				className={cn(
					"flex items-center gap-1.5 text-xs font-medium transition-colors rounded-md px-2 py-1",
					isThinking
						? "text-amber-600 dark:text-amber-400"
						: "text-muted-foreground hover:text-foreground",
				)}
			>
				<Brain className={cn("h-3.5 w-3.5", isThinking && "animate-pulse")} />
				<span>{isThinking ? "思考中..." : "思考过程"}</span>
				{!isThinking && (
					expanded
						? <ChevronDown className="h-3 w-3" />
						: <ChevronRight className="h-3 w-3" />
				)}
			</button>
			{(expanded || isThinking) && content && (
				<div
					className={cn(
						"mt-1 rounded-lg border px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap",
						"bg-muted/20 border-border/50 text-muted-foreground",
						"max-h-64 overflow-y-auto",
					)}
				>
					{content}
				</div>
			)}
		</div>
	);
}
