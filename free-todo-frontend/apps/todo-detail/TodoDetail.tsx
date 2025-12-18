"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTodoMutations, useTodos } from "@/lib/query";
import { useTodoStore } from "@/lib/store/todo-store";
import type { Todo } from "@/lib/types/todo";
import { ChildTodoSection } from "./components/ChildTodoSection";
import { DescriptionSection } from "./components/DescriptionSection";
import { DetailHeader } from "./components/DetailHeader";
import { DetailTitle } from "./components/DetailTitle";
import { MetaSection } from "./components/MetaSection";
import { NotesEditor } from "./components/NotesEditor";
import { useNotesAutosize } from "./hooks/useNotesAutosize";

export function TodoDetail() {
	// 从 TanStack Query 获取 todos 数据
	const { data: todos = [] } = useTodos();

	// 从 TanStack Query 获取 mutation 操作
	const { createTodo, updateTodo, deleteTodo, toggleTodoStatus } =
		useTodoMutations();

	// 从 Zustand 获取 UI 状态
	const { selectedTodoId, setSelectedTodoId, onTodoDeleted } = useTodoStore();

	const [showDescription, setShowDescription] = useState(true);

	// 本地状态管理 userNotes，用于即时输入响应
	const [localUserNotes, setLocalUserNotes] = useState<string>("");
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isUpdatingRef = useRef<boolean>(false);
	const lastSyncedTodoIdRef = useRef<string | null>(null);

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

	const { notesRef, adjustNotesHeight } = useNotesAutosize([
		todo?.id,
		localUserNotes,
	]);

	useEffect(() => {
		adjustNotesHeight();
	}, [adjustNotesHeight]);

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
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				请选择一个待办事项查看详情
			</div>
		);
	}

	const handleNotesChange = (userNotes: string) => {
		// 立即更新本地状态，保证输入流畅
		setLocalUserNotes(userNotes);
		requestAnimationFrame(adjustNotesHeight);

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
			// 递归查找所有子任务 ID
			const findAllChildIds = (
				parentId: string,
				allTodos: Todo[],
			): string[] => {
				const childIds: string[] = [];
				const children = allTodos.filter(
					(t: Todo) => t.parentTodoId === parentId,
				);
				for (const child of children) {
					childIds.push(child.id);
					childIds.push(...findAllChildIds(child.id, allTodos));
				}
				return childIds;
			};

			const allIdsToDelete = [todo.id, ...findAllChildIds(todo.id, todos)];

			await deleteTodo(todo.id);
			onTodoDeleted(allIdsToDelete);
			setSelectedTodoId(null);
		} catch (err) {
			console.error("Failed to delete todo:", err);
		}
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

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			<DetailHeader
				onToggleComplete={handleToggleComplete}
				onDelete={handleDelete}
			/>

			<div className="flex-1 overflow-y-auto px-4 py-6">
				<DetailTitle
					name={todo.name}
					showDescription={showDescription}
					onToggleDescription={() => setShowDescription((prev) => !prev)}
					onNameChange={handleNameChange}
				/>

				<MetaSection
					todo={todo}
					onStatusChange={(status) => updateTodo(todo.id, { status })}
					onPriorityChange={(priority) => updateTodo(todo.id, { priority })}
					onDeadlineChange={(deadline) =>
						updateTodo(todo.id, { deadline: deadline ?? undefined })
					}
					onTagsChange={(tags) => updateTodo(todo.id, { tags })}
				/>

				{showDescription && (
					<DescriptionSection
						description={todo.description}
						attachments={todo.attachments}
						onDescriptionChange={handleDescriptionChange}
					/>
				)}

				<NotesEditor
					value={localUserNotes}
					onChange={handleNotesChange}
					onBlur={handleNotesBlur}
					notesRef={notesRef}
					adjustHeight={adjustNotesHeight}
				/>

				<ChildTodoSection
					childTodos={childTodos}
					allTodos={todos}
					onSelectTodo={setSelectedTodoId}
					onCreateChild={handleCreateChild}
				/>
			</div>
		</div>
	);
}
