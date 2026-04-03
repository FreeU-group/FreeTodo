import type { Todo, TodoPriority, TodoStatus } from "@/lib/types";

type TranslationFunction = (
	key: string,
	values?: Record<string, string | number | Date>,
) => string;

// 格式化优先级
const formatPriority = (
	priority: TodoPriority,
	tCommon: TranslationFunction,
): string => {
	const priorityKey = `priority.${priority}`;
	return tCommon(priorityKey);
};

// 格式化状态
const formatStatus = (
	status: TodoStatus,
	tCommon: TranslationFunction,
): string => {
	const statusKey = `status.${status}`;
	return tCommon(statusKey);
};

// 查找最高级父待办
export const findRootTodo = (todo: Todo, allTodos: Todo[]): Todo => {
	if (!todo.parentTodoId) {
		return todo;
	}
	const parent = allTodos.find((t) => t.id === todo.parentTodoId);
	if (!parent) {
		return todo;
	}
	return findRootTodo(parent, allTodos);
};

// 递归收集所有子待办（包括子待办的子待办）
export const collectAllDescendants = (todo: Todo, allTodos: Todo[]): Todo[] => {
	const children = allTodos.filter((t) => t.parentTodoId === todo.id);
	const descendants: Todo[] = [...children];
	for (const child of children) {
		descendants.push(...collectAllDescendants(child, allTodos));
	}
	return descendants;
};

// 构建单个待办的详细信息（包含所有参数）
export const buildDetailedTodoInfo = (
	todo: Todo,
	allTodos: Todo[],
	t: TranslationFunction,
	tCommon: TranslationFunction,
	indent = "",
): string => {
	const lines: string[] = [];

	// ID is critical for AI to reference when recommending target todos
	const idLabel = t("todoContext.id");
	lines.push(`${indent}${idLabel}: ${todo.id}`);

	const label = t("todoContext.name");
	lines.push(`${indent}${label}: ${todo.name}`);

	if (todo.description) {
		const descLabel = t("todoContext.description");
		lines.push(`${indent}${descLabel}: ${todo.description}`);
	}

	if (todo.userNotes) {
		const notesLabel = t("todoContext.notes");
		lines.push(`${indent}${notesLabel}: ${todo.userNotes}`);
	}

	const scheduleTime = todo.startTime ?? todo.endTime;
	if (scheduleTime) {
		const ddlLabel = t("todoContext.deadline");
		lines.push(`${indent}${ddlLabel}: ${scheduleTime}`);
	}

	const priorityLabel = t("todoContext.priority");
	lines.push(
		`${indent}${priorityLabel}: ${formatPriority(todo.priority, tCommon)}`,
	);

	const statusLabel = t("todoContext.status");
	lines.push(`${indent}${statusLabel}: ${formatStatus(todo.status, tCommon)}`);

	if (todo.tags?.length) {
		const tagsLabel = t("todoContext.tags");
		lines.push(`${indent}${tagsLabel}: ${todo.tags.join(", ")}`);
	}

	// Show parentTodoId as numeric ID for AI reference
	if (todo.parentTodoId) {
		const parentIdLabel = t("todoContext.parentTodoId");
		lines.push(`${indent}${parentIdLabel}: ${todo.parentTodoId}`);
		// Also show parent name for context
		const parent = allTodos.find((t) => t.id === todo.parentTodoId);
		if (parent) {
			const parentNameLabel = t("todoContext.parentName");
			lines.push(`${indent}${parentNameLabel}: ${parent.name}`);
		}
	}

	return lines.join("\n");
};

// 构建简洁的待办行（用于列表展示）
export const buildTodoLine = (todo: Todo, t: TranslationFunction) => {
	const parts: string[] = [todo.name];
	const scheduleTime = todo.startTime ?? todo.endTime;
	if (todo.description) {
		parts.push(todo.description);
	}
	if (scheduleTime) {
		parts.push(t("todoContext.due", { deadline: scheduleTime }));
	}
	if (todo.tags?.length) {
		parts.push(t("todoContext.tagsLabel", { tags: todo.tags.join(", ") }));
	}
	return `- ${parts.join(" | ")}`;
};

// 构建包含层级结构的完整待办上下文
export const buildHierarchicalTodoContext = (
	selectedTodos: Todo[],
	allTodos: Todo[],
	t: TranslationFunction,
	tCommon: TranslationFunction,
): string => {
	if (!selectedTodos.length) {
		return t("noTodosAvailable");
	}

	const sections: string[] = [];

	for (const selectedTodo of selectedTodos) {
		const todoSection: string[] = [];

		// 1. 选中待办的详细信息
		const selectedLabel = t("selectedTodo");
		todoSection.push(selectedLabel);
		todoSection.push(buildDetailedTodoInfo(selectedTodo, allTodos, t, tCommon));

		// 2. 查找最高级父待办
		const rootTodo = findRootTodo(selectedTodo, allTodos);

		// 如果选中的待办不是根待办，显示根待办信息和完整子树
		if (rootTodo.id !== selectedTodo.id) {
			todoSection.push("");
			const rootLabel = t("rootParentTodo");
			todoSection.push(rootLabel);
			todoSection.push(buildDetailedTodoInfo(rootTodo, allTodos, t, tCommon));

			// 3. 收集根待办下的所有子待办
			const allDescendants = collectAllDescendants(rootTodo, allTodos);
			if (allDescendants.length > 0) {
				todoSection.push("");
				const childrenLabel = t("allSubTodos", {
					count: allDescendants.length,
				});
				todoSection.push(childrenLabel);

				for (const child of allDescendants) {
					todoSection.push("");
					todoSection.push(
						buildDetailedTodoInfo(child, allTodos, t, tCommon, "  "),
					);
				}
			}
		} else {
			// 选中的就是根待办，显示其所有子待办
			const allDescendants = collectAllDescendants(selectedTodo, allTodos);
			if (allDescendants.length > 0) {
				todoSection.push("");
				const childrenLabel = t("allSubTodosRoot", {
					count: allDescendants.length,
				});
				todoSection.push(childrenLabel);

				for (const child of allDescendants) {
					todoSection.push("");
					todoSection.push(
						buildDetailedTodoInfo(child, allTodos, t, tCommon, "  "),
					);
				}
			}
		}

		sections.push(todoSection.join("\n"));
	}

	// 多个选中待办用分隔线分开
	const separator = "\n---\n";
	return sections.join(separator);
};

// 保留原有的简单上下文构建函数（向后兼容）
export const buildTodoContextBlock = (
	list: Todo[],
	sourceLabel: string,
	t: TranslationFunction,
) => {
	if (!list.length) {
		return t("noTodosAvailable");
	}
	const header = t("todoContextHeader", {
		source: sourceLabel,
		count: list.length,
	});
	return [header, ...list.map((item) => buildTodoLine(item, t))].join("\n");
};
