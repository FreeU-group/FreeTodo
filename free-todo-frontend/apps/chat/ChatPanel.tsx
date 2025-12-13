"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeaderBar } from "@/apps/chat/HeaderBar";
import { HistoryDrawer } from "@/apps/chat/HistoryDrawer";
import { useChatController } from "@/apps/chat/hooks/useChatController";
import { usePlanService } from "@/apps/chat/hooks/usePlanService";
import { InputBox } from "@/apps/chat/InputBox";
import { LinkedTodos } from "@/apps/chat/LinkedTodos";
import { MessageList } from "@/apps/chat/MessageList";
import { ModeSwitcher } from "@/apps/chat/ModeSwitcher";
import { PlanSummary } from "@/apps/chat/PlanSummary";
import { Questionnaire } from "@/apps/chat/Questionnaire";
import { SummaryStreaming } from "@/apps/chat/SummaryStreaming";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";
import { usePlanStore } from "@/lib/store/plan-store";
import { useTodoStore } from "@/lib/store/todo-store";

export function ChatPanel() {
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);
	const { createTodoWithResult, todos, selectedTodoIds, clearTodoSelection } =
		useTodoStore();

	// Plan功能相关状态
	const {
		activePlanTodoId,
		stage,
		questions,
		answers,
		summary,
		subtasks,
		isLoading: planLoading,
		isGeneratingSummary,
		summaryStreamingText,
		error: planError,
		setQuestions,
		setAnswer,
		setSummary,
		setSummaryStreaming,
		setIsGeneratingSummary,
		applyPlan,
	} = usePlanStore();

	const { generateQuestions, generateSummary } = usePlanService();

	// 获取当前正在规划的待办
	const activePlanTodo = useMemo(() => {
		if (!activePlanTodoId) return null;
		return todos.find((t) => t.id === activePlanTodoId) || null;
	}, [activePlanTodoId, todos]);

	// 当进入questionnaire阶段时，生成选择题
	useEffect(() => {
		if (
			stage === "questionnaire" &&
			activePlanTodo &&
			questions.length === 0 &&
			planLoading
		) {
			let cancelled = false;
			const generate = async () => {
				try {
					console.log(
						"开始生成选择题，任务名称:",
						activePlanTodo.name,
						"任务ID:",
						activePlanTodo.id,
					);
					const generatedQuestions = await generateQuestions(
						activePlanTodo.name,
						activePlanTodo.id,
					);
					if (!cancelled) {
						console.log("生成的选择题:", generatedQuestions);
						setQuestions(generatedQuestions);
					}
				} catch (error) {
					if (!cancelled) {
						console.error("Failed to generate questions:", error);
						// 错误处理：设置错误状态
						usePlanStore.setState({
							error:
								error instanceof Error
									? error.message
									: t.chat.generateQuestionsFailed,
							isLoading: false,
						});
					}
				}
			};
			void generate();
			return () => {
				cancelled = true;
			};
		}
	}, [
		stage,
		activePlanTodo,
		questions.length,
		planLoading,
		generateQuestions,
		setQuestions,
		t.chat.generateQuestionsFailed,
	]);

	// 处理提交回答
	const handleSubmitAnswers = useCallback(async () => {
		if (!activePlanTodo) return;

		try {
			// 设置生成状态
			setIsGeneratingSummary(true);
			setSummaryStreaming("");

			// 流式生成总结
			const result = await generateSummary(
				activePlanTodo.name,
				answers,
				(streamingText) => {
					// 实时更新流式文本
					setSummaryStreaming(streamingText);
				},
			);

			// 生成完成，设置最终结果
			setSummary(result.summary, result.subtasks);
		} catch (error) {
			console.error("Failed to generate summary:", error);
			setIsGeneratingSummary(false);
			setSummaryStreaming(null);
			// 设置错误状态
			usePlanStore.setState({
				error:
					error instanceof Error ? error.message : t.chat.generateSummaryFailed,
			});
		}
	}, [
		activePlanTodo,
		answers,
		generateSummary,
		setSummary,
		setIsGeneratingSummary,
		setSummaryStreaming,
		t.chat.generateSummaryFailed,
	]);

	// 处理接收计划
	const handleAcceptPlan = useCallback(async () => {
		await applyPlan();
	}, [applyPlan]);

	const [modeMenuOpen, setModeMenuOpen] = useState(false);
	const [showTodosExpanded, setShowTodosExpanded] = useState(false);
	const modeMenuRef = useRef<HTMLDivElement | null>(null);

	const {
		chatMode,
		setChatMode,
		messages,
		inputValue,
		setInputValue,
		conversationId,
		isStreaming,
		error,
		historyOpen,
		setHistoryOpen,
		historyLoading,
		historyError,
		sessions,
		setIsComposing,
		handleSend,
		handleNewChat,
		handleLoadSession,
		handleKeyDown,
		effectiveTodos,
		hasSelection,
	} = useChatController({
		locale,
		todos,
		selectedTodoIds,
		createTodo: createTodoWithResult,
	});

	const typingText = useMemo(() => t.chat.aiThinking, [t.chat.aiThinking]);

	const inputPlaceholder =
		chatMode === "plan"
			? t.chat.planModeInputPlaceholder
			: t.page.chatInputPlaceholder;

	const formatMessageCount = useCallback(
		(count?: number) =>
			(t.page.messagesCount || "{count}").replace(
				"{count}",
				String(count ?? 0),
			),
		[t.page.messagesCount],
	);

	useEffect(() => {
		if (!modeMenuOpen) return;
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as Node;
			if (modeMenuRef.current?.contains(target)) return;
			setModeMenuOpen(false);
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [modeMenuOpen]);

	return (
		<div className="flex h-full flex-col bg-background">
			<HeaderBar
				chatHistoryLabel={t.page.chatHistory}
				newChatLabel={t.page.newChat}
				onToggleHistory={() => setHistoryOpen(!historyOpen)}
				onNewChat={handleNewChat}
			/>

			{historyOpen && (
				<HistoryDrawer
					historyLoading={historyLoading}
					historyError={historyError}
					sessions={sessions}
					conversationId={conversationId}
					formatMessageCount={formatMessageCount}
					labels={{
						recentSessions: t.page.recentSessions,
						noHistory: t.page.noHistory,
						loading: t.chat.loading,
						chatHistory: t.page.chatHistory,
					}}
					onSelectSession={handleLoadSession}
				/>
			)}

			{/* Plan功能：根据阶段显示不同内容 */}
			{stage === "questionnaire" &&
				(questions.length > 0 ? (
					<Questionnaire
						questions={questions}
						answers={answers}
						onAnswerChange={setAnswer}
						onSubmit={handleSubmitAnswers}
						isSubmitting={isGeneratingSummary}
						disabled={isGeneratingSummary}
						locale={locale}
					/>
				) : (
					<div className="flex-1 flex items-center justify-center">
						<div className="text-center">
							<p className="text-muted-foreground">
								{t.chat.generatingQuestions}
							</p>
							{planError && (
								<p className="mt-2 text-sm text-destructive">{planError}</p>
							)}
						</div>
					</div>
				))}

			{/* 流式生成总结阶段 */}
			{isGeneratingSummary && (
				<SummaryStreaming
					streamingText={summaryStreamingText || ""}
					locale={locale}
				/>
			)}

			{/* 总结展示阶段（生成完成后） */}
			{stage === "summary" && summary && subtasks && !isGeneratingSummary && (
				<PlanSummary
					summary={summary}
					subtasks={subtasks}
					onAccept={handleAcceptPlan}
					isApplying={planLoading}
					locale={locale}
				/>
			)}

			{/* 正常聊天模式 */}
			{(stage === "idle" || stage === "completed") && (
				<MessageList
					messages={messages}
					isStreaming={isStreaming}
					typingText={typingText}
					locale={locale}
				/>
			)}

			<div className="bg-background p-4">
				<LinkedTodos
					effectiveTodos={effectiveTodos}
					hasSelection={hasSelection}
					locale={locale}
					showTodosExpanded={showTodosExpanded}
					onToggleExpand={() => setShowTodosExpanded((prev) => !prev)}
					onClearSelection={clearTodoSelection}
				/>

				<InputBox
					modeSwitcher={
						<div className="relative" ref={modeMenuRef}>
							<ModeSwitcher
								chatMode={chatMode}
								locale={locale}
								modeMenuOpen={modeMenuOpen}
								onToggleMenu={() => setModeMenuOpen((prev) => !prev)}
								onChangeMode={(mode) => {
									setChatMode(mode);
									setModeMenuOpen(false);
								}}
								variant="inline"
							/>
						</div>
					}
					inputValue={inputValue}
					placeholder={inputPlaceholder}
					isStreaming={isStreaming}
					locale={locale}
					onChange={setInputValue}
					onSend={handleSend}
					onKeyDown={handleKeyDown}
					onCompositionStart={() => setIsComposing(true)}
					onCompositionEnd={() => setIsComposing(false)}
				/>

				{error && <p className="mt-2 text-sm text-destructive">{error}</p>}
			</div>
		</div>
	);
}
