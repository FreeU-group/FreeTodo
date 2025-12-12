"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HeaderBar } from "@/apps/chat/HeaderBar";
import { HistoryDrawer } from "@/apps/chat/HistoryDrawer";
import { useChatController } from "@/apps/chat/hooks/useChatController";
import { InputBox } from "@/apps/chat/InputBox";
import { LinkedTodos } from "@/apps/chat/LinkedTodos";
import { MessageList } from "@/apps/chat/MessageList";
import { ModeSwitcher } from "@/apps/chat/ModeSwitcher";
import { Suggestions } from "@/apps/chat/Suggestions";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";
import { useTodoStore } from "@/lib/store/todo-store";

export function ChatPanel() {
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);
	const { addTodo, todos, selectedTodoIds, clearTodoSelection } =
		useTodoStore();

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
		handleSuggestionClick,
		handleKeyDown,
		effectiveTodos,
		hasSelection,
	} = useChatController({
		locale,
		todos,
		selectedTodoIds,
		addTodo,
	});

	const typingText = useMemo(
		() => (locale === "zh" ? "AI 正在思考..." : "AI is thinking..."),
		[locale],
	);

	const helperText = useMemo(
		() =>
			chatMode === "plan"
				? locale === "zh"
					? "Plan 模式：描述目标，AI 会拆解并生成待办。"
					: "Plan mode: describe your goal and I will create todos."
				: locale === "zh"
					? "Ask 模式：直接聊天或询问任务相关问题。"
					: "Ask mode: chat or ask about your tasks.",
		[chatMode, locale],
	);

	const inputPlaceholder =
		chatMode === "plan"
			? locale === "zh"
				? "例如：帮我规划周末搬家需要做的事"
				: "e.g. Help me plan the tasks for moving this weekend"
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
			<div className="flex flex-col gap-2 p-4">
				<HeaderBar
					title={t.page.chatTitle}
					chatHistoryLabel={t.page.chatHistory}
					newChatLabel={t.page.newChat}
					onToggleHistory={() => setHistoryOpen((prev) => !prev)}
					onNewChat={handleNewChat}
				/>
				<p className="text-sm text-muted-foreground">{t.page.chatSubtitle}</p>
				<p className="text-xs text-muted-foreground">{helperText}</p>
			</div>

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
						loading: locale === "zh" ? "加载中" : "Loading",
						chatHistory: t.page.chatHistory,
					}}
					onSelectSession={handleLoadSession}
				/>
			)}

			<MessageList
				messages={messages}
				isStreaming={isStreaming}
				typingText={typingText}
				locale={locale}
			/>

			<div className="bg-background p-4">
				{!modeMenuOpen && (
					<Suggestions
						suggestions={t.page.chatSuggestions}
						onSelect={handleSuggestionClick}
					/>
				)}

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
