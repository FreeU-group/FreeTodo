"use client";

import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface DetailTitleProps {
	name: string;
	showDescription: boolean;
	onToggleDescription: () => void;
}

export function DetailTitle({
	name,
	showDescription,
	onToggleDescription,
}: DetailTitleProps) {
	return (
		<div className="mb-4 flex items-center justify-between gap-3">
			<h1 className="text-3xl font-bold text-foreground">{name}</h1>
			<button
				type="button"
				onClick={onToggleDescription}
				aria-pressed={showDescription}
				aria-label="查看描述"
				className={cn(
					"rounded-md border px-2 py-1 transition-colors",
					showDescription
						? "border-primary/60 bg-primary/10 text-primary"
						: "border-border text-muted-foreground hover:bg-muted/40",
				)}
			>
				<Info className="h-5 w-5" />
			</button>
		</div>
	);
}
