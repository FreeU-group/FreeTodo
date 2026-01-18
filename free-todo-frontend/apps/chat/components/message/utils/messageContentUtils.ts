// 工具调用标记检测
// 支持格式：[使用工具: tool_name] 或 [使用工具: tool_name | 关键词: query] 或 [使用工具: tool_name | param: value]
const TOOL_CALL_PATTERN = /\[使用工具:\s*([^|\]]+)(?:\s*\|\s*([^\]]+))?\]/g;

// 计划标记检测
// 格式：[Plan] Generated N steps.
const PLAN_PATTERN = /\[Plan\]\s+Generated\s+(\d+)\s+steps?\./gi;

// 步骤标记检测
// 格式：[Step X] instruction text
const STEP_PATTERN = /\[Step\s+(\d+)\]\s+(.+?)(?=\n\n|$)/g;

export type ToolCall = {
	name: string;
	params?: string;
	fullMatch: string;
};

/**
 * 提取工具调用信息
 */
export function extractToolCalls(content: string): Array<ToolCall> {
	const matches: Array<ToolCall> = [];
	// 重置正则表达式的 lastIndex
	TOOL_CALL_PATTERN.lastIndex = 0;
	let match: RegExpExecArray | null = TOOL_CALL_PATTERN.exec(content);
	while (match !== null) {
		const toolName = match[1].trim();
		const params = match[2]?.trim();
		matches.push({
			name: toolName,
			params: params,
			fullMatch: match[0],
		});
		match = TOOL_CALL_PATTERN.exec(content);
	}
	return matches;
}

/**
 * 移除工具调用标记
 */
export function removeToolCalls(content: string): string {
	return content.replace(TOOL_CALL_PATTERN, "").trim();
}

/**
 * 移除计划和步骤标记（用于显示）
 */
export function removePlanAndStepMarkers(content: string): string {
	let cleaned = content;
	// 移除计划标记
	cleaned = cleaned.replace(PLAN_PATTERN, "").trim();
	// 移除步骤标记
	cleaned = cleaned.replace(STEP_PATTERN, "").trim();
	return cleaned;
}

/**
 * 移除确认标记（用于显示）
 */
export function removeConfirmationMarkers(content: string): string {
	// 移除 RESEARCH_CONFIRMATION 注释
	const researchConfirmationPattern = /<!--\s*RESEARCH_CONFIRMATION:\s*({.+?})\s*-->/s;
	return content.replace(researchConfirmationPattern, "").trim();
}

export type PlanInfo = {
	stepCount: number;
	fullMatch: string;
};

export type StepInfo = {
	stepId: number;
	instruction: string;
	fullMatch: string;
};

/**
 * 提取计划信息
 */
export function extractPlanInfo(content: string): PlanInfo | null {
	PLAN_PATTERN.lastIndex = 0;
	const match = PLAN_PATTERN.exec(content);
	if (match) {
		return {
			stepCount: parseInt(match[1], 10),
			fullMatch: match[0],
		};
	}
	return null;
}

/**
 * 提取步骤信息
 */
export function extractSteps(content: string): Array<StepInfo> {
	const steps: Array<StepInfo> = [];
	STEP_PATTERN.lastIndex = 0;
	let match: RegExpExecArray | null = STEP_PATTERN.exec(content);
	while (match !== null) {
		steps.push({
			stepId: parseInt(match[1], 10),
			instruction: match[2].trim(),
			fullMatch: match[0],
		});
		match = STEP_PATTERN.exec(content);
	}
	return steps;
}

export type WebSearchSources = Array<{ title: string; url: string }>;

export type ParsedWebSearchMessage = {
	body: string;
	sources: WebSearchSources;
};

/**
 * 解析 webSearch 模式下的消息内容，分离正文和来源列表
 */
export function parseWebSearchMessage(content: string): ParsedWebSearchMessage {
	// 查找 Sources: 标记
	const sourcesMarker = "\n\nSources:";
	const sourcesIndex = content.indexOf(sourcesMarker);

	if (sourcesIndex === -1) {
		// 没有 Sources 标记，返回全部内容作为正文
		return { body: content, sources: [] };
	}

	// 分离正文和来源部分
	const body = content.substring(0, sourcesIndex).trim();
	const sourcesText = content
		.substring(sourcesIndex + sourcesMarker.length)
		.trim();

	// 解析来源列表（格式：1. 标题 (URL)）
	const sources: WebSearchSources = [];
	const sourceLines = sourcesText.split("\n");
	for (const line of sourceLines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		// 匹配格式：数字. 标题 (URL)
		const match = trimmed.match(/^\d+\.\s+(.+?)\s+\((.+?)\)$/);
		if (match) {
			sources.push({
				title: match[1].trim(),
				url: match[2].trim(),
			});
		}
	}

	return { body, sources };
}

/**
 * 将角标引用 [[n]] 替换为可点击的链接（只显示数字，不显示方括号）
 */
export function processBodyWithCitations(
	text: string,
	messageId: string,
	sources: WebSearchSources,
): string {
	if (sources.length === 0) {
		return text;
	}
	// 匹配 [[数字]] 格式的引用，替换为只显示数字的链接
	return text.replace(/\[\[(\d+)\]\]/g, (match, num) => {
		const index = parseInt(num, 10) - 1;
		if (index >= 0 && index < sources.length) {
			const sourceId = `source-${messageId}-${index}`;
			// 只显示数字，不显示方括号
			return `[${num}](#${sourceId})`;
		}
		return match;
	});
}

export type TodoConfirmationData =
	| {
			type: "todo_confirmation";
			operation: "create_todo" | "update_todo" | "delete_todo";
			data: {
				operation: string;
				todo_id?: number;
				params?: Record<string, unknown>;
			};
			preview: string;
	  }
	| {
			type: "batch_todo_confirmation";
			operation: "batch_create_todos";
			todos: Array<{ name: string; description?: string }>;
			preview: string;
	  }
	| {
			type: "batch_todo_confirmation";
			operation: "batch_delete_todos";
			todos: Array<{ id: number; name: string }>;
			preview: string;
	  }
	| {
			type: "organize_todos_confirmation";
			operation: "organize_todos";
			todos: Array<{ id: number; name: string }>;
			parent_title: string;
			todo_ids: number[];
			preview: string;
	  }
	| {
			type: "research_to_todos_confirmation";
			operation: "research_to_todos";
			web_search_content: string;
			preview: string;
	  };

/**
 * 解析并提取待确认信息
 */
export function parseTodoConfirmation(
	content: string,
): {
	confirmation: TodoConfirmationData | null;
	contentWithoutConfirmation: string;
} {
	const confirmationPattern =
		/<!-- TODO_CONFIRMATION:\s*({.+?})\s*-->/s;
	const match = content.match(confirmationPattern);
	if (match) {
		try {
			const confirmationData = JSON.parse(match[1]);
			const contentWithoutConfirmation = content
				.replace(confirmationPattern, "")
				.trim();
			return {
				confirmation: confirmationData as TodoConfirmationData,
				contentWithoutConfirmation,
			};
		} catch (error) {
			console.error("解析确认信息失败:", error);
		}
	}
	return { confirmation: null, contentWithoutConfirmation: content };
}

export type QuestionData = {
	question_text: string;
	question_id: string;
	step_id: number;
	suggested_answers: string[];
	allow_custom: boolean;
	context?: string;
};

const QUESTION_PATTERN = /<!-- AGENT_QUESTION:\s*({.+?})\s*-->/s;

/**
 * 解析并提取问题信息
 */
export function parseQuestion(
	content: string,
): {
	question: QuestionData | null;
	contentWithoutQuestion: string;
} {
	const match = content.match(QUESTION_PATTERN);
	if (match) {
		try {
			const questionData = JSON.parse(match[1]);
			const contentWithoutQuestion = content.replace(QUESTION_PATTERN, "").trim();
			return {
				question: questionData as QuestionData,
				contentWithoutQuestion,
			};
		} catch (error) {
			console.error("解析问题失败:", error);
		}
	}
	return { question: null, contentWithoutQuestion: content };
}
