"use client";

/**
 * 全局拖拽预览组件
 * Global Drag Overlay Components
 */

import { DragOverlay } from "@dnd-kit/core";
import { Calendar, Flag, Paperclip, Tag, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import type { Todo, TodoPriority, TodoStatus } from "@/lib/types";
import { cn, getPriorityLabel, getStatusLabel } from "@/lib/utils";
import type { ActiveDragState, DragData } from "./types";

// ============================================================================
// 样式辅助函数
// ============================================================================

function getStatusColor(status: TodoStatus) {
	switch (status) {
		case "active":
			return "border-primary/70 bg-primary/20 text-primary";
		case "completed":
			return "border-green-500/60 bg-green-500/12 text-green-600 dark:text-green-500";
		case "draft":
			return "border-orange-500/50 bg-orange-500/8 text-orange-600 dark:text-orange-400";
		default:
			return "border-muted-foreground/40 bg-muted/15 text-muted-foreground";
	}
}

function getPriorityBgColor(priority: TodoPriority) {
	switch (priority) {
		case "high":
			return "border-destructive/60 bg-destructive/10 text-destructive";
		case "medium":
			return "border-primary/60 bg-primary/10 text-primary";
		case "low":
			return "border-secondary/60 bg-secondary/20 text-secondary-foreground";
		default:
			return "border-muted-foreground/40 text-muted-foreground";
	}
}

function formatDate(dateString?: string) {
	if (!dateString) return null;
	const date = new Date(dateString);
	return date.toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

// ============================================================================
// Todo 卡片预览组件
// ============================================================================

interface TodoCardOverlayProps {
	todo: Todo;
	depth?: number;
}

function TodoCardOverlay({ todo, depth = 0 }: TodoCardOverlayProps) {
	const tCommon = useTranslations("common");
	const tTodoDetail = useTranslations("todoDetail");
	return (
		<div
			className="opacity-90 pointer-events-none"
			style={{ marginLeft: depth * 16 }}
		>
			<div
				className={cn(
					"todo-card group relative flex h-full flex-col gap-3 rounded-xl p-3",
					"border border-transparent transition-all duration-200",
					"bg-card shadow-lg ring-2 ring-primary/30",
				)}
			>
				<div className="flex items-start gap-2">
					<div className="w-5 shrink-0" />
					<div className="shrink-0">
						{todo.status === "completed" ? (
							<div className="flex h-5 w-5 items-center justify-center rounded-md bg-[oklch(var(--primary))] border border-[oklch(var(--primary))] shadow-inner">
								<span className="text-[10px] text-[oklch(var(--primary-foreground))] font-semibold">
									✓
								</span>
							</div>
						) : todo.status === "canceled" ? (
							<div
								className={cn(
									"flex h-5 w-5 items-center justify-center rounded-md border-2",
									"border-muted-foreground/40 bg-muted/30 text-muted-foreground/70",
								)}
							>
								<X className="h-3.5 w-3.5" strokeWidth={2.5} />
							</div>
						) : todo.status === "draft" ? (
							<div className="flex h-5 w-5 items-center justify-center rounded-md bg-orange-500 border border-orange-600 dark:border-orange-500 shadow-inner">
								<span className="text-[12px] text-white dark:text-orange-50 font-semibold">
									—
								</span>
							</div>
						) : (
							<div className="h-5 w-5 rounded-md border-2 border-muted-foreground/40" />
						)}
					</div>

					<div className="flex-1 min-w-0 space-y-1">
						<div className="flex items-start justify-between gap-2">
							<div className="min-w-0 flex-1 space-y-1">
								<h3
									className={cn(
										"text-sm font-semibold text-foreground",
										todo.status === "completed" &&
											"line-through text-muted-foreground",
									)}
								>
									{todo.name}
								</h3>
								{todo.description && (
									<p className="text-xs text-muted-foreground line-clamp-2">
										{todo.description}
									</p>
								)}
							</div>

							<div className="flex items-center gap-2 shrink-0">
								{todo.priority && todo.priority !== "none" && (
									<div
										className={cn(
											"flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
											getPriorityBgColor(todo.priority),
										)}
										title={tTodoDetail("priorityLabel", {
											priority: getPriorityLabel(todo.priority, tCommon),
										})}
									>
										<Flag className="h-3.5 w-3.5" fill="currentColor" />
										<span>{getPriorityLabel(todo.priority, tCommon)}</span>
									</div>
								)}
								{todo.status && (
									<span
										className={cn(
											"px-2 py-0.5 rounded-full text-xs font-medium border shadow-sm",
											getStatusColor(todo.status),
										)}
									>
										{getStatusLabel(todo.status, tCommon)}
									</span>
								)}
							</div>
						</div>

						<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
							{todo.deadline && (
								<div className="flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1">
									<Calendar className="h-3 w-3" />
									<span>{formatDate(todo.deadline)}</span>
								</div>
							)}

							{todo.attachments && todo.attachments.length > 0 && (
								<div className="flex items-center gap-1 rounded-md bg-muted/40 px-2 py-1">
									<Paperclip className="h-3 w-3" />
									<span>{todo.attachments.length}</span>
								</div>
							)}

							{todo.tags && todo.tags.length > 0 && (
								<div className="flex flex-wrap items-center gap-1">
									<Tag className="h-3 w-3" />
									{todo.tags.slice(0, 3).map((tag) => (
										<span
											key={tag}
											className="px-2 py-0.5 rounded-full bg-muted text-[11px] font-medium text-foreground"
										>
											{tag}
										</span>
									))}
									{todo.tags.length > 3 && (
										<span className="text-[11px] text-muted-foreground">
											+{todo.tags.length - 3}
										</span>
									)}
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

// ============================================================================
// 简化的日历 Todo 预览
// ============================================================================

interface CalendarTodoOverlayProps {
	todo: Todo;
}

function CalendarTodoOverlay({ todo }: CalendarTodoOverlayProps) {
	return (
		<div
			className={cn(
				"opacity-90 pointer-events-none flex flex-col gap-1 rounded-lg border bg-card p-2 text-xs shadow-lg ring-2 ring-primary/30",
				getStatusColor(todo.status),
			)}
		>
			<div className="flex items-center justify-between gap-2">
				<p className="truncate text-[13px] font-semibold">{todo.name}</p>
			</div>
			{todo.tags && todo.tags.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{todo.tags.slice(0, 2).map((tag) => (
						<span
							key={tag}
							className="rounded-full bg-white/50 px-2 py-0.5 text-[10px] text-muted-foreground"
						>
							{tag}
						</span>
					))}
				</div>
			)}
		</div>
	);
}

// ============================================================================
// 根据拖拽类型渲染预览
// ============================================================================

interface DragOverlayContentProps {
	data: DragData;
}

function DragOverlayContent({ data }: DragOverlayContentProps) {
	switch (data.type) {
		case "TODO_CARD": {
			const { todo, depth, sourcePanel } = data.payload;
			// 根据来源面板决定使用哪种预览样式
			if (sourcePanel === "calendar") {
				return <CalendarTodoOverlay todo={todo} />;
			}
			return <TodoCardOverlay todo={todo} depth={depth} />;
		}
		case "FILE": {
			return (
				<div className="flex items-center gap-2 rounded-lg border bg-card p-3 shadow-lg">
					<Paperclip className="h-4 w-4 text-muted-foreground" />
					<span className="text-sm font-medium">
						{data.payload.file.fileName}
					</span>
				</div>
			);
		}
		case "USER": {
			return (
				<div className="flex items-center gap-2 rounded-lg border bg-card p-3 shadow-lg">
					<div className="h-6 w-6 rounded-full bg-primary/20" />
					<span className="text-sm font-medium">{data.payload.userName}</span>
				</div>
			);
		}
		case "PANEL_HEADER": {
			// 不显示拖拽预览
			return null;
		}
		default:
			return null;
	}
}

// ============================================================================
// 全局拖拽预览组件
// ============================================================================

interface GlobalDragOverlayProps {
	activeDrag: ActiveDragState | null;
}

export function GlobalDragOverlay({ activeDrag }: GlobalDragOverlayProps) {
	// 使用 Portal 渲染到 body，避免父容器 transform 导致的坐标偏移
	if (typeof document === "undefined") {
		return null;
	}

	return createPortal(
		<DragOverlay dropAnimation={null}>
			{activeDrag ? <DragOverlayContent data={activeDrag.data} /> : null}
		</DragOverlay>,
		document.body,
	);
}
