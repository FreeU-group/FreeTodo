"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type JournalTab = "original" | "objective" | "ai";

interface DiaryTabsProps {
	activeTab: JournalTab;
	onChange: (tab: JournalTab) => void;
}

export function DiaryTabs({ activeTab, onChange }: DiaryTabsProps) {
	const t = useTranslations("journalPanel");

	const tabs: { id: JournalTab; label: string }[] = [
		{ id: "original", label: t("tabOriginal") },
		{ id: "objective", label: t("tabObjective") },
		{ id: "ai", label: t("tabAi") },
	];

	return (
		<div className="inline-flex rounded-full border border-border bg-muted/20 p-1">
			{tabs.map((tab) => (
				<button
					key={tab.id}
					type="button"
					onClick={() => onChange(tab.id)}
					className={cn(
						"rounded-full px-3 py-1 text-xs font-medium transition",
						activeTab === tab.id
							? "bg-background text-foreground shadow"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{tab.label}
				</button>
			))}
		</div>
	);
}
