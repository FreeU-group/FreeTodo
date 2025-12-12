import type { CreateTodoInput } from "@/lib/types/todo";

export type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
};

export type ChatMode = "ask" | "plan";

export type ParsedTodo = Pick<
	CreateTodoInput,
	"name" | "description" | "tags" | "deadline"
>;

export type ParsedTodoTree = ParsedTodo & { subtasks?: ParsedTodoTree[] };
