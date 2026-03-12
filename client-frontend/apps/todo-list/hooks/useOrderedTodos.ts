import { useMemo } from "react";
import type { Todo } from "@/lib/types";
import { sortTodosByOrder, sortTodosByOriginalOrder } from "@/lib/utils";
import { getTodoFolder, TODO_FOLDER_NONE } from "@/lib/utils/todoFolder";
import type { DueTimeFilter, TodoFilterState } from "../components/TodoFilter";

export type OrderedTodo = {
	todo: Todo;
	depth: number;
};

function isDueTimeMatch(todo: Todo, dueTimeFilter: DueTimeFilter): boolean {
	const scheduleTime = todo.startTime ?? todo.endTime;
	if (!scheduleTime) {
		// If no schedule time, only match "all" or "future"
		return dueTimeFilter === "all" || dueTimeFilter === "future";
	}

	const deadline = new Date(scheduleTime);
	const now = new Date();

	// Normalize to date only (remove time)
	const deadlineDate = new Date(
		deadline.getFullYear(),
		deadline.getMonth(),
		deadline.getDate(),
	);
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const tomorrow = new Date(today);
	tomorrow.setDate(tomorrow.getDate() + 1);

	// Calculate start of week (Monday)
	const startOfWeek = new Date(today);
	const dayOfWeek = startOfWeek.getDay();
	const diff = startOfWeek.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
	startOfWeek.setDate(diff);
	startOfWeek.setHours(0, 0, 0, 0);

	// Calculate end of week (Sunday end of day)
	const endOfWeek = new Date(startOfWeek);
	endOfWeek.setDate(endOfWeek.getDate() + 6);
	endOfWeek.setHours(23, 59, 59, 999);

	// Calculate start and end of month
	const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
	const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
	endOfMonth.setHours(23, 59, 59, 999);

	switch (dueTimeFilter) {
		case "all":
			return true;
		case "overdue":
			return deadlineDate < today;
		case "today":
			return deadlineDate.getTime() === today.getTime();
		case "tomorrow":
			return deadlineDate.getTime() === tomorrow.getTime();
		case "thisWeek":
			return deadlineDate >= startOfWeek && deadlineDate <= endOfWeek;
		case "thisMonth":
			return deadlineDate >= startOfMonth && deadlineDate <= endOfMonth;
		case "future":
			return deadlineDate > today;
		default:
			return true;
	}
}

export function useOrderedTodos(
	todos: Todo[],
	searchQuery: string,
	collapsedTodoIds?: Set<number>,
	filter?: TodoFilterState,
) {
	return useMemo(() => {
		let result = todos;

		// Apply filters
		if (filter) {
			// Status filter
			if (filter.status !== "all") {
				result = result.filter((todo) => todo.status === filter.status);
			}

			// Folder filter
			if (filter.folder !== "all") {
				result = result.filter((todo) => {
					const folder = getTodoFolder(todo);
					if (filter.folder === TODO_FOLDER_NONE) {
						return !folder;
					}
					return folder === filter.folder;
				});
			}

			// Tag filter
			if (filter.tag !== "all") {
				result = result.filter((todo) => todo.tags?.includes(filter.tag));
			}

			// Due time filter
			if (filter.dueTime !== "all") {
				result = result.filter((todo) => isDueTimeMatch(todo, filter.dueTime));
			}
		}

		// Apply search query
		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(todo) =>
					todo.name.toLowerCase().includes(query) ||
					todo.description?.toLowerCase().includes(query) ||
					todo.categories?.toLowerCase().includes(query) ||
					todo.tags?.some((tag) => tag.toLowerCase().includes(query)),
			);
		}

		const orderMap = new Map(result.map((todo, index) => [todo.id, index]));
		const visibleIds = new Set(result.map((todo) => todo.id));
		const childrenMap = new Map<number, Todo[]>();
		const roots: Todo[] = [];

		result.forEach((todo) => {
			const parentId = todo.parentTodoId;
			if (parentId && visibleIds.has(parentId)) {
				const list = childrenMap.get(parentId) ?? [];
				list.push(todo);
				childrenMap.set(parentId, list);
			} else {
				roots.push(todo);
			}
		});

		const ordered: OrderedTodo[] = [];
		const completedOrdered: OrderedTodo[] = [];
		const shouldSplitCompleted = !filter || filter.status === "all";
		const traverse = (
			items: Todo[],
			depth: number,
			isRoot: boolean = false,
			target: OrderedTodo[] = ordered,
		) => {
			// 根任务按原始顺序排序（支持用户拖拽），子任务按order字段排序
			const sortedItems = isRoot
				? sortTodosByOriginalOrder(items, orderMap)
				: sortTodosByOrder(items);
			sortedItems.forEach((item) => {
				target.push({ todo: item, depth });
				const children = childrenMap.get(item.id);
				// 如果有子任务且父任务已展开（collapsedTodoIds 为空或未定义时默认展开，否则检查是否不在 Set 中）
				if (children?.length) {
					const isExpanded =
						collapsedTodoIds === undefined || !collapsedTodoIds.has(item.id);
					if (isExpanded) {
						// 子任务优先按order字段排序，其次按创建时间排序
						traverse(children, depth + 1, false, target);
					}
				}
			});
		};

		if (shouldSplitCompleted) {
			const activeRoots = roots.filter((todo) => todo.status !== "completed");
			const completedRoots = roots.filter((todo) => todo.status === "completed");
			traverse(activeRoots, 0, true, ordered);
			traverse(completedRoots, 0, true, completedOrdered);
		} else {
			traverse(roots, 0, true, ordered);
		}

		return {
			filteredTodos: result,
			orderedTodos: ordered,
			completedOrderedTodos: completedOrdered,
			completedRootCount: shouldSplitCompleted
				? roots.filter((todo) => todo.status === "completed").length
				: 0,
		};
	}, [todos, searchQuery, collapsedTodoIds, filter]);
}
