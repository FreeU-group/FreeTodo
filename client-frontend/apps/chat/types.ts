import type { CreateTodoInput } from "@/lib/types";

/**
 * 工具调用步骤状态
 */
export type ToolCallStatus = "running" | "completed" | "error";

/**
 * 工具调用步骤
 */
export type ToolCallStep = {
	/** 步骤唯一 ID */
	id: string;
	/** 工具名称 */
	toolName: string;
	/** 工具参数 */
	toolArgs?: Record<string, unknown>;
	/** 执行状态 */
	status: ToolCallStatus;
	/** 结果预览（仅在完成时有值） */
	resultPreview?: string;
	/** 开始时间 */
	startTime: number;
	/** 结束时间（仅在完成时有值） */
	endTime?: number;
};

export type ToolCallAnchor = {
	/** 关联的工具步骤 ID */
	stepId: string;
	/** 工具名称（用于缺失步骤时兜底展示） */
	toolName: string;
	/** 工具参数（用于缺失步骤时兜底展示） */
	toolArgs?: Record<string, unknown>;
	/** 工具调用发生时的内容偏移量 */
	offset: number;
};

/**
 * 聊天消息
 */
export type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
	/** 工具调用步骤（仅 assistant 消息可能有） */
	toolCallSteps?: ToolCallStep[];
	/** 工具调用在消息内容中的锚点（仅 assistant 消息可能有） */
	toolCallAnchors?: ToolCallAnchor[];
};

export type ChatMode = "agno";

export type ParsedTodo = Pick<
	CreateTodoInput,
	"name" | "description" | "tags" | "startTime" | "endTime" | "order"
>;

export type ParsedTodoTree = ParsedTodo & { subtasks?: ParsedTodoTree[] };

// Edit mode content block with AI-recommended target todo
export type EditContentBlock = {
	id: string;
	title: string;
	content: string;
	recommendedTodoId: number | null;
};
