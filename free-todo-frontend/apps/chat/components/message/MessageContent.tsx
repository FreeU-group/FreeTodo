import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/apps/chat/types";
import { queryKeys } from "@/lib/query";
import { BatchTodoConfirmationPanel } from "./BatchTodoConfirmationPanel";
import { createMarkdownComponents } from "./MarkdownComponents";
import { MessageSources } from "./MessageSources";
import { OrganizeTodosConfirmationPanel } from "./OrganizeTodosConfirmationPanel";
import { TodoConfirmationPanel } from "./TodoConfirmationPanel";
import {
	parseTodoConfirmation,
	parseWebSearchMessage,
	processBodyWithCitations,
	removeToolCalls,
	type WebSearchSources,
} from "./utils/messageContentUtils";

type MessageContentProps = {
	message: ChatMessage;
};

export function MessageContent({ message }: MessageContentProps) {
	const queryClient = useQueryClient();

	// 移除工具调用标记后的内容
	const contentWithoutToolCalls = message.content
		? removeToolCalls(message.content)
		: "";

	// 解析待确认信息，移除确认注释后的内容
	const { confirmation, contentWithoutConfirmation } =
		parseTodoConfirmation(contentWithoutToolCalls);

	// 无论是否启用联网搜索，只要消息内容包含 Sources 标记就解析
	// 这样可以避免关闭联网搜索后，已包含 Sources 的消息显示异常
	const hasSourcesMarker =
		message.role === "assistant" &&
		contentWithoutConfirmation &&
		contentWithoutConfirmation.includes("\n\nSources:");
	const { body, sources } = hasSourcesMarker
		? parseWebSearchMessage(contentWithoutConfirmation)
		: { body: contentWithoutConfirmation, sources: [] as WebSearchSources };

	// 处理引用标记
	const processedBody = processBodyWithCitations(body, message.id, sources);

	const markdownComponents = createMarkdownComponents(message.role);

	const handleConfirmationComplete = () => {
		// 刷新待办列表
		queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
	};

	return (
		<>
			{confirmation ? (
				// 如果有确认信息，只显示确认面板，不显示正文
				<>
					{confirmation.type === "batch_todo_confirmation" && (
						<BatchTodoConfirmationPanel
							confirmation={confirmation}
							onComplete={handleConfirmationComplete}
						/>
					)}
					{confirmation.type === "organize_todos_confirmation" && (
						<OrganizeTodosConfirmationPanel
							confirmation={confirmation}
							onComplete={handleConfirmationComplete}
						/>
					)}
					{confirmation.type === "todo_confirmation" && (
						<TodoConfirmationPanel
							confirmation={confirmation}
							onComplete={handleConfirmationComplete}
						/>
					)}
				</>
			) : (
				// 没有确认信息时，正常显示markdown内容
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
			)}
		</>
	);
}
