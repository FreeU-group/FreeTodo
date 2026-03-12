// 工具调用标记检测
// 支持格式：[使用工具: tool_name] 或 [使用工具: tool_name | 关键词: query] 或 [使用工具: tool_name | param: value]
const TOOL_CALL_PATTERN = /\[使用工具:\s*([^|\]]+)(?:\s*\|\s*([^\]]+))?\]/g;
const TOOL_EVENT_PREFIX = "[TOOL_EVENT:";
const TOOL_EVENT_SUFFIX = "]";

export type ToolCall = {
	name: string;
	params?: string;
	fullMatch: string;
};

export type ToolCallSegment =
	| { type: "text"; content: string }
	| { type: "tool"; name: string; params?: string };

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
 * 按工具调用标记拆分内容
 */
export function splitContentByToolCalls(content: string): ToolCallSegment[] {
	const segments: ToolCallSegment[] = [];
	if (!content) return segments;

	TOOL_CALL_PATTERN.lastIndex = 0;
	let lastIndex = 0;
	let match: RegExpExecArray | null = TOOL_CALL_PATTERN.exec(content);

	while (match !== null) {
		const matchStart = match.index;
		if (matchStart > lastIndex) {
			const text = content.slice(lastIndex, matchStart);
			if (text) {
				segments.push({ type: "text", content: text });
			}
		}

		segments.push({
			type: "tool",
			name: match[1]?.trim() ?? "",
			params: match[2]?.trim(),
		});

		lastIndex = match.index + match[0].length;
		match = TOOL_CALL_PATTERN.exec(content);
	}

	if (lastIndex < content.length) {
		const tail = content.slice(lastIndex);
		if (tail) {
			segments.push({ type: "text", content: tail });
		}
	}

	return segments;
}

/**
 * 移除工具调用标记
 */
export function removeToolCalls(content: string): string {
	return content.replace(TOOL_CALL_PATTERN, "").trim();
}

/**
 * 移除工具事件标记（如 [TOOL_EVENT:{...}]）
 */
export function removeToolEvents(content: string): string {
	let result = content;
	let startIdx = result.indexOf(TOOL_EVENT_PREFIX);

	while (startIdx !== -1) {
		const endIdx = result.indexOf(
			TOOL_EVENT_SUFFIX,
			startIdx + TOOL_EVENT_PREFIX.length,
		);
		if (endIdx === -1) {
			// 不完整的工具事件标记，直接截断
			result = result.slice(0, startIdx);
			break;
		}

		let removeStart = startIdx;
		let removeEnd = endIdx + TOOL_EVENT_SUFFIX.length;

		// 尝试移除前后的换行符
		if (removeStart > 0 && result[removeStart - 1] === "\n") {
			removeStart -= 1;
		}
		if (result[removeEnd] === "\n") {
			removeEnd += 1;
		}

		result = result.slice(0, removeStart) + result.slice(removeEnd);
		startIdx = result.indexOf(TOOL_EVENT_PREFIX);
	}

	return result.trim();
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
