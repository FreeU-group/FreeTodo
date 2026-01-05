import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/apps/chat/types";
import { createMarkdownComponents } from "./MarkdownComponents";
import { MessageSources } from "./MessageSources";
import {
	parseWebSearchMessage,
	processBodyWithCitations,
	removeToolCalls,
	type WebSearchSources,
} from "./utils/messageContentUtils";

type MessageContentProps = {
	message: ChatMessage;
};

export function MessageContent({ message }: MessageContentProps) {
	// 移除工具调用标记后的内容
	const contentWithoutToolCalls = message.content
		? removeToolCalls(message.content)
		: "";

	// 无论是否启用联网搜索，只要消息内容包含 Sources 标记就解析
	// 这样可以避免关闭联网搜索后，已包含 Sources 的消息显示异常
	const hasSourcesMarker =
		message.role === "assistant" &&
		contentWithoutToolCalls &&
		contentWithoutToolCalls.includes("\n\nSources:");
	const { body, sources } = hasSourcesMarker
		? parseWebSearchMessage(contentWithoutToolCalls)
		: { body: contentWithoutToolCalls, sources: [] as WebSearchSources };

	// 处理引用标记
	const processedBody = processBodyWithCitations(body, message.id, sources);

	const markdownComponents = createMarkdownComponents(message.role);

	return (
		<>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={markdownComponents}
			>
				{processedBody}
			</ReactMarkdown>
			{/* 来源列表 - 仅在有来源时显示 */}
			{sources.length > 0 && (
				<MessageSources sources={sources} messageId={message.id} />
			)}
		</>
	);
}
