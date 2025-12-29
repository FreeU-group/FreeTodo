import type { CreateTodoInput } from "@/lib/types";

export type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
};

export type ChatMode = "ask" | "plan" | "edit" | "difyTest";

export type ParsedTodo = Pick<
	CreateTodoInput,
	"name" | "description" | "tags" | "deadline" | "order"
>;

export type ParsedTodoTree = ParsedTodo & { subtasks?: ParsedTodoTree[] };

// Edit mode content block with AI-recommended target todo
export type EditContentBlock = {
	id: string;
	title: string;
	content: string;
	recommendedTodoId: number | null;
};
