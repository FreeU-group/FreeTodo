import { X } from "lucide-react";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getPriorityBorderColor } from "../utils/todoCardUtils";

interface TodoCardCheckboxProps {
	todo: Todo;
	onToggle: (e: React.MouseEvent) => void;
}

export function TodoCardCheckbox({ todo, onToggle }: TodoCardCheckboxProps) {
	return (
		<button type="button" onClick={onToggle} className="shrink-0">
			{todo.status === "completed" ? (
				<div className="flex h-4 w-4 items-center justify-center rounded-md bg-[oklch(var(--primary))] border border-[oklch(var(--primary))] shadow-inner">
					<span className="text-[8px] text-[oklch(var(--primary-foreground))] font-semibold">
						✓
					</span>
				</div>
			) : todo.status === "canceled" ? (
				<div
					className={cn(
						"flex h-4 w-4 items-center justify-center rounded-md border-2",
						getPriorityBorderColor(todo.priority ?? "none"),
						"bg-muted/30 text-muted-foreground/70",
						"transition-colors",
						"hover:bg-muted/40 hover:text-muted-foreground",
					)}
				>
					<X className="h-2.5 w-2.5" strokeWidth={2.5} />
				</div>
			) : todo.status === "draft" ? (
				<div className="flex h-4 w-4 items-center justify-center rounded-md bg-orange-500 border border-orange-600 dark:border-orange-500 shadow-inner">
					<span className="text-[10px] text-white dark:text-orange-50 font-semibold">
						—
					</span>
				</div>
			) : (
				<div
					className={cn(
						"h-4 w-4 rounded-md border-2 transition-colors",
						getPriorityBorderColor(todo.priority ?? "none"),
						"hover:border-foreground",
					)}
				/>
			)}
		</button>
	);
}
