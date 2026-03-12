"use client";

import { History, Pin, PinOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BreakdownStageRenderer } from "@/apps/chat/components/breakdown/BreakdownStageRenderer";
import { ChatInputSection } from "@/apps/chat/components/input/ChatInputSection";
import { PromptSuggestions } from "@/apps/chat/components/input/PromptSuggestions";
import { HeaderBar } from "@/apps/chat/components/layout/HeaderBar";
import { HistoryDrawer } from "@/apps/chat/components/layout/HistoryDrawer";
import { MessageList } from "@/apps/chat/components/message/MessageList";
import { useBreakdownQuestionnaire } from "@/apps/chat/hooks/useBreakdownQuestionnaire";
import { useChatController } from "@/apps/chat/hooks/useChatController";
import { useCrawlerStore } from "@/apps/crawler/store";
import { PanelActionButton } from "@/components/common/layout/PanelHeader";
import { useChatStore } from "@/lib/store/chat-store";
import { useLocaleStore } from "@/lib/store/locale";
import { useTodoStore } from "@/lib/store/todo-store";
import { cn } from "@/lib/utils";

export function ChatPanel() {
	const { locale } = useLocaleStore();
	const tChat = useTranslations("chat");
	const tPage = useTranslations("page");
	const tPanelMenu = useTranslations("panelMenu");

	// 从 Zustand 获取 UI 状态
	const { selectedTodoIds, clearTodoSelection, toggleTodoSelection } =
		useTodoStore();

	// 获取爬虫 store 的 setSelectedResult 方法用于清除关联
	const setSelectedCrawlerResult = useCrawlerStore(
		(state) => state.setSelectedResult,
	);
	// 获取 pendingPrompt（其他组件触发的待发送消息）
	const { pendingPrompt, pendingNewChat, setPendingPrompt } = useChatStore();

	// 使用 Breakdown Questionnaire hook
	const breakdownQuestionnaire = useBreakdownQuestionnaire();

	// 使用 Chat Controller hook
	const chatController = useChatController({
		locale,
		selectedTodoIds,
	});

	// 处理预设 Prompt 选择：直接发送消息（复用 sendMessage 逻辑）
	const handleSelectPrompt = useCallback(
		(prompt: string) => {
			void chatController.sendMessage(prompt);
		},
		[chatController],
	);

	// 监听 pendingPrompt 变化，自动发送消息（由其他组件触发，如 TodoCard 的"获取建议"按钮）
	useEffect(() => {
		if (pendingPrompt) {
			// 如果需要新开会话，先清空当前会话（keepStreaming=true 让旧的流式输出继续在后台运行）
			if (pendingNewChat) {
				chatController.handleNewChat(true);
			}
			// 使用 setTimeout 确保新会话状态已更新后再发送消息
			setTimeout(() => {
				void chatController.sendMessage(pendingPrompt);
			}, 0);
			// 清空 pendingPrompt，避免重复发送
			setPendingPrompt(null);
		}
	}, [pendingPrompt, pendingNewChat, chatController, setPendingPrompt]);

	const [showTodosExpanded, setShowTodosExpanded] = useState(false);
	const historyPanelRef = useRef<HTMLDivElement | null>(null);

	const {
		historyOpen,
		setHistoryOpen,
		historyPinned,
		setHistoryPinned,
	} = chatController;

	const isHistoryDocked = historyOpen && historyPinned;

	useEffect(() => {
		if (!historyOpen || historyPinned) {
			return undefined;
		}

		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as HTMLElement | null;
			if (!target) return;

			if (historyPanelRef.current?.contains(target)) return;
			if (target.closest('[data-history-toggle="true"]')) return;

			setHistoryOpen(false);
		};

		document.addEventListener("pointerdown", handlePointerDown, true);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown, true);
		};
	}, [historyOpen, historyPinned, setHistoryOpen]);

	// 判断是否显示首页（用于在输入框上方显示建议按钮）
	const shouldShowSuggestions = useMemo(() => {
		const messages = chatController.messages;
		if (messages.length === 0) return true;
		if (messages.length === 1 && messages[0].role === "assistant") return true;
		if (messages.every((msg) => msg.role === "assistant")) return true;
		return false;
	}, [chatController.messages]);

	return (
		<div className="flex h-full flex-col bg-background">
			<HeaderBar
				chatHistoryLabel={tPage("chatHistory")}
				newChatLabel={tPage("newChat")}
				onToggleHistory={() => setHistoryOpen(!historyOpen)}
				onNewChat={chatController.handleNewChat}
				historyOpen={historyOpen}
			/>

			<div className="relative flex min-h-0 flex-1">
				<div
					ref={historyPanelRef}
					aria-hidden={!historyOpen}
					className={cn(
						"absolute left-0 top-0 z-30 flex h-full w-72 flex-col border-r border-border bg-background/95 shadow-lg backdrop-blur-sm transition-transform duration-200 ease-out",
						"sm:w-80",
						historyOpen
							? "translate-x-0 opacity-100"
							: "-translate-x-full opacity-0 pointer-events-none",
					)}
				>
					<div className="flex items-center justify-between border-b border-border px-4 py-2.5">
						<div className="flex items-center gap-2 text-sm font-medium text-foreground">
							<History className="h-4 w-4 text-muted-foreground" />
							<span>{tPage("chatHistory")}</span>
							{historyPinned && (
								<span className="inline-flex items-center gap-1 rounded-full border border-amber-200/70 bg-amber-50/80 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
									<Pin className="h-3 w-3" />
									{tPanelMenu("pinnedBadge")}
								</span>
							)}
						</div>
						<PanelActionButton
							variant="default"
							icon={historyPinned ? PinOff : Pin}
							onClick={() => setHistoryPinned(!historyPinned)}
							aria-label={
								historyPinned
									? tPanelMenu("unpinPanel")
									: tPanelMenu("pinPanel")
							}
						/>
					</div>

					<HistoryDrawer
						historyLoading={chatController.historyLoading}
						historyError={chatController.historyError}
						sessions={chatController.sessions}
						conversationId={chatController.conversationId}
						labels={{
							noHistory: tPage("noHistory"),
							loading: tChat("loading"),
							chatHistory: tPage("chatHistory"),
						}}
						onSelectSession={chatController.handleLoadSession}
						className="flex h-full min-h-0 flex-col border-b-0 bg-transparent"
						listClassName="min-h-0 max-h-none flex-1"
					/>
				</div>

				<div
					className={cn(
						"flex min-h-0 flex-1 flex-col",
						isHistoryDocked && "pl-72 sm:pl-80",
					)}
				>
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
							effectiveTodos={chatController.effectiveTodos}
						/>
					)}

				{/* 首页时在输入框上方显示建议按钮 */}
				{shouldShowSuggestions &&
					(breakdownQuestionnaire.stage === "idle" ||
						breakdownQuestionnaire.stage === "completed") && (
						<PromptSuggestions
							onSelect={handleSelectPrompt}
							className="pb-4"
						/>
					)}

				<ChatInputSection
					locale={locale}
					inputValue={chatController.inputValue}
					isStreaming={chatController.isStreaming}
					error={chatController.error}
					effectiveTodos={chatController.effectiveTodos}
					hasSelection={chatController.hasSelection}
					showTodosExpanded={showTodosExpanded}
					crawlerResult={chatController.selectedCrawlerResult}
					onInputChange={chatController.setInputValue}
					onSend={chatController.handleSend}
					onStop={chatController.handleStop}
					onKeyDown={chatController.handleKeyDown}
					onCompositionStart={() => chatController.setIsComposing(true)}
					onCompositionEnd={() => chatController.setIsComposing(false)}
					onToggleExpand={() => setShowTodosExpanded((prev) => !prev)}
					onClearSelection={clearTodoSelection}
					onToggleTodo={toggleTodoSelection}
					onClearCrawlerSelection={() => setSelectedCrawlerResult(null)}
				/>
			</div>
		</div>
		</div>
	);
}
