"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { removeTodoAttachment, uploadTodoAttachments } from "@/lib/attachments";
import { useTodoMutations, useTodos } from "@/lib/query";
import { queryKeys } from "@/lib/query/keys";
import { useTodoStore } from "@/lib/store/todo-store";
import { useUiStore } from "@/lib/store/ui-store";
import { getPositionByFeature } from "@/lib/store/ui-store/utils";
import { toastError } from "@/lib/toast";
import type { Todo, TodoAttachment } from "@/lib/types";
import { ArtifactsView } from "./components/ArtifactsView";
import { AttachmentPreviewPanel } from "./components/AttachmentPreviewPanel";
import { BackgroundSection } from "./components/BackgroundSection";
import { ChildTodoSection } from "./components/ChildTodoSection";
import { DetailHeader } from "./components/DetailHeader";
import { DetailTitle } from "./components/DetailTitle";
import { MetaSection } from "./components/MetaSection";
import { NotesEditor } from "./components/NotesEditor";

const collectChildIds = (parentId: number, allTodos: Todo[]): number[] => {
	const childIds: number[] = [];
	const children = allTodos.filter(
		(t: Todo) => t.parentTodoId === parentId,
	);
	for (const child of children) {
		childIds.push(child.id);
		childIds.push(...collectChildIds(child.id, allTodos));
	}
	return childIds;
};

export function TodoDetail() {
	const t = useTranslations("todoDetail");
	const queryClient = useQueryClient();
	// 从 TanStack Query 获取 todos 数据
	const { data: todos = [] } = useTodos();

	// 从 TanStack Query 获取 mutation 操作
	const { createTodo, updateTodo, deleteTodo, toggleTodoStatus } =
		useTodoMutations();

	// 从 Zustand 获取 UI 状态
	const { selectedTodoId, setSelectedTodoId, onTodoDeleted } = useTodoStore();
	const { panelFeatureMap, isPanelAOpen, isPanelBOpen } = useUiStore();

	// 各 section 的折叠状态
	const [showDescription, setShowDescription] = useState(false);
	const [showNotes, setShowNotes] = useState(true);
	const [showChildTodos, setShowChildTodos] = useState(true);
	const [activeView, setActiveView] = useState<"detail" | "artifacts">(
		"detail",
	);
	const [selectedAttachment, setSelectedAttachment] =
		useState<TodoAttachment | null>(null);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

	// 本地状态管理 userNotes，用于即时输入响应
	const [localUserNotes, setLocalUserNotes] = useState<string>("");
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isUpdatingRef = useRef<boolean>(false);
	const lastSyncedTodoIdRef = useRef<number | null>(null);

	const todo = useMemo(
		() =>
			selectedTodoId ? todos.find((t: Todo) => t.id === selectedTodoId) : null,
		[selectedTodoId, todos],
	);

	// 只在 todo.id 变化时同步本地状态（切换 todo 时）
	useEffect(() => {
		if (todo && todo.id !== lastSyncedTodoIdRef.current) {
			// 清理之前的防抖定时器
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
				debounceTimerRef.current = null;
			}
			setLocalUserNotes(todo.userNotes || "");
			lastSyncedTodoIdRef.current = todo.id;
			isUpdatingRef.current = false;
		}
	}, [todo, todo?.id, todo?.userNotes]);

	const childTodos = useMemo(
		() =>
			todo?.id
				? todos.filter((item: Todo) => item.parentTodoId === todo.id)
				: [],
		[todo?.id, todos],
	);

	const childIds = useMemo(
		() => (todo?.id ? collectChildIds(todo.id, todos) : []),
		[todo?.id, todos],
	);

	useEffect(() => {
		if (todo?.id == null) {
			setSelectedAttachment(null);
			return;
		}
		setSelectedAttachment(null);
	}, [todo?.id]);

	useEffect(() => {
		if (todo?.id == null) {
			setShowDeleteConfirm(false);
			return;
		}
		setShowDeleteConfirm(false);
	}, [todo?.id]);

	// 清理防抖定时器
	useEffect(() => {
		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, []);

	if (!todo) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground bg-background">
				{t("selectTodoPrompt")}
			</div>
		);
	}

	const handleNotesChange = (userNotes: string) => {
		// 立即更新本地状态，保证输入流畅
		setLocalUserNotes(userNotes);

		// 标记正在更新
		isUpdatingRef.current = true;

		// 清除之前的防抖定时器
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
		}

		// 设置新的防抖定时器，延迟更新服务器
		debounceTimerRef.current = setTimeout(async () => {
			try {
				await updateTodo(todo.id, { userNotes });
				// 更新成功后，标记更新完成
				isUpdatingRef.current = false;
			} catch (err) {
				console.error("Failed to update notes:", err);
				// 如果更新失败，恢复本地状态到服务器值
				setLocalUserNotes(todo.userNotes || "");
				isUpdatingRef.current = false;
			}
		}, 500);
	};

	const handleNotesBlur = async () => {
		// 失去焦点时，立即同步状态到服务器
		// 如果有待处理的防抖更新，先取消它并立即执行
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current);
			debounceTimerRef.current = null;
		}

		// 如果本地状态与服务器状态不同，立即更新
		if (localUserNotes !== (todo.userNotes || "")) {
			try {
				isUpdatingRef.current = true;
				await updateTodo(todo.id, { userNotes: localUserNotes });
				isUpdatingRef.current = false;
			} catch (err) {
				console.error("Failed to update notes on blur:", err);
				// 如果更新失败，恢复本地状态到服务器值
				setLocalUserNotes(todo.userNotes || "");
				isUpdatingRef.current = false;
			}
		}
	};

	const handleDescriptionChange = async (description: string) => {
		try {
			await updateTodo(todo.id, { description });
		} catch (err) {
			console.error("Failed to update description:", err);
		}
	};

	const handleNameChange = async (name: string) => {
		try {
			await updateTodo(todo.id, { name });
		} catch (err) {
			console.error("Failed to update name:", err);
		}
	};

	const handleToggleComplete = async () => {
		try {
			await toggleTodoStatus(todo.id);
		} catch (err) {
			console.error("Failed to toggle status:", err);
		}
	};

	const handleDelete = async () => {
		try {
			const allIdsToDelete = [todo.id, ...childIds];

			await deleteTodo(todo.id);
			onTodoDeleted(allIdsToDelete);
			setSelectedTodoId(null);
		} catch (err) {
			console.error("Failed to delete todo:", err);
		}
	};

	const handleUploadAttachments = async (files: File[]) => {
		if (!todo) return;
		setActiveView("artifacts");
		try {
			await uploadTodoAttachments(todo.id, files);
			queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
		} catch (err) {
			console.error("Failed to upload attachments:", err);
			toastError(t("uploadFailed"));
		}
	};

	const handleRemoveAttachment = async (attachmentId: number) => {
		if (!todo) return;
		try {
			await removeTodoAttachment(todo.id, attachmentId);
			if (selectedAttachment?.id === attachmentId) {
				setSelectedAttachment(null);
			}
			queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
		} catch (err) {
			console.error("Failed to remove attachment:", err);
			toastError(t("removeAttachmentFailed"));
		}
	};

	const handleSelectAttachment = (attachment: TodoAttachment) => {
		setActiveView("artifacts");
		setSelectedAttachment(attachment);
	};

	const handleCreateChild = async (name: string) => {
		try {
			await createTodo({
				name,
				parentTodoId: todo.id,
			});
		} catch (err) {
			console.error("Failed to create child todo:", err);
		}
	};

	const handleDeleteRequest = () => {
		setShowDeleteConfirm(true);
	};

	const handleDeleteConfirm = async () => {
		setShowDeleteConfirm(false);
		await handleDelete();
	};

	if (!todo) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground bg-background">
				{t("selectTodoPrompt")}
			</div>
		);
	}

	const detailPosition = getPositionByFeature("todoDetail", panelFeatureMap);
	const leftNeighbor =
		detailPosition === "panelC"
			? "panelB"
			: detailPosition === "panelB"
				? "panelA"
				: null;
	const leftNeighborOpen =
		leftNeighbor === "panelA"
			? isPanelAOpen
			: leftNeighbor === "panelB"
				? isPanelBOpen
				: false;
	const leftNeighborFeature = leftNeighbor
		? panelFeatureMap[leftNeighbor]
		: null;
	const previewPlacement =
		leftNeighborOpen && leftNeighborFeature === "chat" ? "left" : "right";

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			<DetailHeader
				onToggleComplete={handleToggleComplete}
				onDelete={handleDeleteRequest}
				activeView={activeView}
				onViewChange={setActiveView}
			/>

			{showDeleteConfirm && (
				<div className="mx-4 mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="min-w-[200px]">
							<p className="text-sm font-semibold text-foreground">
								{t("deleteConfirmTitle")}
							</p>
							<p className="mt-1 text-xs text-muted-foreground">
								{childIds.length > 0
									? t("deleteConfirmWithChildren", {
											count: childIds.length,
										})
									: t("deleteConfirmDescription")}
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => setShowDeleteConfirm(false)}
							>
								{t("deleteConfirmCancel")}
							</Button>
							<Button
								variant="destructive"
								size="sm"
								onClick={handleDeleteConfirm}
							>
								{t("deleteConfirmDelete")}
							</Button>
						</div>
					</div>
				</div>
			)}

			<div className="flex-1 overflow-y-auto px-4 py-6">
				{activeView === "detail" ? (
					<>
						<DetailTitle name={todo.name} onNameChange={handleNameChange} />

						<MetaSection
							todo={todo}
							onStatusChange={(status) => updateTodo(todo.id, { status })}
							onPriorityChange={(priority) => updateTodo(todo.id, { priority })}
							onTagsChange={(tags) => updateTodo(todo.id, { tags })}
							onFolderChange={(folder) =>
								updateTodo(todo.id, { categories: folder ?? undefined })
							}
							onScheduleChange={(input) => updateTodo(todo.id, input)}
						/>

						<BackgroundSection
							description={todo.description}
							show={showDescription}
							onToggle={() => setShowDescription((prev) => !prev)}
							onDescriptionChange={handleDescriptionChange}
						/>

						<NotesEditor
							value={localUserNotes}
							show={showNotes}
							onToggle={() => setShowNotes((prev) => !prev)}
							onChange={handleNotesChange}
							onBlur={handleNotesBlur}
						/>

						<ChildTodoSection
							childTodos={childTodos}
							allTodos={todos}
							show={showChildTodos}
							onToggle={() => setShowChildTodos((prev) => !prev)}
							onSelectTodo={setSelectedTodoId}
							onCreateChild={handleCreateChild}
							onToggleStatus={toggleTodoStatus}
							onUpdateTodo={updateTodo}
						/>
					</>
				) : (
					<div className="flex h-full min-h-0 gap-4">
						{previewPlacement === "left" && selectedAttachment && (
							<AttachmentPreviewPanel
								attachment={selectedAttachment}
								onClose={() => setSelectedAttachment(null)}
							/>
						)}
						<ArtifactsView
							todo={todo}
							attachments={todo.attachments ?? []}
							onUpload={handleUploadAttachments}
							onRemove={handleRemoveAttachment}
							onSelectAttachment={handleSelectAttachment}
							onShowDetail={() => setActiveView("detail")}
						/>
						{previewPlacement === "right" && selectedAttachment && (
							<AttachmentPreviewPanel
								attachment={selectedAttachment}
								onClose={() => setSelectedAttachment(null)}
							/>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
