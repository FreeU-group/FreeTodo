"use client";

import { Globe } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

type WebSearchToggleProps = {
	enabled: boolean;
	onToggle: () => void;
};

export function WebSearchToggle({ enabled, onToggle }: WebSearchToggleProps) {
	const t = useTranslations("chat");

	return (
		<button
			type="button"
			onClick={onToggle}
			className={cn(
				"flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors",
				enabled
					? "border-primary bg-primary/10 text-primary hover:bg-primary/20"
					: "border-border bg-background text-muted-foreground hover:bg-muted",
			)}
			aria-label={t("webSearch.toggle")}
			title={enabled ? t("webSearch.enabled") : t("webSearch.disabled")}
		>
			<Globe className="h-3.5 w-3.5" />
			<span>{t("webSearch.label")}</span>
		</button>
	);
}
