"use client";

import { Lightbulb, ListChecks, TrendingUp } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

type PromptSuggestion = {
	id: string;
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	prompt: string;
};

type PromptSuggestionsProps = {
	onSelect: (prompt: string) => void;
	className?: string;
};

export function PromptSuggestions({
	onSelect,
	className,
}: PromptSuggestionsProps) {
	const t = useTranslations("chat");

	const suggestions: PromptSuggestion[] = [
		{
			id: "breakdown",
			icon: ListChecks,
			label: t("suggestions.breakdown"),
			prompt: t("suggestions.breakdownPrompt"),
		},
		{
			id: "priority",
			icon: TrendingUp,
			label: t("suggestions.priority"),
			prompt: t("suggestions.priorityPrompt"),
		},
		{
			id: "advice",
			icon: Lightbulb,
			label: t("suggestions.advice"),
			prompt: t("suggestions.advicePrompt"),
		},
	];

	const handleClick = useCallback(
		(prompt: string) => {
			onSelect(prompt);
		},
		[onSelect],
	);

	return (
		<div className={cn("flex flex-wrap justify-center gap-3 px-4", className)}>
			{suggestions.map((suggestion) => {
				const Icon = suggestion.icon;
				return (
					<button
						key={suggestion.id}
						type="button"
						onClick={() => handleClick(suggestion.prompt)}
						className={cn(
							"flex items-center gap-2 rounded-full px-4 py-2.5",
							"bg-muted/80 hover:bg-muted",
							"text-sm text-foreground/80 hover:text-foreground",
							"border border-border/40 hover:border-border",
							"transition-all duration-200",
							"hover:shadow-sm",
						)}
					>
						<Icon className="h-4 w-4" />
						<span>{suggestion.label}</span>
					</button>
				);
			})}
		</div>
	);
}
