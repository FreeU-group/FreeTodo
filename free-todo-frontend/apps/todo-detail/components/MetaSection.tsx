"use client";

import { Calendar, Flag, Tag as TagIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Todo, TodoPriority, TodoStatus } from "@/lib/types/todo";
import { cn } from "@/lib/utils";
import {
	formatDateTime,
	formatDeadlineForInput,
	getPriorityClassNames,
	getPriorityLabel,
	getStatusClassNames,
	parseInputToIso,
	priorityOptions,
	statusOptions,
} from "../helpers";

interface MetaSectionProps {
	todo: Todo;
	onStatusChange: (status: TodoStatus) => void;
	onPriorityChange: (priority: TodoPriority) => void;
	onDeadlineChange: (deadline?: string) => void;
	onTagsChange: (tags: string[]) => void;
}

export function MetaSection({
	todo,
	onStatusChange,
	onPriorityChange,
	onDeadlineChange,
	onTagsChange,
}: MetaSectionProps) {
	const statusMenuRef = useRef<HTMLDivElement | null>(null);
	const priorityMenuRef = useRef<HTMLDivElement | null>(null);

	const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
	const [isPriorityMenuOpen, setIsPriorityMenuOpen] = useState(false);
	const [isEditingDeadline, setIsEditingDeadline] = useState(false);
	const [deadlineInput, setDeadlineInput] = useState(
		formatDeadlineForInput(todo.deadline),
	);
	const [isEditingTags, setIsEditingTags] = useState(false);
	const [tagsInput, setTagsInput] = useState(todo.tags?.join(", ") ?? "");

	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (statusMenuRef.current && !statusMenuRef.current.contains(target)) {
				setIsStatusMenuOpen(false);
			}
			if (
				priorityMenuRef.current &&
				!priorityMenuRef.current.contains(target)
			) {
				setIsPriorityMenuOpen(false);
			}
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setIsStatusMenuOpen(false);
				setIsPriorityMenuOpen(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		document.addEventListener("keydown", handleKeyDown);

		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, []);

	useEffect(() => {
		setIsStatusMenuOpen(false);
		setIsPriorityMenuOpen(false);
		setIsEditingDeadline(false);
		setIsEditingTags(false);
		setDeadlineInput(formatDeadlineForInput(todo.deadline));
		setTagsInput(todo.tags?.join(", ") ?? "");
	}, [todo.deadline, todo.tags]);

	const handleDeadlineSave = () => {
		const nextDeadline = parseInputToIso(deadlineInput);
		onDeadlineChange(deadlineInput.trim() === "" ? undefined : nextDeadline);
		setIsEditingDeadline(false);
	};

	const handleDeadlineClear = () => {
		onDeadlineChange(undefined);
		setDeadlineInput("");
		setIsEditingDeadline(false);
	};

	const handleTagsSave = () => {
		const parsedTags = tagsInput
			.split(",")
			.map((t) => t.trim())
			.filter(Boolean);
		onTagsChange(parsedTags);
		setIsEditingTags(false);
	};

	const handleTagsClear = () => {
		onTagsChange([]);
		setTagsInput("");
		setIsEditingTags(false);
	};

	return (
		<div className="mb-6 text-sm text-muted-foreground">
			<div className="flex flex-wrap items-center gap-3">
				<div className="relative" ref={statusMenuRef}>
					<button
						type="button"
						onClick={() => setIsStatusMenuOpen((prev) => !prev)}
						className={cn(
							getStatusClassNames(todo.status),
							"transition-colors hover:bg-muted/40",
						)}
						aria-expanded={isStatusMenuOpen}
						aria-haspopup="listbox"
					>
						{todo.status}
					</button>
					{isStatusMenuOpen && (
						<div className="pointer-events-auto absolute z-120 mt-2 min-w-[170px] rounded-md border border-border bg-popover text-foreground shadow-lg">
							<div className="py-1" role="listbox">
								{statusOptions.map((status) => (
									<button
										key={status}
										type="button"
										onClick={() => {
											if (status !== todo.status) {
												onStatusChange(status);
											}
											setIsStatusMenuOpen(false);
										}}
										className={cn(
											"flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors",
											status === todo.status
												? "bg-muted/60 text-foreground"
												: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
										)}
										role="option"
										aria-selected={status === todo.status}
									>
										<span className={getStatusClassNames(status)}>
											{status}
										</span>
										{status === todo.status && (
											<span className="text-[11px] text-primary">当前</span>
										)}
									</button>
								))}
							</div>
						</div>
					)}
				</div>

				<div className="relative" ref={priorityMenuRef}>
					<button
						type="button"
						onClick={() => setIsPriorityMenuOpen((prev) => !prev)}
						className={cn(
							getPriorityClassNames(todo.priority ?? "none"),
							"transition-colors hover:bg-muted/40",
						)}
						aria-expanded={isPriorityMenuOpen}
						aria-haspopup="listbox"
					>
						<Flag className="h-4 w-4" fill="currentColor" aria-hidden />
						{getPriorityLabel(todo.priority ?? "none")}
					</button>
					{isPriorityMenuOpen && (
						<div className="pointer-events-auto absolute z-120 mt-2 min-w-[170px] rounded-md border border-border bg-popover text-foreground shadow-lg">
							<div className="py-1" role="listbox">
								{priorityOptions.map((priority) => (
									<button
										key={priority}
										type="button"
										onClick={() => {
											if (priority !== (todo.priority ?? "none")) {
												onPriorityChange(priority);
											}
											setIsPriorityMenuOpen(false);
										}}
										className={cn(
											"flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors",
											priority === (todo.priority ?? "none")
												? "bg-muted/60 text-foreground"
												: "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
										)}
										role="option"
										aria-selected={priority === (todo.priority ?? "none")}
									>
										<span className={getPriorityClassNames(priority)}>
											<Flag
												className="h-3.5 w-3.5"
												fill="currentColor"
												aria-hidden
											/>
											{getPriorityLabel(priority)}
										</span>
										{priority === (todo.priority ?? "none") && (
											<span className="text-[11px] text-primary">当前</span>
										)}
									</button>
								))}
							</div>
						</div>
					)}
				</div>

				<button
					type="button"
					onClick={() => {
						setDeadlineInput(formatDeadlineForInput(todo.deadline));
						setIsEditingDeadline(true);
					}}
					className="flex items-center gap-1 rounded-md border border-transparent px-2 py-1 transition-colors hover:border-border hover:bg-muted/40"
				>
					<Calendar className="h-4 w-4" />
					<span className="truncate">
						{todo.deadline ? formatDateTime(todo.deadline) : "添加截止时间"}
					</span>
				</button>

				<button
					type="button"
					onClick={() => {
						setTagsInput(todo.tags?.join(", ") ?? "");
						setIsEditingTags(true);
					}}
					className="flex items-center gap-1 rounded-md border border-transparent px-2 py-1 transition-colors hover:border-border hover:bg-muted/40"
				>
					<TagIcon className="h-4 w-4" />
					<span className="truncate">
						{todo.tags && todo.tags.length > 0
							? todo.tags.join(", ")
							: "添加标签"}
					</span>
				</button>
			</div>

			{isEditingDeadline && (
				<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground">
					<input
						type="datetime-local"
						value={deadlineInput}
						onChange={(e) => setDeadlineInput(e.target.value)}
						className="min-w-[240px] rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
					/>
					<button
						type="button"
						onClick={handleDeadlineSave}
						className="rounded-md bg-primary px-2 py-1 text-primary-foreground transition-colors hover:bg-primary/90"
					>
						保存
					</button>
					<button
						type="button"
						onClick={() => {
							setIsEditingDeadline(false);
							setDeadlineInput(formatDeadlineForInput(todo.deadline));
						}}
						className="rounded-md border border-border px-2 py-1 text-muted-foreground transition-colors hover:bg-muted/40"
					>
						取消
					</button>
					<button
						type="button"
						onClick={handleDeadlineClear}
						className="rounded-md border border-destructive/40 px-2 py-1 text-destructive transition-colors hover:bg-destructive/10"
					>
						清空
					</button>
				</div>
			)}

			{isEditingTags && (
				<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground">
					<input
						type="text"
						value={tagsInput}
						onChange={(e) => setTagsInput(e.target.value)}
						placeholder="使用逗号分隔多个标签"
						className="min-w-[240px] rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
					/>
					<button
						type="button"
						onClick={handleTagsSave}
						className="rounded-md bg-primary px-2 py-1 text-primary-foreground transition-colors hover:bg-primary/90"
					>
						保存
					</button>
					<button
						type="button"
						onClick={() => {
							setIsEditingTags(false);
							setTagsInput(todo.tags?.join(", ") ?? "");
						}}
						className="rounded-md border border-border px-2 py-1 text-muted-foreground transition-colors hover:bg-muted/40"
					>
						取消
					</button>
					<button
						type="button"
						onClick={handleTagsClear}
						className="rounded-md border border-destructive/40 px-2 py-1 text-destructive transition-colors hover:bg-destructive/10"
					>
						清空
					</button>
				</div>
			)}
		</div>
	);
}
