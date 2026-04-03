"use client";

import { MapPin, UserCheck, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Todo } from "@/lib/types";

interface WhoWhereSectionProps {
	todo: Todo;
}

export function WhoWhereSection({ todo }: WhoWhereSectionProps) {
	const t = useTranslations("todoDetail");
	const hasLocation = Boolean(todo.location?.trim());
	const hasFounder = Boolean(todo.whoFounder?.trim());
	const hasExecutor = Boolean(todo.whoExecutor?.trim());

	if (!hasLocation && !hasFounder && !hasExecutor) {
		return null;
	}

	return (
		<div className="mb-6 flex flex-wrap gap-4 text-sm text-muted-foreground">
			{hasLocation && (
				<div className="flex items-center gap-2">
					<MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
					<span className="font-medium">{t("locationLabel")}:</span>
					<span className="text-foreground">{todo.location}</span>
				</div>
			)}
			{hasFounder && (
				<div className="flex items-center gap-2">
					<UserPlus className="h-3.5 w-3.5 shrink-0" aria-hidden />
					<span className="font-medium">{t("whoFounderLabel")}:</span>
					<span className="text-foreground">{todo.whoFounder}</span>
				</div>
			)}
			{hasExecutor && (
				<div className="flex items-center gap-2">
					<UserCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
					<span className="font-medium">{t("whoExecutorLabel")}:</span>
					<span className="text-foreground">{todo.whoExecutor}</span>
				</div>
			)}
		</div>
	);
}
