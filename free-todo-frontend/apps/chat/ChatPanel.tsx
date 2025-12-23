"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { useCreateTodo, useTodos, useUpdateTodo } from "@/lib/query";
import { useLocaleStore } from "@/lib/store/locale";
import { usePlanStore } from "@/lib/store/plan-store";
import { useTodoStore } from "@/lib/store/todo-store";
import type { CreateTodoInput, Todo } from "@/lib/types";

export function ChatPanel() {
	const { locale } = useLocaleStore();
	const tChat = useTranslations("chat");
	const tPage = useTranslations("page");

	// 从 TanStack Query 获取 todos 数据（用于 Plan 功能）
	const { data: todos = [] } = useTodos();

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
		isGeneratingQuestions,
		questionStreamingCount,
		questionStreamingTitle,
		error: planError,
		setQuestions,
		setAnswer,
		setSummary,
		setSummaryStreaming,
		setIsGeneratingSummary,
		setQuestionStreaming,
		setIsGeneratingQuestions,
		applyPlan,
	} = usePlanStore();

	const { generateQuestions, generateSummary } = usePlanService();

	// 获取当前正在规划的待办
	const activePlanTodo = useMemo(() => {
		if (!activePlanTodoId) return null;
		return todos.find((todo: Todo) => todo.id === activePlanTodoId) || null;
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
					setIsGeneratingQuestions(true);
					const generatedQuestions = await generateQuestions(
						activePlanTodo.name,
						activePlanTodo.id,
						(count, title) => {
							// 流式更新问题生成进度
							if (!cancelled) {
								setQuestionStreaming(count, title);
							}
						},
					);
					if (!cancelled) {
						console.log("生成的选择题:", generatedQuestions);
						setQuestions(generatedQuestions);
						setIsGeneratingQuestions(false);
					}
				} catch (error) {
					if (!cancelled) {
						console.error("Failed to generate questions:", error);
						// 错误处理：设置错误状态
						usePlanStore.setState({
							error:
								error instanceof Error
									? error.message
									: tChat("generateQuestionsFailed"),
							isLoading: false,
							isGeneratingQuestions: false,
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
		setQuestionStreaming,
		setIsGeneratingQuestions,
		tChat,
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
					error instanceof Error
						? error.message
						: tChat("generateSummaryFailed"),
			});
		}
	}, [
		activePlanTodo,
		answers,
		generateSummary,
		setSummary,
		setIsGeneratingSummary,
		setSummaryStreaming,
		tChat,
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
		selectedTodoIds,
		createTodo: createTodoWithResult,
	});

	const typingText = useMemo(() => tChat("aiThinking"), [tChat]);

	const inputPlaceholder =
		chatMode === "plan"
			? tChat("planModeInputPlaceholder")
			: chatMode === "edit"
				? tChat("editMode.inputPlaceholder")
				: chatMode === "difyTest"
					? tChat("difyTest.inputPlaceholder")
					: tPage("chatInputPlaceholder");

	const formatMessageCount = useCallback(
		(count?: number) => tPage("messagesCount", { count: count ?? 0 }),
		[tPage],
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
				chatHistoryLabel={tPage("chatHistory")}
				newChatLabel={tPage("newChat")}
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
						recentSessions: tPage("recentSessions"),
						noHistory: tPage("noHistory"),
						loading: tChat("loading"),
						chatHistory: tPage("chatHistory"),
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
					/>
				) : (
					<div className="flex-1 flex items-center justify-center">
						<div className="text-center space-y-3">
							{isGeneratingQuestions && questionStreamingCount > 0 ? (
								<div className="flex flex-col items-center gap-2">
									<div className="flex items-center gap-2 rounded-full bg-muted px-4 py-2 text-sm text-muted-foreground">
										<Loader2 className="h-4 w-4 animate-spin" />
										<span>
											{tChat("generatingQuestion", {
												count: questionStreamingCount,
											})}
										</span>
									</div>
									{questionStreamingTitle && (
										<p className="text-sm text-foreground max-w-md">
											{questionStreamingTitle}
										</p>
									)}
								</div>
							) : (
								<p className="text-muted-foreground">
									{tChat("generatingQuestions")}
								</p>
							)}
							{planError && (
								<p className="mt-2 text-sm text-destructive">{planError}</p>
							)}
						</div>
					</div>
				))}

			{/* 流式生成总结阶段 */}
			{isGeneratingSummary && (
				<SummaryStreaming streamingText={summaryStreamingText || ""} />
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
					chatMode={chatMode}
					effectiveTodos={effectiveTodos}
					onUpdateTodo={updateTodoMutation.mutateAsync}
					isUpdating={updateTodoMutation.isPending}
				/>
			)}

			<div className="bg-background p-4">
				<InputBox
					linkedTodos={
						<LinkedTodos
							effectiveTodos={effectiveTodos}
							hasSelection={hasSelection}
							locale={locale}
							showTodosExpanded={showTodosExpanded}
							onToggleExpand={() => setShowTodosExpanded((prev) => !prev)}
							onClearSelection={clearTodoSelection}
							onToggleTodo={toggleTodoSelection}
						/>
					}
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
