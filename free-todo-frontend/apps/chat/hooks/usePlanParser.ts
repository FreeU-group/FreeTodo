import { useCallback, useMemo } from "react";
import type { ParsedTodoTree } from "@/apps/chat/types";
import { createId } from "@/apps/chat/utils/id";
import type { CreateTodoInput } from "@/lib/types";

type TranslationFunction = (
	key: string,
	values?: Record<string, string | number | Date>,
) => string;

export const usePlanParser = (locale: string, t: TranslationFunction) => {
	const planSystemPrompt = useMemo(
		() =>
			locale === "zh"
				? [
						"你是任务规划助手：请先简短说明，再输出一个 JSON 对象，字段为 todos（数组）。",
						"每个 todo: name(必填)、description(可选)、tags(可选字符串数组)、deadline(可选 ISO 8601)、order(可选数字，用于同级任务排序，从1开始递增)、subtasks(可选数组，结构同上)。",
						"order 字段说明：同级任务按 order 升序排列，order 相同时按创建时间排序。请为同级任务分配合理的 order 值（如 1, 2, 3...），体现任务的逻辑顺序或优先级。",
						"若用户只有单一意图，用 1 个根任务，其余步骤放到 subtasks；若存在多个不同意图，则使用多个根任务并在各自 subtasks 中细化。",
						"无法生成待办时，返回空数组并解释原因。只输出一个 JSON，可用 ```json ``` 包裹，JSON 外可保留可读解释。",
					].join("\n")
				: [
						"You are a planning assistant: give a brief explanation, then output ONE JSON object with key `todos` (array).",
						"Each todo: name (required), description (optional), tags (optional string array), deadline (optional ISO 8601), order (optional number for sorting sibling tasks, starting from 1), subtasks (optional array with same shape).",
						"Order field explanation: sibling tasks are sorted by order in ascending order, with creation time as fallback. Assign reasonable order values (1, 2, 3...) to sibling tasks to reflect logical sequence or priority.",
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
					error: t("chat.noPlanJsonFound"),
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

					const rawOrder = (item as { order?: unknown }).order;
					const order =
						typeof rawOrder === "number" && !Number.isNaN(rawOrder)
							? rawOrder
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
						order,
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
						error: t("chat.parsedNoValidTodos"),
					};
				}

				return { todos, error: null };
			} catch (err) {
				console.error(err);
				return {
					todos: [],
					error: t("chat.parsePlanJsonFailed"),
				};
			}
		},
		[t],
	);

	const buildTodoPayloads = useCallback((trees: ParsedTodoTree[]) => {
		// Use a temporary string ID for tracking parent-child relationships
		// These will be replaced with actual numeric IDs during creation
		// Use Omit to properly override parentTodoId type for temporary string IDs
		const payloads: (Omit<CreateTodoInput, "parentTodoId"> & {
			id?: string;
			parentTodoId?: string | number | null;
		})[] = [];
		const walk = (nodes: ParsedTodoTree[], parentId?: string | null) => {
			nodes.forEach((node) => {
				const id = createId();
				payloads.push({
					id, // Temporary string ID for tracking
					name: node.name,
					description: node.description,
					tags: node.tags,
					deadline: node.deadline,
					order: node.order,
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
