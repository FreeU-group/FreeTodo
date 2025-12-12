"use client";

import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterStatus } from "./hooks/useOrderedTodos";

interface TodoToolbarProps {
	filterStatus: FilterStatus;
	onFilterChange: (status: FilterStatus) => void;
	searchQuery: string;
	onSearch: (value: string) => void;
}

export function TodoToolbar({
	filterStatus,
	onFilterChange,
	searchQuery,
	onSearch,
}: TodoToolbarProps) {
	return (
		<div className="shrink-0 bg-background">
			<div className="flex items-center justify-between px-4 py-3">
				<h2 className="text-lg font-semibold text-foreground">Todo List</h2>

				<div className="flex items-center gap-2">
					<div className="relative">
						<Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<input
							type="text"
							value={searchQuery}
							onChange={(e) => onSearch(e.target.value)}
							placeholder="Search tasks..."
							className="w-48 rounded-md border border-border bg-background px-8 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
						/>
					</div>
				</div>
			</div>

			<div className="flex items-center gap-2 px-4 pb-3">
				{(["all", "active", "completed", "canceled"] as const).map((status) => (
					<button
						key={status}
						type="button"
						onClick={() => onFilterChange(status)}
						className={cn(
							"rounded-full px-3 py-1 text-xs font-medium transition-colors",
							filterStatus === status
								? "bg-primary text-primary-foreground"
								: "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground",
						)}
					>
						{status === "all"
							? "All"
							: status.charAt(0).toUpperCase() + status.slice(1)}
					</button>
				))}
			</div>
		</div>
	);
}
