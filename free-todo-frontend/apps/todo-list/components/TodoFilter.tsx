"use client";

import { ChevronDown, Filter, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { PanelActionButton } from "@/components/common/layout/PanelHeader";
import type { Todo, TodoStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export type DueTimeFilter =
	| "all"
	| "overdue"
	| "today"
	| "tomorrow"
	| "thisWeek"
	| "thisMonth"
	| "future";

export interface TodoFilterState {
	status: TodoStatus | "all";
	tag: string | "all";
	dueTime: DueTimeFilter;
}

interface TodoFilterProps {
	todos: Todo[];
	filter: TodoFilterState;
	onFilterChange: (filter: TodoFilterState) => void;
}

export function TodoFilter({ todos, filter, onFilterChange }: TodoFilterProps) {
	const tTodoList = useTranslations("todoList");
	const [isOpen, setIsOpen] = useState(false);
	const filterContainerRef = useRef<HTMLDivElement>(null);

	// Extract all unique tags from todos
	const allTags = Array.from(
		new Set(todos.flatMap((todo) => todo.tags || [])),
	).sort();

	// Check if any filter is active
	const isFilterActive =
		filter.status !== "all" || filter.tag !== "all" || filter.dueTime !== "all";

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				filterContainerRef.current &&
				!filterContainerRef.current.contains(event.target as Node)
			) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
			return () => {
				document.removeEventListener("mousedown", handleClickOutside);
			};
		}
	}, [isOpen]);

	const handleStatusChange = (status: TodoStatus | "all") => {
		onFilterChange({ ...filter, status });
	};

	const handleTagChange = (tag: string | "all") => {
		onFilterChange({ ...filter, tag });
	};

	const handleDueTimeChange = (dueTime: DueTimeFilter) => {
		onFilterChange({ ...filter, dueTime });
	};

	const handleClearFilters = () => {
		onFilterChange({
			status: "all",
			tag: "all",
			dueTime: "all",
		});
	};

	// Quick time filter options
	const quickTimeOptions: { value: DueTimeFilter; label: string }[] = [
		{ value: "today", label: tTodoList("dueTimeToday") },
		{ value: "tomorrow", label: tTodoList("dueTimeTomorrow") },
		{ value: "thisWeek", label: tTodoList("dueTimeThisWeek") },
	];

	// All time filter options for dropdown
	const allTimeOptions: { value: DueTimeFilter; label: string }[] = [
		{ value: "all", label: tTodoList("filterAll") },
		{ value: "overdue", label: tTodoList("dueTimeOverdue") },
		{ value: "today", label: tTodoList("dueTimeToday") },
		{ value: "tomorrow", label: tTodoList("dueTimeTomorrow") },
		{ value: "thisWeek", label: tTodoList("dueTimeThisWeek") },
		{ value: "thisMonth", label: tTodoList("dueTimeThisMonth") },
		{ value: "future", label: tTodoList("dueTimeFuture") },
	];

	// Status options
	const statusOptions: { value: TodoStatus | "all"; label: string }[] = [
		{ value: "all", label: tTodoList("filterAll") },
		{ value: "active", label: tTodoList("statusActive") },
		{ value: "completed", label: tTodoList("statusCompleted") },
		{ value: "canceled", label: tTodoList("statusCanceled") },
		{ value: "draft", label: tTodoList("statusDraft") },
	];

	// Common status options for quick selection
	const commonStatusOptions: { value: TodoStatus; label: string }[] = [
		{ value: "active", label: tTodoList("statusActive") },
		{ value: "completed", label: tTodoList("statusCompleted") },
	];

	return (
		<div ref={filterContainerRef} className="relative">
			<PanelActionButton
				variant="default"
				icon={Filter}
				onClick={() => setIsOpen(!isOpen)}
				iconOverrides={{
					color: isFilterActive ? "text-primary" : "text-muted-foreground",
				}}
				buttonOverrides={{
					hoverTextColor: "hover:text-foreground",
				}}
				aria-label={tTodoList("filter")}
			/>
			{isOpen && (
				<div className="absolute right-0 top-8 z-50 w-54 rounded-lg border border-border bg-background shadow-lg p-4 space-y-4">
					{/* Due Time Quick Filters */}
					<div className="space-y-2">
						<div className="text-xs font-semibold text-foreground uppercase tracking-wide">
							{tTodoList("filterDueTime")}
						</div>
						<div className="flex flex-wrap gap-2">
							{quickTimeOptions.map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => handleDueTimeChange(option.value)}
									className={cn(
										"px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
										filter.dueTime === option.value
											? "bg-primary text-primary-foreground shadow-sm"
											: "bg-muted/50 text-foreground hover:bg-muted hover:text-foreground",
									)}
								>
									{option.label}
								</button>
							))}
						</div>
						{/* Dropdown for all options */}
						<div className="relative">
							<select
								value={filter.dueTime}
								onChange={(e) =>
									handleDueTimeChange(e.target.value as DueTimeFilter)
								}
								className="w-full h-8 appearance-none rounded-md border border-border bg-background px-2.5 pr-8 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
							>
								{allTimeOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
							<ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
						</div>
					</div>

					{/* Status Quick Filters */}
					<div className="space-y-2">
						<div className="text-xs font-semibold text-foreground uppercase tracking-wide">
							{tTodoList("filterStatus")}
						</div>
						<div className="flex flex-wrap gap-2">
							{commonStatusOptions.map((option) => (
								<button
									key={option.value}
									type="button"
									onClick={() => handleStatusChange(option.value)}
									className={cn(
										"px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
										filter.status === option.value
											? "bg-primary text-primary-foreground shadow-sm"
											: "bg-muted/50 text-foreground hover:bg-muted hover:text-foreground",
									)}
								>
									{option.label}
								</button>
							))}
						</div>
						{/* Dropdown for all status options */}
						<div className="relative">
							<select
								value={filter.status}
								onChange={(e) =>
									handleStatusChange(e.target.value as TodoStatus | "all")
								}
								className="w-full h-8 appearance-none rounded-md border border-border bg-background px-2.5 pr-8 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
							>
								{statusOptions.map((option) => (
									<option key={option.value} value={option.value}>
										{option.label}
									</option>
								))}
							</select>
							<ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
						</div>
					</div>

					{/* Tag Filter */}
					{allTags.length > 0 && (
						<div className="space-y-2">
							<div className="text-xs font-semibold text-foreground uppercase tracking-wide">
								{tTodoList("filterTag")}
							</div>
							<div className="relative">
								<select
									value={filter.tag}
									onChange={(e) => handleTagChange(e.target.value)}
									className="w-full h-8 appearance-none rounded-md border border-border bg-background px-2.5 pr-8 text-xs text-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
								>
									<option value="all">{tTodoList("filterAll")}</option>
									{allTags.map((tag) => (
										<option key={tag} value={tag}>
											{tag}
										</option>
									))}
								</select>
								<ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
							</div>
						</div>
					)}

					{/* Clear Filters Button */}
					{isFilterActive && (
						<button
							type="button"
							onClick={handleClearFilters}
							className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md border border-border bg-background text-xs font-medium text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
						>
							<X className="h-3.5 w-3.5" />
							{tTodoList("clearFilters")}
						</button>
					)}
				</div>
			)}
		</div>
	);
}
