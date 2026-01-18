import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
	onResearchConfirm?: (confirmed: boolean, webSearchContent: string) => void;
};

export function MessageContent({
	message,
	isStreaming = false,
	onQuestionAnswer,
	onQuestionSkip,
	onResearchConfirm,
}: MessageContentProps) {
	const queryClient = useQueryClient();
	const [researchConfirmationDismissed, setResearchConfirmationDismissed] =
		useState(false);

	// 提取计划和步骤信息（在移除标记之前，用于上方的计划进度展示）
	const rawContent = message.content || "";
	const planInfo = extractPlanInfo(rawContent);
	const steps = extractSteps(rawContent);
	const hasPlan = planInfo !== null && steps.length > 0;

	// 基础正文：移除工具调用标记、计划和步骤标记后的内容
	const baseContent = rawContent
		? removePlanAndStepMarkers(removeToolCalls(rawContent))
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

	// 解析问题信息（先从已清洗的正文里解析问题注释）
	const { question, contentWithoutQuestion } = parseQuestion(baseContent);

	// 解析待确认信息，移除确认注释后的内容
	const { confirmation, contentWithoutConfirmation } = parseTodoConfirmation(
		contentWithoutQuestion,
	);

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
			) : confirmation &&
				!(confirmation.type === "research_to_todos_confirmation" &&
					researchConfirmationDismissed) ? (
				// 如果有确认信息，显示确认面板
				// 对于 research_to_todos_confirmation，同时显示正文
				// 如果用户点击了"否"，只显示正文，隐藏确认面板
				// 注意：当调研确认关闭后，我们需要显示正文，所以条件比较复杂
				confirmation.type === "research_to_todos_confirmation" ? (
					// 调研确认：显示正文和确认面板（如果未关闭）
					<>
						<ReactMarkdown
							remarkPlugins={[remarkGfm]}
							components={markdownComponents}
						>
							{processedBody}
						</ReactMarkdown>
						{sources.length > 0 && (
							<MessageSources sources={sources} messageId={message.id} />
						)}
						{!researchConfirmationDismissed && (
							<div className="mt-4">
								<div className="rounded-lg border p-4">
									<p className="mb-3 text-sm text-gray-600">
										{confirmation.preview}
									</p>
									<div className="flex gap-2">
										<button
											type="button"
											onClick={async () => {
												// 先关闭确认面板，避免用户再次点击
												setResearchConfirmationDismissed(true);
												if (
													onResearchConfirm &&
													confirmation.type === "research_to_todos_confirmation"
												) {
													onResearchConfirm(
														true,
														confirmation.web_search_content,
													);
												}
												handleConfirmationComplete();
											}}
											className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
										>
											是，整理成待办
										</button>
										<button
											type="button"
											onClick={() => {
												// 点击"否"时，不发送消息，只关闭确认面板
												setResearchConfirmationDismissed(true);
												handleConfirmationComplete();
											}}
											className="rounded border px-4 py-2 text-gray-700 hover:bg-gray-50"
										>
											否，不需要
										</button>
									</div>
								</div>
							</div>
						)}
					</>
				) : (
					// 其他确认类型：只显示确认面板
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
				)
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
