import { useCallback, useEffect, useState } from "react";
import type { ParsedTodoTree } from "@/apps/chat/types";
import { createId } from "@/apps/chat/utils/id";
import { getChatPromptsApiGetChatPromptsGet } from "@/lib/generated/config/config";
import type { CreateTodoInput } from "@/lib/types";

type TranslationFunction = (
	key: string,
	values?: Record<string, string | number | Date>,
) => string;

export const usePlanParser = (locale: string, t: TranslationFunction) => {
	// 从 API 获取任务规划系统提示词
	const [planSystemPrompt, setPlanSystemPrompt] = useState<string>("");

	useEffect(() => {
		let cancelled = false;
		async function loadPrompts() {
			try {
				const response = (await getChatPromptsApiGetChatPromptsGet({
					locale,
				})) as {
					success: boolean;
					editSystemPrompt: string;
					planSystemPrompt: string;
				};
				if (!cancelled && response.success) {
					setPlanSystemPrompt(response.planSystemPrompt);
				}
			} catch (error) {
				console.error("Failed to load chat prompts:", error);
				// 如果加载失败，使用默认值（向后兼容）
				if (!cancelled) {
					setPlanSystemPrompt("");
				}
			}
		}
		void loadPrompts();
		return () => {
			cancelled = true;
		};
	}, [locale]);

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
					error: t("noPlanJsonFound"),
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
						error: t("parsedNoValidTodos"),
					};
				}

				return { todos, error: null };
			} catch (err) {
				console.error(err);
				return {
					todos: [],
					error: t("parsePlanJsonFailed"),
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
