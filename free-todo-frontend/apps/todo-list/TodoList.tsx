"use client";

import {
	type DragEndEvent,
	type DragStartEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type React from "react";
import { useState } from "react";
import { useTodoStore } from "@/lib/store/todo-store";
import type { CreateTodoInput } from "@/lib/types/todo";
import { type FilterStatus, useOrderedTodos } from "./hooks/useOrderedTodos";
import { NewTodoInlineForm } from "./NewTodoInlineForm";
import { TodoToolbar } from "./TodoToolbar";
import { TodoTreeList } from "./TodoTreeList";

export function TodoList() {
	const {
		todos,
		reorderTodos,
		addTodo,
		selectedTodoIds,
		setSelectedTodoId,
		toggleTodoSelection,
	} = useTodoStore();
	const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
	const [searchQuery, setSearchQuery] = useState("");
	const [activeId, setActiveId] = useState<string | null>(null);
	const [newTodoName, setNewTodoName] = useState("");

	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 5,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	);

	const { filteredTodos, orderedTodos } = useOrderedTodos(
		todos,
		filterStatus,
		searchQuery,
	);

	const handleDragStart = (event: DragStartEvent) => {
		setActiveId(event.active.id as string);
	};

	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;

		if (over && active.id !== over.id) {
			const oldIndex = orderedTodos.findIndex(
				({ todo }) => todo.id === active.id,
			);
			const newIndex = orderedTodos.findIndex(
				({ todo }) => todo.id === over.id,
			);

			const newOrder = arrayMove(orderedTodos, oldIndex, newIndex).map(
				({ todo }) => todo.id,
			);
			reorderTodos(newOrder);
		}

		setActiveId(null);
	};

	const handleDragCancel = () => {
		setActiveId(null);
	};

	const handleSelect = (
		todoId: string,
		event: React.MouseEvent<HTMLDivElement>,
	) => {
		const isMulti = event.metaKey || event.ctrlKey;
		if (isMulti) {
			toggleTodoSelection(todoId);
		} else {
			setSelectedTodoId(todoId);
		}
	};

	const handleCreateTodo = (e?: React.FormEvent) => {
		if (e) e.preventDefault();
		if (!newTodoName.trim()) return;

		const input: CreateTodoInput = {
			name: newTodoName.trim(),
		};

		// #region agent log
		fetch("http://127.0.0.1:7242/ingest/60db1f8b-8093-4a1d-a587-94a63cffac9e", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				sessionId: "debug-session",
				runId: "run1",
				hypothesisId: "H1",
				location: "apps/todo-list/TodoList.tsx:handleCreateTodo",
				message: "handleCreateTodo invoked",
				data: {
					name: input.name,
					hasEvent: Boolean(e),
					length: input.name.length,
				},
				timestamp: Date.now(),
			}),
		}).catch(() => {});
		// #endregion

		addTodo(input);
		setNewTodoName("");
	};

	return (
		<div className="relative flex h-full flex-col overflow-hidden bg-[oklch(var(--primary-weak))] dark:bg-[oklch(var(--primary-weak-hover))]">
			<TodoToolbar
				filterStatus={filterStatus}
				onFilterChange={setFilterStatus}
				searchQuery={searchQuery}
				onSearch={setSearchQuery}
			/>

			<div className="flex-1 overflow-y-auto">
				<div className="px-4 pb-4">
					<NewTodoInlineForm
						value={newTodoName}
						onChange={setNewTodoName}
						onSubmit={handleCreateTodo}
						onCancel={() => setNewTodoName("")}
					/>
				</div>

				{filteredTodos.length === 0 ? (
					<div className="flex h-[200px] items-center justify-center px-4 text-sm text-muted-foreground">
						暂无待办事项
					</div>
				) : (
					<TodoTreeList
						orderedTodos={orderedTodos}
						activeId={activeId}
						selectedTodoIds={selectedTodoIds}
						sensors={sensors}
						onDragStart={handleDragStart}
						onDragEnd={handleDragEnd}
						onDragCancel={handleDragCancel}
						onSelect={handleSelect}
						onSelectSingle={(id) => setSelectedTodoId(id)}
					/>
				)}
			</div>
		</div>
	);
}
