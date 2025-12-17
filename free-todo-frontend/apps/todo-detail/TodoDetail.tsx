"use client";

import { useEffect, useMemo, useState } from "react";
import { useTodoMutations, useTodos } from "@/lib/query";
import { useTodoStore } from "@/lib/store/todo-store";
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

	const todo = useMemo(
		() => (selectedTodoId ? todos.find((t) => t.id === selectedTodoId) : null),
		[selectedTodoId, todos],
	);

	const childTodos = useMemo(
		() =>
			todo?.id ? todos.filter((item) => item.parentTodoId === todo.id) : [],
		[todo?.id, todos],
	);

	const { notesRef, adjustNotesHeight } = useNotesAutosize([
		todo?.id,
		todo?.userNotes,
	]);

	useEffect(() => {
		adjustNotesHeight();
	}, [adjustNotesHeight]);

	if (!todo) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				请选择一个待办事项查看详情
			</div>
		);
	}

	const handleNotesChange = async (userNotes: string) => {
		try {
			await updateTodo(todo.id, { userNotes });
			requestAnimationFrame(adjustNotesHeight);
		} catch (err) {
			console.error("Failed to update notes:", err);
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
				allTodos: typeof todos,
			): string[] => {
				const childIds: string[] = [];
				const children = allTodos.filter((t) => t.parentTodoId === parentId);
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
					value={todo.userNotes || ""}
					onChange={handleNotesChange}
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
