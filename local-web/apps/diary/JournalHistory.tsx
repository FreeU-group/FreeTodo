"use client";

import type { JournalView } from "@/lib/query";
import { cn } from "@/lib/utils";

interface JournalHistoryProps {
	title: string;
	loadingLabel: string;
	emptyLabel: string;
	untitledLabel: string;
	journals: JournalView[];
	isLoading: boolean;
	activeId: number | null;
	onSelect: (journal: JournalView) => void;
	formatDate: (date: Date) => string;
}

export function JournalHistory({
	title,
	loadingLabel,
	emptyLabel,
	untitledLabel,
	journals,
	isLoading,
	activeId,
	onSelect,
	formatDate,
}: JournalHistoryProps) {
	return (
		<aside className="flex w-full shrink-0 flex-col border-b border-border/70 bg-muted/5 md:w-64 md:border-b-0 md:border-r">
			<div className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				{title}
			</div>
			<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-4">
				{isLoading && (
					<div className="text-xs text-muted-foreground">{loadingLabel}</div>
				)}
				{!isLoading && journals.length === 0 && (
					<div className="text-xs text-muted-foreground">{emptyLabel}</div>
				)}
				{journals.map((journal) => {
					const isActive = journal.id === activeId;
					return (
						<button
							key={journal.id}
							type="button"
							onClick={() => onSelect(journal)}
							className={cn(
								"rounded-md border border-transparent px-3 py-2 text-left transition",
								isActive
									? "border-primary/40 bg-primary/5"
									: "hover:bg-muted/40",
							)}
						>
							<div className="text-sm font-medium text-foreground">
								{journal.name?.trim() ? journal.name : untitledLabel}
							</div>
							<div className="text-xs text-muted-foreground">
								{formatDate(new Date(journal.date))}
							</div>
						</button>
					);
				})}
			</div>
		</aside>
	);
}
