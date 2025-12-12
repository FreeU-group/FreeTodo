import type { Todo } from "@/lib/types/todo";

export const buildTodoLine = (todo: Todo, locale: string) => {
	const parts: string[] = [todo.name];
	if (todo.description) {
		parts.push(todo.description);
	}
	if (todo.deadline) {
		parts.push(
			locale === "zh" ? `截止: ${todo.deadline}` : `Due: ${todo.deadline}`,
		);
	}
	if (todo.tags?.length) {
		parts.push(`${locale === "zh" ? "标签" : "Tags"}: ${todo.tags.join(", ")}`);
	}
	return `- ${parts.join(" | ")}`;
};

export const buildTodoContextBlock = (
	list: Todo[],
	sourceLabel: string,
	locale: string,
) => {
	if (!list.length) {
		return locale === "zh"
			? "当前没有待办，聊天上下文为空。"
			: "No todos available; chat context is empty.";
	}
	const header =
		locale === "zh"
			? `${sourceLabel}（共 ${list.length} 条）：`
			: `${sourceLabel} (total ${list.length}):`;
	return [header, ...list.map((item) => buildTodoLine(item, locale))].join(
		"\n",
	);
};
