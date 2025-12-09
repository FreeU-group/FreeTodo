"use client";

import {
	ChevronDown,
	History,
	Loader2,
	PlusCircle,
	Send,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatHistoryItem, ChatSessionSummary } from "@/lib/api";
import { getChatHistory, sendChatMessageStream } from "@/lib/api";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";
import { useTodoStore } from "@/lib/store/todo-store";
import type { CreateTodoInput } from "@/lib/types/todo";
import { cn } from "@/lib/utils";

type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	content: string;
};

type ChatMode = "ask" | "plan";
type ParsedTodo = Pick<
	CreateTodoInput,
	"name" | "description" | "tags" | "deadline"
>;
type ParsedTodoTree = ParsedTodo & { subtasks?: ParsedTodoTree[] };

const createId = () => {
	if (typeof crypto !== "undefined" && crypto.randomUUID) {
		return crypto.randomUUID();
	}
	return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function ChatPanel() {
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);
	const { addTodo } = useTodoStore();
	const buildInitialAssistantMessage = useCallback(
		() => ({
			id: createId(),
			role: "assistant" as const,
			content:
				locale === "zh"
					? "你好，我是你的待办助手，可以帮你拆解任务、制定计划，也能聊聊生活。"
					: "Hi! I'm your task assistant. I can break down work, plan the day, or just chat.",
		}),
		[locale],
	);
	const [messages, setMessages] = useState<ChatMessage[]>(() => [
		buildInitialAssistantMessage(),
	]);
	const [chatMode, setChatMode] = useState<ChatMode>("ask");
	const [modeMenuOpen, setModeMenuOpen] = useState(false);
	const [inputValue, setInputValue] = useState("");
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [historyOpen, setHistoryOpen] = useState(false);
	const [historyLoading, setHistoryLoading] = useState(false);
	const [historyError, setHistoryError] = useState<string | null>(null);
	const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
	const [isComposing, setIsComposing] = useState(false);

	const messageListRef = useRef<HTMLDivElement>(null);
	const modeMenuRef = useRef<HTMLDivElement | null>(null);

	// 根据当前语言生成提示文本
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

	const planSystemPrompt = useMemo(
		() =>
			locale === "zh"
				? [
						"你是任务规划助手：请先简短说明，再输出一个 JSON 对象，字段为 todos（数组）。",
						"每个 todo: name(必填)、description(可选)、tags(可选字符串数组)、deadline(可选 ISO 8601)、subtasks(可选数组，结构同上)。",
						"若用户只有单一意图，用 1 个根任务，其余步骤放到 subtasks；若存在多个不同意图，则使用多个根任务并在各自 subtasks 中细化。",
						"无法生成待办时，返回空数组并解释原因。只输出一个 JSON，可用 ```json ``` 包裹，JSON 外可保留可读解释。",
					].join("\n")
				: [
						"You are a planning assistant: give a brief explanation, then output ONE JSON object with key `todos` (array).",
						"Each todo: name (required), description (optional), tags (optional string array), deadline (optional ISO 8601), subtasks (optional array with same shape).",
						"If the prompt has a single intent, produce one root todo and put steps in subtasks; if multiple distinct intents, use multiple root todos with their own subtasks.",
						"If nothing actionable, return an empty array but explain. Only one JSON, may be wrapped in ```json ```, natural text may appear outside.",
					].join("\n"),
		[locale],
	);

	const parsePlanTodos = useCallback(
		(
			content: string,
		): {
			todos: ParsedTodoTree[];
			error: string | null;
		} => {
			const findJson = () => {
				const fencedJson = content.match(/```json\s*([\s\S]*?)```/i);
				if (fencedJson?.[1]) return fencedJson[1];

				const fenced = content.match(/```\s*([\s\S]*?)```/);
				if (fenced?.[1]) return fenced[1];

				const inline = content.match(/\{[\s\S]*"todos"[\s\S]*\}/);
				if (inline?.[0]) return inline[0];
				return null;
			};

			const jsonText = findJson();
			if (!jsonText) {
				return {
					todos: [],
					error:
						locale === "zh"
							? "未找到计划 JSON，未创建待办。"
							: "No todo JSON found; no tasks created.",
				};
			}

			try {
				const parsed = JSON.parse(jsonText);
				const rawTodos = Array.isArray(parsed?.todos) ? parsed.todos : [];
				const normalizeTodo = (item: unknown): ParsedTodoTree | null => {
					if (!item || typeof (item as { name?: unknown }).name !== "string") {
						return null;
					}
					const rawName = (item as { name: string }).name.trim();
					if (!rawName) return null;

					const rawDescription = (item as { description?: unknown })
						.description;
					const description =
						typeof rawDescription === "string" && rawDescription.trim()
							? rawDescription.trim()
							: undefined;

					const rawTags = (item as { tags?: unknown }).tags;
					const tags = Array.isArray(rawTags)
						? rawTags
								.filter((tag): tag is string => typeof tag === "string")
								.map((tag) => tag.trim())
								.filter(Boolean)
						: undefined;

					const rawDeadline = (item as { deadline?: unknown }).deadline;
					const deadline =
						typeof rawDeadline === "string" && rawDeadline.trim()
							? rawDeadline.trim()
							: undefined;

					const rawSubtasks = (item as { subtasks?: unknown }).subtasks;
					const subtasks = Array.isArray(rawSubtasks)
						? rawSubtasks
								.map((task: unknown) => normalizeTodo(task))
								.filter((task): task is ParsedTodoTree => Boolean(task))
						: undefined;

					return {
						name: rawName,
						description,
						tags,
						deadline,
						subtasks,
					};
				};

				const todos: ParsedTodoTree[] = rawTodos
					.map((item: unknown) => normalizeTodo(item))
					.filter(
						(item: ParsedTodoTree | null | undefined): item is ParsedTodoTree =>
							Boolean(item),
					);

				if (!todos.length) {
					return {
						todos: [],
						error:
							locale === "zh"
								? "解析完成，但没有有效的待办项。"
								: "Parsed but no valid todos found.",
					};
				}

				return { todos, error: null };
			} catch (err) {
				console.error(err);
				return {
					todos: [],
					error:
						locale === "zh"
							? "解析计划 JSON 失败，未创建待办。"
							: "Failed to parse plan JSON; no tasks created.",
				};
			}
		},
		[locale],
	);

	const buildTodoPayloads = useCallback((trees: ParsedTodoTree[]) => {
		const payloads: CreateTodoInput[] = [];
		const walk = (nodes: ParsedTodoTree[], parentId?: string | null) => {
			nodes.forEach((node) => {
				const id = createId();
				payloads.push({
					id,
					name: node.name,
					description: node.description,
					tags: node.tags,
					deadline: node.deadline,
					parentTodoId: parentId ?? null,
				});
				if (node.subtasks?.length) {
					walk(node.subtasks, id);
				}
			});
		};
		walk(trees, null);
		return payloads;
	}, []);

	const fetchSessions = useCallback(async () => {
		setHistoryLoading(true);
		setHistoryError(null);
		try {
			const res = await getChatHistory(undefined, 30);
			setSessions(res.sessions || []);
		} catch (err) {
			console.error(err);
			setHistoryError(
				locale === "zh" ? "加载历史记录失败" : "Failed to load history",
			);
		} finally {
			setHistoryLoading(false);
		}
	}, [locale]);

	useEffect(() => {
		if (historyOpen) {
			void fetchSessions();
		}
	}, [fetchSessions, historyOpen]);

	// 新消息出现时自动滚动到底部
	useEffect(() => {
		if (messages.length === 0) return;
		const el = messageListRef.current;
		if (el) {
			el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
		}
	}, [messages]);

	const handleNewChat = () => {
		setIsStreaming(false);
		setConversationId(null);
		setMessages([buildInitialAssistantMessage()]);
		setInputValue("");
		setError(null);
		setHistoryOpen(false);
	};

	const handleSend = async () => {
		const text = inputValue.trim();
		if (!text || isStreaming) return;

		setInputValue("");
		setError(null);

		const payloadMessage =
			chatMode === "plan" ? `${planSystemPrompt}\n\n用户输入: ${text}` : text;
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
					message: payloadMessage,
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
			} else if (chatMode === "plan") {
				const { todos, error: parseError } = parsePlanTodos(assistantContent);
				if (parseError) {
					setMessages((prev) =>
						prev.map((msg) =>
							msg.id === assistantMessageId
								? { ...msg, content: `${assistantContent}\n\n${parseError}` }
								: msg,
						),
					);
					setError(parseError);
				} else {
					const payloads = buildTodoPayloads(todos);
					payloads.forEach((todo) => {
						addTodo(todo);
					});
					const addedText =
						locale === "zh"
							? `已添加 ${payloads.length} 条待办到列表。`
							: `Added ${payloads.length} todos to the list.`;
					setMessages((prev) =>
						prev.map((msg) =>
							msg.id === assistantMessageId
								? { ...msg, content: `${assistantContent}\n\n${addedText}` }
								: msg,
						),
					);
				}
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

	const handleLoadSession = async (sessionId: string) => {
		setHistoryLoading(true);
		setHistoryError(null);
		try {
			const res = await getChatHistory(sessionId, 100);
			const history = res.history || [];
			const mapped = history.map((item: ChatHistoryItem) => ({
				id: createId(),
				role: item.role,
				content: item.content,
			}));
			setMessages(mapped.length ? mapped : [buildInitialAssistantMessage()]);
			setConversationId(sessionId);
			setHistoryOpen(false);
		} catch (err) {
			console.error(err);
			setHistoryError(
				locale === "zh" ? "加载会话失败" : "Failed to load session",
			);
		} finally {
			setHistoryLoading(false);
		}
	};

	const handleSuggestionClick = (suggestion: string) => {
		setInputValue(suggestion);
	};

	const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (
			event.key === "Enter" &&
			!event.shiftKey &&
			!isComposing &&
			!event.nativeEvent.isComposing
		) {
			event.preventDefault();
			handleSend();
		}
	};

	return (
		<div className="flex h-full flex-col bg-background">
			<div className="flex flex-col gap-2 p-4">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<Sparkles className="h-5 w-5 text-blue-500" />
						<h1 className="text-lg font-semibold text-foreground">
							{t.page.chatTitle}
						</h1>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => setHistoryOpen((prev) => !prev)}
							className={cn(
								"flex h-9 w-9 items-center justify-center rounded-[var(--radius-panel)]",
								"border border-border text-muted-foreground transition-colors",
								"hover:bg-foreground/5 hover:text-foreground",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
							)}
							aria-label={t.page.chatHistory}
						>
							<History className="h-4 w-4" />
						</button>
						<button
							type="button"
							onClick={handleNewChat}
							className={cn(
								"flex h-9 w-9 items-center justify-center rounded-[var(--radius-panel)]",
								"bg-blue-500 text-white transition-colors",
								"hover:bg-blue-600",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
							)}
							aria-label={t.page.newChat}
						>
							<PlusCircle className="h-4 w-4" />
						</button>
					</div>
				</div>
				<p className="text-sm text-muted-foreground">{t.page.chatSubtitle}</p>
				<p className="text-xs text-muted-foreground">{helperText}</p>
			</div>

			{historyOpen && (
				<div className="border-b border-border bg-muted/40 px-4 py-3">
					<div className="mb-2 flex items-center justify-between">
						<p className="text-sm font-medium text-foreground">
							{t.page.recentSessions}
						</p>
						{historyLoading && (
							<span className="flex items-center gap-2 text-xs text-muted-foreground">
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
								{locale === "zh" ? "加载中" : "Loading"}
							</span>
						)}
					</div>
					{historyError && (
						<p className="text-xs text-red-500">{historyError}</p>
					)}
					{!historyError && (
						<div className="max-h-72 space-y-2 overflow-y-auto pr-1">
							{!historyLoading && sessions.length === 0 ? (
								<p className="text-xs text-muted-foreground">
									{t.page.noHistory}
								</p>
							) : (
								sessions.map((session) => (
									<button
										key={session.session_id}
										type="button"
										onClick={() => handleLoadSession(session.session_id)}
										disabled={historyLoading}
										className={cn(
											"w-full rounded-[var(--radius-panel)] border border-border bg-background px-3 py-2 text-left text-sm",
											"transition-colors hover:bg-foreground/5",
											"disabled:cursor-not-allowed disabled:opacity-60",
											session.session_id === conversationId
												? "ring-2 ring-blue-500"
												: "",
										)}
									>
										<div className="flex items-center justify-between gap-2">
											<span className="font-medium text-foreground">
												{session.title || t.page.chatHistory}
											</span>
											<span className="text-[11px] text-muted-foreground">
												{formatMessageCount(session.message_count)}
											</span>
										</div>
										<div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
											<span className="truncate">
												{session.last_active || session.session_id}
											</span>
											<span className="uppercase tracking-wide">
												{session.chat_type || "default"}
											</span>
										</div>
									</button>
								))
							)}
						</div>
					)}
				</div>
			)}

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

			<div className="bg-background p-4">
				{!modeMenuOpen && (
					<div className="mb-3 flex flex-wrap gap-2">
						{t.page.chatSuggestions.map((suggestion) => (
							<button
								key={suggestion}
								type="button"
								onClick={() => handleSuggestionClick(suggestion)}
								className={cn(
									"px-3 py-2 text-sm",
									"rounded-[var(--radius-panel)] border border-foreground/10",
									"text-foreground transition-colors",
									"hover:bg-foreground/5",
									"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
								)}
							>
								{suggestion}
							</button>
						))}
					</div>
				)}

				<div className="flex items-end gap-2">
					<div className="relative" ref={modeMenuRef}>
						<label className="sr-only" htmlFor="chat-mode">
							{locale === "zh" ? "对话模式" : "Chat mode"}
						</label>
						<button
							type="button"
							id="chat-mode"
							onClick={() => setModeMenuOpen((prev) => !prev)}
							className={cn(
								"flex h-11 items-center gap-2 rounded-[var(--radius-panel)] border border-border bg-muted/60 px-3 text-sm text-foreground",
								"hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
							)}
							aria-label={
								locale === "zh" ? "切换 Ask/Plan 模式" : "Toggle Ask/Plan mode"
							}
						>
							<span>
								{chatMode === "plan"
									? locale === "zh"
										? "Plan 模式"
										: "Plan"
									: locale === "zh"
										? "Ask 模式"
										: "Ask"}
							</span>
							<ChevronDown className="h-4 w-4 text-muted-foreground" />
						</button>
						{modeMenuOpen && (
							<div className="absolute z-20 mb-2 w-32 overflow-hidden rounded-lg border border-border bg-background shadow-lg bottom-full">
								{(["ask", "plan"] as const).map((mode) => (
									<button
										key={mode}
										type="button"
										onClick={() => {
											setChatMode(mode);
											setModeMenuOpen(false);
										}}
										className={cn(
											"flex w-full items-center justify-between px-3 py-2 text-sm transition-colors",
											mode === chatMode
												? "bg-foreground/5 text-foreground"
												: "text-foreground hover:bg-foreground/5",
										)}
									>
										<span>
											{mode === "ask"
												? locale === "zh"
													? "Ask 模式"
													: "Ask"
												: locale === "zh"
													? "Plan 模式"
													: "Plan"}
										</span>
										{mode === chatMode && (
											<span className="text-xs text-blue-500">
												{locale === "zh" ? "当前" : "Active"}
											</span>
										)}
									</button>
								))}
							</div>
						)}
						<p className="mt-1 text-[11px] text-muted-foreground">
							{chatMode === "plan"
								? locale === "zh"
									? "拆解需求并生成待办"
									: "Break down and add todos"
								: locale === "zh"
									? "直接聊天或提问"
									: "Chat freely"}
						</p>
					</div>
					<textarea
						value={inputValue}
						onChange={(e) => setInputValue(e.target.value)}
						onCompositionStart={() => setIsComposing(true)}
						onCompositionEnd={() => setIsComposing(false)}
						onKeyDown={handleKeyDown}
						placeholder={inputPlaceholder}
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
							"flex h-11 w-11 items-center justify-center rounded-[var(--radius-panel)]",
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
