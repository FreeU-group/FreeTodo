"use client";

import {
	Calendar,
	Filter,
	FolderOpen,
	Pin,
	PinOff,
	Tag,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useMemo } from "react";
import type { Todo, TodoStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { getTodoFolder, TODO_FOLDER_NONE } from "@/lib/utils/todoFolder";
import type { DueTimeFilter, TodoFilterState } from "./TodoFilter";

type SidebarMode = "pinned" | "floating";

interface TodoSidebarProps {
	mode: SidebarMode;
	isOpen: boolean;
	todos: Todo[];
	filter: TodoFilterState;
	onFilterChange: (filter: TodoFilterState) => void;
	isPinned: boolean;
	onTogglePinned: () => void;
	sidebarRef?: React.RefObject<HTMLElement | null>;
}

const statusOptions: { value: TodoStatus | "all"; labelKey: string }[] = [
	{ value: "all", labelKey: "filterAll" },
	{ value: "active", labelKey: "statusActive" },
	{ value: "completed", labelKey: "statusCompleted" },
	{ value: "canceled", labelKey: "statusCanceled" },
	{ value: "draft", labelKey: "statusDraft" },
];

const dueTimeOptions: { value: DueTimeFilter; labelKey: string }[] = [
	{ value: "all", labelKey: "filterAll" },
	{ value: "overdue", labelKey: "dueTimeOverdue" },
	{ value: "today", labelKey: "dueTimeToday" },
	{ value: "tomorrow", labelKey: "dueTimeTomorrow" },
	{ value: "thisWeek", labelKey: "dueTimeThisWeek" },
	{ value: "thisMonth", labelKey: "dueTimeThisMonth" },
	{ value: "future", labelKey: "dueTimeFuture" },
];

export function TodoSidebar({
	mode,
	isOpen,
	todos,
	filter,
	onFilterChange,
	isPinned,
	onTogglePinned,
	sidebarRef,
}: TodoSidebarProps) {
	const tTodoList = useTranslations("todoList");

	const { folderCounts, tagCounts } = useMemo(() => {
		const folders = new Map<string, number>();
		const tags = new Map<string, number>();

		todos.forEach((todo) => {
			const folder = getTodoFolder(todo) ?? TODO_FOLDER_NONE;
			folders.set(folder, (folders.get(folder) ?? 0) + 1);

			(todo.tags ?? []).forEach((tag) => {
				tags.set(tag, (tags.get(tag) ?? 0) + 1);
			});
		});

		return { folderCounts: folders, tagCounts: tags };
	}, [todos]);

	const folderItems = useMemo(() => {
		const ordered = Array.from(folderCounts.entries())
			.filter(([key]) => key !== TODO_FOLDER_NONE)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, count]) => ({ key, count }));

		const inboxCount = folderCounts.get(TODO_FOLDER_NONE) ?? 0;
		const showInbox =
			inboxCount > 0 || filter.folder === TODO_FOLDER_NONE || todos.length === 0;

		return {
			allCount: todos.length,
			folders: ordered,
			inboxCount,
			showInbox,
		};
	}, [folderCounts, filter.folder, todos.length]);

	const tagItems = useMemo(() => {
		return Array.from(tagCounts.entries())
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, count]) => ({ key, count }));
	}, [tagCounts]);

	const isFilterActive =
		filter.status !== "all" ||
		filter.folder !== "all" ||
		filter.tag !== "all" ||
		filter.dueTime !== "all";

	const baseClasses =
		"flex h-full w-64 flex-col overflow-hidden border border-border/70 bg-background";

	const modeClasses =
		mode === "pinned"
			? "border-0 border-r"
			: "absolute left-3 top-3 bottom-3 z-30 rounded-2xl shadow-lg bg-background/95 backdrop-blur";

	const visibilityClasses =
		mode === "floating"
			? isOpen
				? "translate-x-0 opacity-100"
				: "-translate-x-4 opacity-0 pointer-events-none"
			: "";

	return (
		<aside
			ref={sidebarRef}
			aria-hidden={mode === "floating" && !isOpen}
			className={cn(
				baseClasses,
				modeClasses,
				"transition-all duration-200 ease-out",
				visibilityClasses,
			)}
		>
			<div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
				<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					<Filter className="h-3.5 w-3.5" />
					<span>{tTodoList("sidebarTitle")}</span>
				</div>
				<button
					type="button"
					onClick={onTogglePinned}
					aria-pressed={isPinned}
					aria-label={
						isPinned
							? tTodoList("floatSidebar")
							: tTodoList("pinSidebar")
					}
					title={
						isPinned
							? tTodoList("floatSidebar")
							: tTodoList("pinSidebar")
					}
					className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
				>
					{isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
				</button>
			</div>

			<div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
				<div className="space-y-2">
					<SidebarSectionTitle
						icon={<FolderOpen className="h-3.5 w-3.5" />}
						title={tTodoList("folders")}
					/>
					<div className="space-y-1">
						<SidebarItem
							label={tTodoList("filterAll")}
							count={folderItems.allCount}
							active={filter.folder === "all"}
							onClick={() =>
								onFilterChange({
									...filter,
									folder: "all",
								})
							}
						/>
						{folderItems.showInbox && (
							<SidebarItem
								label={tTodoList("folderInbox")}
								count={folderItems.inboxCount}
								active={filter.folder === TODO_FOLDER_NONE}
								onClick={() =>
									onFilterChange({
										...filter,
										folder: TODO_FOLDER_NONE,
									})
								}
							/>
						)}
						{folderItems.folders.map((item) => (
							<SidebarItem
								key={item.key}
								label={item.key}
								count={item.count}
								active={filter.folder === item.key}
								onClick={() =>
									onFilterChange({
										...filter,
										folder: item.key,
									})
								}
							/>
						))}
					</div>
				</div>

				<div className="space-y-2">
					<SidebarSectionTitle
						icon={<Tag className="h-3.5 w-3.5" />}
						title={tTodoList("filterTag")}
					/>
					{tagItems.length > 0 ? (
						<div className="space-y-1">
							<SidebarItem
								label={tTodoList("filterAll")}
								count={tagItems.reduce((sum, item) => sum + item.count, 0)}
								active={filter.tag === "all"}
								onClick={() =>
									onFilterChange({
										...filter,
										tag: "all",
									})
								}
							/>
							{tagItems.map((item) => (
								<SidebarItem
									key={item.key}
									label={item.key}
									count={item.count}
									active={filter.tag === item.key}
									onClick={() =>
										onFilterChange({
											...filter,
											tag: item.key,
										})
									}
								/>
							))}
						</div>
					) : (
						<div className="rounded-md border border-dashed border-border/70 px-2 py-2 text-xs text-muted-foreground">
							{tTodoList("noTags")}
						</div>
					)}
				</div>

				<div className="space-y-2">
					<SidebarSectionTitle
						icon={<Calendar className="h-3.5 w-3.5" />}
						title={tTodoList("filterDueTime")}
					/>
					<div className="flex flex-wrap gap-2">
						{dueTimeOptions.map((option) => (
							<SidebarChip
								key={option.value}
								active={filter.dueTime === option.value}
								onClick={() =>
									onFilterChange({
										...filter,
										dueTime: option.value,
									})
								}
							>
								{tTodoList(option.labelKey)}
							</SidebarChip>
						))}
					</div>
				</div>

				<div className="space-y-2">
					<SidebarSectionTitle
						icon={<Filter className="h-3.5 w-3.5" />}
						title={tTodoList("filterStatus")}
					/>
					<div className="flex flex-wrap gap-2">
						{statusOptions.map((option) => (
							<SidebarChip
								key={option.value}
								active={filter.status === option.value}
								onClick={() =>
									onFilterChange({
										...filter,
										status: option.value,
									})
								}
							>
								{tTodoList(option.labelKey)}
							</SidebarChip>
						))}
					</div>
				</div>

				{isFilterActive && (
					<button
						type="button"
						onClick={() =>
							onFilterChange({
								status: "all",
								folder: "all",
								tag: "all",
								dueTime: "all",
							})
						}
						className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
					>
						{tTodoList("clearFilters")}
					</button>
				)}
			</div>
		</aside>
	);
}

function SidebarSectionTitle({
	icon,
	title,
}: {
	icon: ReactNode;
	title: string;
}) {
	return (
		<div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
			{icon}
			<span>{title}</span>
		</div>
	);
}

function SidebarItem({
	label,
	count,
	active,
	onClick,
}: {
	label: string;
	count: number;
	active: boolean;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm transition-colors",
				active
					? "bg-primary text-primary-foreground shadow-sm"
					: "text-foreground hover:bg-muted/50",
			)}
		>
			<span className="truncate">{label}</span>
			<span
				className={cn(
					"text-[11px]",
					active ? "text-primary-foreground/80" : "text-muted-foreground",
				)}
			>
				{count}
			</span>
		</button>
	);
}

function SidebarChip({
	active,
	onClick,
	children,
}: {
	active: boolean;
	onClick: () => void;
	children: ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"rounded-full border px-3 py-1 text-xs font-medium transition-colors",
				active
					? "border-primary/40 bg-primary text-primary-foreground shadow-sm"
					: "border-border bg-muted/40 text-foreground hover:bg-muted/60",
			)}
		>
			{children}
		</button>
	);
}
