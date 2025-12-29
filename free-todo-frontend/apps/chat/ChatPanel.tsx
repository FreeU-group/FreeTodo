"use client";

import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { BreakdownStageRenderer } from "@/apps/chat/components/breakdown/BreakdownStageRenderer";
import { ChatInputSection } from "@/apps/chat/components/input/ChatInputSection";
import { HeaderBar } from "@/apps/chat/components/layout/HeaderBar";
import { HistoryDrawer } from "@/apps/chat/components/layout/HistoryDrawer";
import { MessageList } from "@/apps/chat/components/message/MessageList";
import { useBreakdownQuestionnaire } from "@/apps/chat/hooks/useBreakdownQuestionnaire";
import { useChatController } from "@/apps/chat/hooks/useChatController";
import { usePromptHandlers } from "@/apps/chat/hooks/usePromptHandlers";
import { useCreateTodo, useUpdateTodo } from "@/lib/query";
import { useLocaleStore } from "@/lib/store/locale";
import { useTodoStore } from "@/lib/store/todo-store";
import type { CreateTodoInput, Todo } from "@/lib/types";

export function ChatPanel() {
	const { locale } = useLocaleStore();
	const tChat = useTranslations("chat");
	const tPage = useTranslations("page");

	// 从 TanStack Query 获取创建 todo 的 mutation
	const createTodoMutation = useCreateTodo();

	// 从 TanStack Query 获取更新 todo 的 mutation（用于 Edit 模式）
	const updateTodoMutation = useUpdateTodo();

	// 包装 createTodo 函数以匹配 useChatController 期望的签名
	const createTodoWithResult = useCallback(
		async (input: CreateTodoInput): Promise<Todo | null> => {
			try {
				return await createTodoMutation.mutateAsync(input);
			} catch (error) {
				console.error("Failed to create todo:", error);
				return null;
			}
		},
		[createTodoMutation],
	);

	// 从 Zustand 获取 UI 状态
	const { selectedTodoIds, clearTodoSelection, toggleTodoSelection } =
		useTodoStore();

	// 使用 Breakdown Questionnaire hook
	const breakdownQuestionnaire = useBreakdownQuestionnaire();

	// 使用 Chat Controller hook
	const chatController = useChatController({
		locale,
		selectedTodoIds,
		createTodo: createTodoWithResult,
	});

	// 使用 Prompt Handlers hook
	const { handleSelectPrompt } = usePromptHandlers({
		chatMode: chatController.chatMode,
		isStreaming: chatController.isStreaming,
		planSystemPrompt: chatController.planSystemPrompt,
		editSystemPrompt: chatController.editSystemPrompt,
		hasSelection: chatController.hasSelection,
		effectiveTodos: chatController.effectiveTodos,
		todos: chatController.todos,
		conversationId: chatController.conversationId,
		setConversationId: chatController.setConversationId,
		setMessages: chatController.setMessages,
		setIsStreaming: chatController.setIsStreaming,
		setError: chatController.setError,
		parsePlanTodos: chatController.parsePlanTodos,
		buildTodoPayloads: chatController.buildTodoPayloads,
		createTodoWithResult,
	});

	const [modeMenuOpen, setModeMenuOpen] = useState(false);
	const [showTodosExpanded, setShowTodosExpanded] = useState(false);

	const typingText = useMemo(() => tChat("aiThinking"), [tChat]);

	const formatMessageCount = useCallback(
		(count?: number) => tPage("messagesCount", { count: count ?? 0 }),
		[tPage],
	);

	return (
		<div className="flex h-full flex-col bg-background">
			<HeaderBar
				chatHistoryLabel={tPage("chatHistory")}
				newChatLabel={tPage("newChat")}
				onToggleHistory={() =>
					chatController.setHistoryOpen(!chatController.historyOpen)
				}
				onNewChat={chatController.handleNewChat}
			/>

			{chatController.historyOpen && (
				<HistoryDrawer
					historyLoading={chatController.historyLoading}
					historyError={chatController.historyError}
					sessions={chatController.sessions}
					conversationId={chatController.conversationId}
					formatMessageCount={formatMessageCount}
					labels={{
						recentSessions: tPage("recentSessions"),
						noHistory: tPage("noHistory"),
						loading: tChat("loading"),
						chatHistory: tPage("chatHistory"),
					}}
					onSelectSession={chatController.handleLoadSession}
				/>
			)}

			<BreakdownStageRenderer
				stage={breakdownQuestionnaire.stage}
				questions={breakdownQuestionnaire.questions}
				answers={breakdownQuestionnaire.answers}
				summary={breakdownQuestionnaire.summary}
				subtasks={breakdownQuestionnaire.subtasks}
				breakdownLoading={breakdownQuestionnaire.breakdownLoading}
				isGeneratingSummary={breakdownQuestionnaire.isGeneratingSummary}
				summaryStreamingText={breakdownQuestionnaire.summaryStreamingText}
				isGeneratingQuestions={breakdownQuestionnaire.isGeneratingQuestions}
				questionStreamingCount={breakdownQuestionnaire.questionStreamingCount}
				questionStreamingTitle={breakdownQuestionnaire.questionStreamingTitle}
				breakdownError={breakdownQuestionnaire.breakdownError}
				locale={locale}
				onAnswerChange={breakdownQuestionnaire.setAnswer}
				onSubmit={breakdownQuestionnaire.handleSubmitAnswers}
				onAccept={breakdownQuestionnaire.handleAcceptBreakdown}
			/>

			{(breakdownQuestionnaire.stage === "idle" ||
				breakdownQuestionnaire.stage === "completed") && (
				<MessageList
					messages={chatController.messages}
					isStreaming={chatController.isStreaming}
					typingText={typingText}
					locale={locale}
					chatMode={chatController.chatMode}
					effectiveTodos={chatController.effectiveTodos}
					onUpdateTodo={updateTodoMutation.mutateAsync}
					isUpdating={updateTodoMutation.isPending}
					onSelectPrompt={handleSelectPrompt}
				/>
			)}

			<ChatInputSection
				chatMode={chatController.chatMode}
				locale={locale}
				inputValue={chatController.inputValue}
				isStreaming={chatController.isStreaming}
				error={chatController.error}
				effectiveTodos={chatController.effectiveTodos}
				hasSelection={chatController.hasSelection}
				showTodosExpanded={showTodosExpanded}
				modeMenuOpen={modeMenuOpen}
				onInputChange={chatController.setInputValue}
				onSend={chatController.handleSend}
				onStop={chatController.handleStop}
				onKeyDown={chatController.handleKeyDown}
				onCompositionStart={() => chatController.setIsComposing(true)}
				onCompositionEnd={() => chatController.setIsComposing(false)}
				onToggleExpand={() => setShowTodosExpanded((prev) => !prev)}
				onClearSelection={clearTodoSelection}
				onToggleTodo={toggleTodoSelection}
				onToggleModeMenu={() => setModeMenuOpen((prev) => !prev)}
				onChangeMode={chatController.setChatMode}
			/>
		</div>
	);
}
