import { useMemo } from "react";
import type { Todo } from "@/lib/types/todo";

export type OrderedTodo = {
	todo: Todo;
	depth: number;
};

export function useOrderedTodos(
	todos: Todo[],
	searchQuery: string,
	collapsedTodoIds?: Set<string>,
) {
	return useMemo(() => {
		let result = todos;

		if (searchQuery.trim()) {
			const query = searchQuery.toLowerCase();
			result = result.filter(
				(todo) =>
					todo.name.toLowerCase().includes(query) ||
					todo.description?.toLowerCase().includes(query) ||
					todo.tags?.some((tag) => tag.toLowerCase().includes(query)),
			);
		}

		const orderMap = new Map(result.map((todo, index) => [todo.id, index]));
		const visibleIds = new Set(result.map((todo) => todo.id));
		const childrenMap = new Map<string, Todo[]>();
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

		const sortByOriginalOrder = (list: Todo[]) =>
			[...list].sort(
				(a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
			);

		// 对于子任务，按创建时间升序排序（保持创建顺序）
		const sortChildrenByCreatedAt = (list: Todo[]) =>
			[...list].sort((a, b) => {
				const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
				const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
				return aTime - bTime;
			});

		const ordered: OrderedTodo[] = [];
		const traverse = (items: Todo[], depth: number) => {
			sortByOriginalOrder(items).forEach((item) => {
				ordered.push({ todo: item, depth });
				const children = childrenMap.get(item.id);
				// 如果有子任务且父任务已展开（collapsedTodoIds 为空或未定义时默认展开，否则检查是否不在 Set 中）
				if (children?.length) {
					const isExpanded =
						collapsedTodoIds === undefined || !collapsedTodoIds.has(item.id);
					if (isExpanded) {
						// 子任务按创建时间升序排序
						traverse(sortChildrenByCreatedAt(children), depth + 1);
					}
				}
			});
		};

		traverse(sortByOriginalOrder(roots), 0);

		return { filteredTodos: result, orderedTodos: ordered };
	}, [todos, searchQuery, collapsedTodoIds]);
}
