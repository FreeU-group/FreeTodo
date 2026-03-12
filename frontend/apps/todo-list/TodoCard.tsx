"use client";

import { CSS } from "@dnd-kit/utilities";
import { Hammer, Paperclip, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import type React from "react";
import { useMemo } from "react";
import { TodoContextMenu } from "@/components/common/context-menu/TodoContextMenu";
import { useTodos } from "@/lib/query";
import { useTodoStore } from "@/lib/store/todo-store";
import type { Todo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TodoCardCheckbox } from "./components/TodoCardCheckbox";
import { TodoCardChildForm } from "./components/TodoCardChildForm";
import { TodoCardDropZone } from "./components/TodoCardDropZone";
import { TodoCardExpandButton } from "./components/TodoCardExpandButton";
import { TodoCardMetadata } from "./components/TodoCardMetadata";
import { TodoCardName } from "./components/TodoCardName";
import { useTodoCardDrag } from "./hooks/useTodoCardDrag";
import { useTodoCardHandlers } from "./hooks/useTodoCardHandlers";
import { useTodoCardState } from "./hooks/useTodoCardState";

export interface TodoCardProps {
	todo: Todo;
	depth?: number; // 树形结构的层级深度
	isDragging?: boolean;
	selected?: boolean;
	isOverlay?: boolean;
	hasMultipleSelection?: boolean; // 是否有多个 todo 被选中
	onSelect: (e: React.MouseEvent<HTMLDivElement>) => void;
	onSelectSingle: () => void;
}

export function TodoCard({
	todo,
	depth = 0,
	isDragging,
	selected,
	isOverlay,
	hasMultipleSelection = false,
	onSelect,
	onSelectSingle,
}: TodoCardProps) {
	const tTodoDetail = useTranslations("todoDetail");
	// 从 TanStack Query 获取 todos 数据（用于检查是否有子任务）
	const { data: todos = [] } = useTodos();

	// 从 Zustand 获取 UI 状态操作
	const { toggleTodoExpanded, isTodoExpanded } = useTodoStore();

	// 使用自定义 hooks
	const state = useTodoCardState(todo);
	const drag = useTodoCardDrag({ todo, depth, isOverlay: isOverlay ?? false });
	const handlers = useTodoCardHandlers({
		todo,
		setIsAddingChild: state.setIsAddingChild,
		childName: state.childName,
		setChildName: state.setChildName,
		setIsEditingName: state.setIsEditingName,
		editingName: state.editingName,
		setEditingName: state.setEditingName,
	});

	// 检查是否有子任务
	const hasChildren = useMemo(() => {
		return todos.some((t: Todo) => t.parentTodoId === todo.id);
	}, [todos, todo.id]);

	const isExpanded = isTodoExpanded(todo.id);

	const style = !isOverlay
		? {
				transform: CSS.Transform.toString(drag.transform),
				transition: drag.isSortableDragging ? "none" : drag.transition,
				opacity: drag.isSortableDragging ? 0.5 : 1,
			}
		: undefined;

	const cardContent = (
		<div
			{...(!isOverlay ? { ...drag.attributes, ...drag.listeners } : {})}
			ref={drag.setNodeRef}
			style={style}
			role="button"
			tabIndex={0}
			onClick={onSelect}
			onMouseDown={(e) => {
				// 阻止文本选择（当按住 Shift 或 Ctrl/Cmd 进行多选时）
				if (e.shiftKey || e.metaKey || e.ctrlKey) {
					e.preventDefault();
				}
			}}
			data-state={selected ? "selected" : "default"}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onSelectSingle();
				}
			}}
			className={cn(
				"todo-card group relative flex max-h-32 flex-col justify-start gap-1 rounded-lg px-1 py-2 cursor-pointer",
				"border border-transparent transition-all duration-200",
				"bg-card dark:bg-background hover:bg-muted/40 dark:hover:bg-accent/70",
				"select-none", // 阻止文本选择
				selected &&
					"bg-[oklch(var(--primary-weak))] dark:bg-primary/17 border-[oklch(var(--primary-border)/0.3)] dark:border-primary/30",
				selected &&
					"hover:bg-[oklch(var(--primary-weak-hover))] dark:hover:bg-primary/30",
				isDragging && "ring-2 ring-primary/30",
			)}
		>
			<div className="flex items-start gap-1">
				<TodoCardExpandButton
					hasChildren={hasChildren}
					isExpanded={isExpanded}
					onToggle={() => toggleTodoExpanded(todo.id)}
				/>

				<div className="mt-1">
					<TodoCardCheckbox
						todo={todo}
						onToggle={handlers.handleToggleStatus}
					/>
				</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-start justify-between gap-2">
						<div className="min-w-0 flex-1">
							<TodoCardName
								todo={todo}
								isEditing={state.isEditingName}
								editingName={state.editingName}
								nameInputRef={state.nameInputRef}
								onStartEdit={handlers.handleStartEditName}
								onSave={handlers.handleSaveName}
								onCancel={handlers.handleCancelEditName}
								onChange={state.setEditingName}
							/>
						</div>
						{/* AI 操作按钮组 - hover时显示 */}
						<div className="opacity-0 group-hover:opacity-100 flex items-center gap-0.5 shrink-0 self-start mt-0.5">
							{/* AI 拆解任务按钮 */}
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									handlers.handleStartBreakdown();
								}}
								className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-muted/50 transition-all"
								aria-label={tTodoDetail("useAiPlan")}
								title={tTodoDetail("useAiPlanTitle")}
							>
								<Hammer className="h-4 w-4 text-primary" />
							</button>
							{/* 获取建议按钮 */}
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									handlers.handleGetAdvice();
								}}
								className="flex h-5 w-5 items-center justify-center rounded-md hover:bg-muted/50 transition-all"
								aria-label={tTodoDetail("getAdvice")}
								title={tTodoDetail("getAdviceTitle")}
							>
								<Sparkles className="h-4 w-4 text-amber-500" />
							</button>
						</div>

						<div className="flex items-center gap-2 shrink-0">
							{todo.attachments && todo.attachments.length > 0 && (
								<span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground bg-muted/50">
									<Paperclip className="h-3 w-3" />
									{todo.attachments.length}
								</span>
							)}
						</div>
					</div>

					<TodoCardMetadata todo={todo} />
				</div>
			</div>

			{state.isAddingChild && (
				<TodoCardChildForm
					childName={state.childName}
					childInputRef={state.childInputRef}
					onChange={state.setChildName}
					onSubmit={handlers.handleCreateChild}
					onCancel={() => {
						state.setIsAddingChild(false);
						state.setChildName("");
					}}
				/>
			)}

			{/* 放置区域：设为子任务 */}
			{drag.showNestDropZone && (
				<TodoCardDropZone droppable={drag.nestDroppable} />
			)}
		</div>
	);

	// 如果是拖拽覆盖层，不需要右键菜单
	if (isOverlay) {
		return cardContent;
	}

	// 如果有多选，不显示单个 todo 的右键菜单（由 MultiTodoContextMenu 处理）
	if (hasMultipleSelection) {
		return cardContent;
	}

	return (
		<TodoContextMenu
			todoId={todo.id}
			onAddChild={handlers.handleAddChildFromMenu}
			onContextMenuOpen={onSelectSingle}
		>
			{cardContent}
		</TodoContextMenu>
	);
}
