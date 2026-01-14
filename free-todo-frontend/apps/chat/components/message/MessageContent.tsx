import { useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/apps/chat/types";
import { queryKeys } from "@/lib/query";
import { BatchTodoConfirmationPanel } from "./BatchTodoConfirmationPanel";
import { createMarkdownComponents } from "./MarkdownComponents";
import { MessageSources } from "./MessageSources";
import { OrganizeTodosConfirmationPanel } from "./OrganizeTodosConfirmationPanel";
import { PlanDisplay } from "./PlanDisplay";
import { QuestionModal } from "./QuestionModal";
import { TodoConfirmationPanel } from "./TodoConfirmationPanel";
import {
	extractPlanInfo,
	extractSteps,
	parseQuestion,
	parseTodoConfirmation,
	parseWebSearchMessage,
	processBodyWithCitations,
	removePlanAndStepMarkers,
	removeToolCalls,
	type WebSearchSources,
} from "./utils/messageContentUtils";

type MessageContentProps = {
	message: ChatMessage;
	isStreaming?: boolean;
	onQuestionAnswer?: (questionId: string, answer: string) => void;
	onQuestionSkip?: (questionId: string) => void;
};

export function MessageContent({
	message,
	isStreaming = false,
	onQuestionAnswer,
	onQuestionSkip,
}: MessageContentProps) {
	const queryClient = useQueryClient();

	// 提取计划和步骤信息（在移除标记之前）
	const planInfo = extractPlanInfo(message.content || "");
	const steps = extractSteps(message.content || "");
	const hasPlan = planInfo !== null && steps.length > 0;

	// 移除工具调用标记、计划和步骤标记后的内容
	const contentWithoutToolCalls = message.content
		? removePlanAndStepMarkers(removeToolCalls(message.content))
		: "";

	// 确定当前执行的步骤ID（用于显示进度）
	// 步骤按顺序执行，如果看到步骤N，则步骤1到N-1已完成
	// 如果正在流式输出，最后一个步骤是当前步骤
	// 否则，所有步骤都已完成
	let currentStepId: number | undefined;
	if (steps.length > 0) {
		const maxStepId = Math.max(...steps.map((s) => s.stepId));
		if (isStreaming) {
			// 流式输出时，最后一个步骤是当前步骤
			currentStepId = maxStepId;
		} else {
			// 非流式输出时，如果看到所有步骤标记，说明都已完成
			// 否则，最后一个步骤是当前步骤
			currentStepId = planInfo && steps.length >= planInfo.stepCount
				? undefined // 所有步骤都已完成
				: maxStepId;
		}
	}

	// 解析问题信息（在解析确认信息之前，因为问题可能包含确认信息）
	const { question, contentWithoutQuestion } = parseQuestion(
		message.content || "",
	);

	// 解析待确认信息，移除确认注释后的内容
	const { confirmation, contentWithoutConfirmation } =
		parseTodoConfirmation(contentWithoutQuestion || contentWithoutToolCalls);

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

	const handleQuestionAnswer = (answer: string) => {
		if (onQuestionAnswer && question) {
			onQuestionAnswer(question.question_id, answer);
		}
	};

	const handleQuestionSkip = () => {
		if (onQuestionSkip && question) {
			onQuestionSkip(question.question_id);
		}
	};

	return (
		<>
			{question ? (
				// 如果有问题，显示问题模态框
				<QuestionModal
					question={question}
					onAnswer={handleQuestionAnswer}
					onCancel={handleQuestionSkip}
				/>
			) : confirmation ? (
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
					{/* 计划显示 - 如果有计划信息 */}
					{hasPlan && planInfo && (
						<PlanDisplay
							planInfo={planInfo}
							steps={steps}
							isStreaming={isStreaming}
							currentStepId={currentStepId}
						/>
					)}
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
