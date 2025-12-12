"use client";

import { useEffect, useMemo, useState } from "react";
import { useTodoStore } from "@/lib/store/todo-store";
import { ChildTodoSection } from "./components/ChildTodoSection";
import { DescriptionSection } from "./components/DescriptionSection";
import { DetailHeader } from "./components/DetailHeader";
import { DetailTitle } from "./components/DetailTitle";
import { MetaSection } from "./components/MetaSection";
import { NotesEditor } from "./components/NotesEditor";
import { useNotesAutosize } from "./hooks/useNotesAutosize";

export function TodoDetail() {
	const {
		todos,
		selectedTodoId,
		updateTodo,
		toggleTodoStatus,
		deleteTodo,
		setSelectedTodoId,
		addTodo,
	} = useTodoStore();

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

	const handleNotesChange = (userNotes: string) => {
		updateTodo(todo.id, { userNotes });
		requestAnimationFrame(adjustNotesHeight);
	};

	return (
		<div className="flex h-full flex-col overflow-hidden bg-background">
			<DetailHeader
				onToggleComplete={() => toggleTodoStatus(todo.id)}
				onDelete={() => {
					deleteTodo(todo.id);
					setSelectedTodoId(null);
				}}
			/>

			<div className="flex-1 overflow-y-auto px-4 py-6">
				<DetailTitle
					name={todo.name}
					showDescription={showDescription}
					onToggleDescription={() => setShowDescription((prev) => !prev)}
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
					onCreateChild={(name) =>
						addTodo({
							name,
							parentTodoId: todo.id,
						})
					}
				/>
			</div>
		</div>
	);
}
