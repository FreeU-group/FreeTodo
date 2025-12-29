"use client";

import {
	Calendar,
	CheckSquare,
	Clock,
	Lightbulb,
	ListChecks,
	Target,
	TrendingUp,
	Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { cn } from "@/lib/utils";

type PromptSuggestion = {
	id: string;
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	prompt: string;
	color: string;
};

type PromptSuggestionsProps = {
	onSelect: (prompt: string) => void;
};

export function PromptSuggestions({ onSelect }: PromptSuggestionsProps) {
	const t = useTranslations("chat");

	const suggestions: PromptSuggestion[] = [
		{
			id: "breakdown",
			icon: ListChecks,
			label: t("suggestions.breakdown"),
			prompt: t("suggestions.breakdownPrompt"),
			color: "bg-purple-100 dark:bg-purple-900/20",
		},
		{
			id: "plan",
			icon: Calendar,
			label: t("suggestions.plan"),
			prompt: t("suggestions.planPrompt"),
			color: "bg-green-100 dark:bg-green-900/20",
		},
		{
			id: "priority",
			icon: TrendingUp,
			label: t("suggestions.priority"),
			prompt: t("suggestions.priorityPrompt"),
			color: "bg-yellow-100 dark:bg-yellow-900/20",
		},
		{
			id: "time",
			icon: Clock,
			label: t("suggestions.time"),
			prompt: t("suggestions.timePrompt"),
			color: "bg-blue-100 dark:bg-blue-900/20",
		},
		{
			id: "review",
			icon: CheckSquare,
			label: t("suggestions.review"),
			prompt: t("suggestions.reviewPrompt"),
			color: "bg-pink-100 dark:bg-pink-900/20",
		},
		{
			id: "optimize",
			icon: Zap,
			label: t("suggestions.optimize"),
			prompt: t("suggestions.optimizePrompt"),
			color: "bg-orange-100 dark:bg-orange-900/20",
		},
		{
			id: "goal",
			icon: Target,
			label: t("suggestions.goal"),
			prompt: t("suggestions.goalPrompt"),
			color: "bg-indigo-100 dark:bg-indigo-900/20",
		},
		{
			id: "advice",
			icon: Lightbulb,
			label: t("suggestions.advice"),
			prompt: t("suggestions.advicePrompt"),
			color: "bg-teal-100 dark:bg-teal-900/20",
		},
	];

	const handleClick = useCallback(
		(prompt: string) => {
			onSelect(prompt);
		},
		[onSelect],
	);

	return (
		<div className="flex flex-col items-center justify-center flex-1 px-4 py-8">
			<div className="w-full max-w-4xl">
				<div className="grid grid-cols-2 gap-4">
					{suggestions.map((suggestion) => {
						const Icon = suggestion.icon;
						return (
							<button
								key={suggestion.id}
								type="button"
								onClick={() => handleClick(suggestion.prompt)}
								className={cn(
									"relative flex flex-col items-start gap-3 rounded-xl p-4 text-left transition-all hover:scale-[1.02] active:scale-[0.98]",
									suggestion.color,
									"border border-border/50",
									"hover:shadow-md",
								)}
							>
								<div className="flex items-center gap-3 w-full">
									<div className="shrink-0">
										<Icon className="h-5 w-5 text-foreground/70" />
									</div>
									<div className="flex-1 min-w-0">
										<div className="text-sm font-medium text-foreground">
											{suggestion.label}
										</div>
									</div>
								</div>
							</button>
						);
					})}
				</div>
			</div>
		</div>
	);
}
