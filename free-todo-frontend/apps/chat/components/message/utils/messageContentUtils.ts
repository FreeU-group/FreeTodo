// 工具调用标记检测
// 支持格式：[使用工具: tool_name] 或 [使用工具: tool_name | 关键词: query] 或 [使用工具: tool_name | param: value]
const TOOL_CALL_PATTERN = /\[使用工具:\s*([^|\]]+)(?:\s*\|\s*([^\]]+))?\]/g;

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
