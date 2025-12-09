"use client";

import { Loader2, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { sendChatMessageStream } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";
import { cn } from "@/lib/utils";

type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
};

const createId = () => {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function ChatPanel() {
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);
	const [messages, setMessages] = useState<ChatMessage[]>(() => [
		{
			id: createId(),
			role: "assistant",
			content:
				locale === "zh"
					? "你好，我是你的待办助手，可以帮你拆解任务、制定计划，也能聊聊生活。"
					: "Hi! I'm your task assistant. I can break down work, plan the day, or just chat.",
		},
	]);
	const [inputValue, setInputValue] = useState("");
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const messageListRef = useRef<HTMLDivElement>(null);

	// 根据当前语言生成提示文本
	const typingText = useMemo(
		() => (locale === "zh" ? "AI 正在思考..." : "AI is thinking..."),
		[locale],
	);
	const helperText = useMemo(
		() =>
			locale === "zh"
				? "试着描述你的任务、日程或想了解的任何内容。"
				: "Describe your tasks, schedule, or anything you want to explore.",
		[locale],
	);

	// 新消息出现时自动滚动到底部
	useEffect(() => {
		if (messages.length === 0) return;
		const el = messageListRef.current;
		if (el) {
			el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
		}
	}, [messages]);

	const handleSend = async () => {
		const text = inputValue.trim();
		if (!text || isStreaming) return;

		setInputValue("");
		setError(null);

		const userMessage: ChatMessage = {
			id: createId(),
			role: "user",
			content: text,
		};
		const assistantMessageId = createId();

		setMessages((prev) => [
			...prev,
			userMessage,
			{ id: assistantMessageId, role: "assistant", content: "" },
		]);
		setIsStreaming(true);

		let assistantContent = "";

		try {
			await sendChatMessageStream(
				{
					message: text,
					conversation_id: conversationId || undefined,
				},
				(chunk) => {
					assistantContent += chunk;
					setMessages((prev) =>
						prev.map((msg) =>
							msg.id === assistantMessageId
								? { ...msg, content: assistantContent }
								: msg,
						),
					);
				},
				(sessionId) => {
					setConversationId((prev) => prev || sessionId);
				},
			);

			if (!assistantContent) {
				const fallback =
					locale === "zh"
						? "没有收到回复，请稍后再试。"
						: "No response received, please try again.";
				setMessages((prev) =>
					prev.map((msg) =>
						msg.id === assistantMessageId ? { ...msg, content: fallback } : msg,
					),
				);
			}
		} catch (err) {
			console.error(err);
			const fallback =
				locale === "zh"
					? "出错了，请稍后再试。"
					: "Something went wrong. Please try again.";
			setMessages((prev) =>
				prev.map((msg) =>
					msg.id === assistantMessageId ? { ...msg, content: fallback } : msg,
				),
			);
			setError(fallback);
		} finally {
			setIsStreaming(false);
		}
	};

	const handleSuggestionClick = (suggestion: string) => {
		setInputValue(suggestion);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			handleSend();
		}
	};

	return (
		<div className="flex h-full flex-col bg-background">
			<div className="flex flex-col gap-2 border-b border-border p-4">
				<div className="flex items-center gap-2">
					<Sparkles className="h-5 w-5 text-blue-500" />
					<h1 className="text-lg font-semibold text-foreground">
						{t.page.chatTitle}
					</h1>
				</div>
				<p className="text-sm text-muted-foreground">{t.page.chatSubtitle}</p>
				<p className="text-xs text-muted-foreground">{helperText}</p>
			</div>

			<div
				className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
				ref={messageListRef}
			>
				{messages.map((msg) => (
					<div
						key={msg.id}
						className={cn(
							"flex",
							msg.role === "assistant" ? "justify-start" : "justify-end",
						)}
					>
						<div
							className={cn(
								"max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm",
								msg.role === "assistant"
									? "bg-muted text-foreground"
									: "bg-blue-500 text-white",
							)}
						>
							<div className="mb-1 text-[11px] uppercase tracking-wide opacity-70">
								{msg.role === "assistant"
									? locale === "zh"
										? "助理"
										: "Assistant"
									: locale === "zh"
										? "我"
										: "You"}
							</div>
							<div className="whitespace-pre-wrap leading-relaxed">
								{msg.content || typingText}
							</div>
						</div>
					</div>
				))}
				{isStreaming && (
					<div className="flex justify-start">
						<div className="flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-xs text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							{typingText}
						</div>
					</div>
				)}
			</div>

			<div className="border-t border-border bg-background p-4">
				<div className="mb-3 flex flex-wrap gap-2">
					{t.page.chatSuggestions.map((suggestion) => (
						<button
							key={suggestion}
							type="button"
							onClick={() => handleSuggestionClick(suggestion)}
							className={cn(
								"px-3 py-2 text-sm",
								"rounded-full border border-foreground/10",
								"text-foreground transition-colors",
								"hover:bg-foreground/5",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
							)}
						>
							{suggestion}
						</button>
					))}
				</div>

				<div className="flex items-end gap-2">
					<textarea
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={t.page.chatInputPlaceholder}
						rows={2}
						className={cn(
							"flex-1 resize-none rounded-2xl border border-border bg-muted/60 px-4 py-3",
							"text-foreground placeholder:text-muted-foreground",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
						)}
					/>
					<button
						type="button"
						onClick={handleSend}
						disabled={!inputValue.trim() || isStreaming}
						className={cn(
							"flex h-11 w-11 items-center justify-center rounded-full",
							"bg-blue-500 text-white transition-colors",
							"hover:bg-blue-600",
							"disabled:cursor-not-allowed disabled:opacity-50",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
						)}
						aria-label={t.page.chatSendButton}
					>
						{isStreaming ? (
							<Loader2 className="h-5 w-5 animate-spin" />
						) : (
							<Send className="h-5 w-5" />
						)}
					</button>
				</div>

				{error && <p className="mt-2 text-sm text-red-500">{error}</p>}
			</div>
		</div>
	);
}
