import { useCallback, useMemo } from "react";
import type { ParsedTodoTree } from "@/apps/chat/types";
import { createId } from "@/apps/chat/utils/id";
import type { CreateTodoInput } from "@/lib/types/todo";

export const usePlanParser = (locale: string) => {
	const planSystemPrompt = useMemo(
		() =>
			locale === "zh"
				? [
						"你是任务规划助手：请先简短说明，再输出一个 JSON 对象，字段为 todos（数组）。",
						"每个 todo: name(必填)、description(可选)、tags(可选字符串数组)、deadline(可选 ISO 8601)、subtasks(可选数组，结构同上)。",
						"若用户只有单一意图，用 1 个根任务，其余步骤放到 subtasks；若存在多个不同意图，则使用多个根任务并在各自 subtasks 中细化。",
						"无法生成待办时，返回空数组并解释原因。只输出一个 JSON，可用 ```json ``` 包裹，JSON 外可保留可读解释。",
					].join("\n")
				: [
						"You are a planning assistant: give a brief explanation, then output ONE JSON object with key `todos` (array).",
						"Each todo: name (required), description (optional), tags (optional string array), deadline (optional ISO 8601), subtasks (optional array with same shape).",
						"If the prompt has a single intent, produce one root todo and put steps in subtasks; if multiple distinct intents, use multiple root todos with their own subtasks.",
						"If nothing actionable, return an empty array but explain. Only one JSON, may be wrapped in ```json ```, natural text may appear outside.",
					].join("\n"),
		[locale],
	);

	const parsePlanTodos = useCallback(
		(
			content: string,
		): {
			todos: ParsedTodoTree[];
			error: string | null;
		} => {
			const findJson = () => {
				const fencedJson = content.match(/```json\s*([\s\S]*?)```/i);
				if (fencedJson?.[1]) return fencedJson[1];

				const fenced = content.match(/```\s*([\s\S]*?)```/);
				if (fenced?.[1]) return fenced[1];

				const inline = content.match(/\{[\s\S]*"todos"[\s\S]*\}/);
				if (inline?.[0]) return inline[0];
				return null;
			};

			const jsonText = findJson();
			if (!jsonText) {
				return {
					todos: [],
					error:
						locale === "zh"
							? "未找到计划 JSON，未创建待办。"
							: "No todo JSON found; no tasks created.",
				};
			}

			try {
				const parsed = JSON.parse(jsonText);
				const rawTodos = Array.isArray(parsed?.todos) ? parsed.todos : [];
				const normalizeTodo = (item: unknown): ParsedTodoTree | null => {
					if (!item || typeof (item as { name?: unknown }).name !== "string") {
						return null;
					}
					const rawName = (item as { name: string }).name.trim();
					if (!rawName) return null;

					const rawDescription = (item as { description?: unknown })
						.description;
					const description =
						typeof rawDescription === "string" && rawDescription.trim()
							? rawDescription.trim()
							: undefined;

					const rawTags = (item as { tags?: unknown }).tags;
					const tags = Array.isArray(rawTags)
						? rawTags
								.filter((tag): tag is string => typeof tag === "string")
								.map((tag) => tag.trim())
								.filter(Boolean)
						: undefined;

					const rawDeadline = (item as { deadline?: unknown }).deadline;
					const deadline =
						typeof rawDeadline === "string" && rawDeadline.trim()
							? rawDeadline.trim()
							: undefined;

					const rawSubtasks = (item as { subtasks?: unknown }).subtasks;
					const subtasks = Array.isArray(rawSubtasks)
						? rawSubtasks
								.map((task: unknown) => normalizeTodo(task))
								.filter((task): task is ParsedTodoTree => Boolean(task))
						: undefined;

					return {
						name: rawName,
						description,
						tags,
						deadline,
						subtasks,
					};
				};

				const todos: ParsedTodoTree[] = rawTodos
					.map((item: unknown) => normalizeTodo(item))
					.filter(
						(item: ParsedTodoTree | null | undefined): item is ParsedTodoTree =>
							Boolean(item),
					);

				if (!todos.length) {
					return {
						todos: [],
						error:
							locale === "zh"
								? "解析完成，但没有有效的待办项。"
								: "Parsed but no valid todos found.",
					};
				}

				return { todos, error: null };
			} catch (err) {
				console.error(err);
				return {
					todos: [],
					error:
						locale === "zh"
							? "解析计划 JSON 失败，未创建待办。"
							: "Failed to parse plan JSON; no tasks created.",
				};
			}
		},
		[locale],
	);

	const buildTodoPayloads = useCallback((trees: ParsedTodoTree[]) => {
		const payloads: CreateTodoInput[] = [];
		const walk = (nodes: ParsedTodoTree[], parentId?: string | null) => {
			nodes.forEach((node) => {
				const id = createId();
				payloads.push({
					id,
					name: node.name,
					description: node.description,
					tags: node.tags,
					deadline: node.deadline,
					parentTodoId: parentId ?? null,
				});
				if (node.subtasks?.length) {
					walk(node.subtasks, id);
				}
			});
		};
		walk(trees, null);
		return payloads;
	}, []);

	return {
		planSystemPrompt,
		parsePlanTodos,
		buildTodoPayloads,
	};
};
