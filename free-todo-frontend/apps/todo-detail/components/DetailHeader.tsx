"use client";

import { Trash2 } from "lucide-react";

interface DetailHeaderProps {
	onToggleComplete: () => void;
	onDelete: () => void;
}

export function DetailHeader({
	onToggleComplete,
	onDelete,
}: DetailHeaderProps) {
	return (
		<div className="flex shrink-0 items-center justify-between px-4 py-3">
			<div className="flex items-center gap-3">
				<button
					type="button"
					onClick={onToggleComplete}
					className="text-sm text-muted-foreground hover:text-foreground transition-colors"
				>
					Mark as complete
				</button>
				<button
					type="button"
					onClick={onDelete}
					className="flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-sm text-destructive hover:bg-destructive/10 transition-colors"
				>
					<Trash2 className="h-4 w-4" />
					<span>Delete</span>
				</button>
			</div>
		</div>
	);
}
