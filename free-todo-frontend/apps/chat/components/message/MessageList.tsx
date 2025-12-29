import { ListTodo, Loader2, MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { PromptSuggestions } from "@/apps/chat/components/input/PromptSuggestions";
import { EditModeMessage } from "@/apps/chat/components/message/EditModeMessage";
import { MessageTodoExtractionPanel } from "@/apps/chat/components/message/MessageTodoExtractionPanel";
import type { ChatMessage, ChatMode } from "@/apps/chat/types";
import { buildHierarchicalTodoContext } from "@/apps/chat/utils/todoContext";
import {
	BaseContextMenu,
	type MenuItem,
	useContextMenu,
} from "@/components/common/context-menu/BaseContextMenu";
import { useTodos } from "@/lib/query";
import { toastError } from "@/lib/toast";
import type { Todo, UpdateTodoInput } from "@/lib/types";
import { cn } from "@/lib/utils";

type MessageListProps = {
	messages: ChatMessage[];
	isStreaming: boolean;
	typingText: string;
	locale: string;
	// Edit mode props (optional)
	chatMode?: ChatMode;
	effectiveTodos?: Todo[];
	onUpdateTodo?: (params: {
		id: number;
		input: UpdateTodoInput;
	}) => Promise<Todo>;
	isUpdating?: boolean;
	onSelectPrompt?: (prompt: string) => void;
};

export function MessageList({
	messages,
	isStreaming,
	typingText,
	locale,
	chatMode,
	effectiveTodos = [],
	onUpdateTodo,
	isUpdating = false,
	onSelectPrompt,
}: MessageListProps) {
	const t = useTranslations("chat");
	const tCommon = useTranslations("common");
	const tContextMenu = useTranslations("contextMenu");
	const messageListRef = useRef<HTMLDivElement>(null);
	const { data: allTodos = [] } = useTodos();
	// 跟踪用户是否在底部（或接近底部）
	const isAtBottomRef = useRef(true);
	// 跟踪上一次消息数量，用于检测新消息
	const prevMessageCountRef = useRef(0);
	// 跟踪每个消息的 hover 状态和菜单状态
	const [hoveredMessageId, setHoveredMessageId] = useState<string | null>(null);
	const [menuOpenForMessageId, setMenuOpenForMessageId] = useState<
		string | null
	>(null);
	const messageMenuRefs = useRef<Map<string, HTMLDivElement>>(new Map());
	const { contextMenu, openContextMenu, closeContextMenu } = useContextMenu();
	// 提取待办相关状态 - 按消息ID存储
	const [extractionStates, setExtractionStates] = useState<
		Map<
			string,
			{
				isExtracting: boolean;
				todos: Array<{
					name: string;
					description?: string | null;
					tags: string[];
				}>;
				parentTodoId: number | null;
			}
		>
	>(new Map());

	// 检查是否应该显示预设按钮：消息为空或只有一条初始assistant消息
	const shouldShowSuggestions = useMemo(() => {
		if (messages.length === 0) return true;
		if (messages.length === 1) {
			const msg = messages[0];
			// 如果是assistant消息，则显示预设按钮（不依赖内容严格匹配，避免语言切换时的问题）
			if (msg.role === "assistant") {
				return true;
			}
		}
		// 如果只有assistant消息且没有用户消息，也显示预设按钮
		if (
			messages.length > 0 &&
			messages.every((msg) => msg.role === "assistant")
		) {
			return true;
		}
		return false;
	}, [messages]);

	// 检查是否在底部（允许 30px 的误差）
	const checkIsAtBottom = useCallback(() => {
		const el = messageListRef.current;
		if (!el) return true;
		const threshold = 30;
		return el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;
	}, []);

	// 处理滚动事件
	const handleScroll = useCallback(() => {
		isAtBottomRef.current = checkIsAtBottom();
	}, [checkIsAtBottom]);

	// 滚动到底部
	const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
		const el = messageListRef.current;
		if (el) {
			el.scrollTo({ top: el.scrollHeight, behavior });
		}
	}, []);

	// 当用户发送新消息时，强制滚动到底部
	useEffect(() => {
		if (messages.length === 0) return;

		const currentCount = messages.length;
		const prevCount = prevMessageCountRef.current;
		prevMessageCountRef.current = currentCount;

		// 检测是否是用户发送了新消息（消息数量增加且最后一条是用户消息）
		const lastMessage = messages[messages.length - 1];
		const isNewUserMessage =
			currentCount > prevCount && lastMessage?.role === "user";

		if (isNewUserMessage) {
			// 用户发送新消息时，强制滚动到底部并重置状态
			isAtBottomRef.current = true;
			scrollToBottom();
		}
	}, [messages, scrollToBottom]);

	// 流式输出时，只有在底部才自动滚动
	// biome-ignore lint/correctness/useExhaustiveDependencies: 保持依赖个数恒定以避免 HMR 报错
	useEffect(() => {
		if (!isStreaming) return;
		if (!isAtBottomRef.current) return;

		// 使用 requestAnimationFrame 确保 DOM 更新后再滚动
		const frameId = requestAnimationFrame(() => {
			scrollToBottom("auto");
		});

		return () => cancelAnimationFrame(frameId);
	}, [messages, isStreaming, scrollToBottom]);

	// 如果应该显示预设按钮，则显示预设按钮而不是消息列表
	if (shouldShowSuggestions && onSelectPrompt) {
		return (
			<div className="flex-1 overflow-y-auto" ref={messageListRef}>
				<PromptSuggestions onSelect={onSelectPrompt} />
			</div>
		);
	}

	return (
		<div
			className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
			ref={messageListRef}
			onScroll={handleScroll}
		>
			{messages.map((msg, index) => {
				const isLastMessage = index === messages.length - 1;
				// 判断是否是正在等待首次回复的空 assistant 消息
				const isEmptyStreamingMessage =
					isStreaming &&
					isLastMessage &&
					msg.role === "assistant" &&
					!msg.content;

				// 跳过没有内容的非 streaming assistant 消息
				if (
					!msg.content &&
					msg.role === "assistant" &&
					!isEmptyStreamingMessage
				) {
					return null;
				}

				// Check if this is an edit mode assistant message (non-streaming)
				const isEditModeAssistantMessage =
					chatMode === "edit" &&
					msg.role === "assistant" &&
					msg.content &&
					!isEmptyStreamingMessage &&
					onUpdateTodo;

				// 是否为 assistant 消息且不是空的 streaming 消息
				const isAssistantMessageWithContent =
					msg.role === "assistant" && msg.content && !isEmptyStreamingMessage;

				// 处理消息菜单按钮点击
				const handleMessageMenuClick = (event: React.MouseEvent) => {
					event.stopPropagation();
					const messageBox = messageMenuRefs.current.get(msg.id);
					if (!messageBox) return;

					const rect = messageBox.getBoundingClientRect();
					// 菜单位置：消息框右下角，稍微偏移
					const menuWidth = 180;
					const menuHeight = 60;
					const viewportWidth = window.innerWidth;
					const viewportHeight = window.innerHeight;

					const x = Math.min(
						Math.max(rect.right - menuWidth, 8),
						viewportWidth - menuWidth,
					);
					const y = Math.min(
						Math.max(rect.bottom + 4, 8),
						viewportHeight - menuHeight,
					);

					setMenuOpenForMessageId(msg.id);
					openContextMenu(event, {
						menuWidth,
						menuHeight,
						calculatePosition: () => ({ x, y }),
					});
				};

				// 构建菜单项（仅当菜单为此消息打开时）
				const menuItems: MenuItem[] = [];
				if (isAssistantMessageWithContent && menuOpenForMessageId === msg.id) {
					menuItems.push({
						icon: ListTodo,
						label: tContextMenu("extractButton"),
						onClick: () => {
							// TODO: 实现提取待办功能
							console.log("提取待办，消息ID:", msg.id);
						},
						isFirst: true,
						isLast: true,
					});
				}

				return (
					<div
						key={msg.id}
						className={cn(
							"flex flex-col",
							msg.role === "assistant" ? "items-start" : "items-end",
						)}
					>
						{/* 空的 streaming 消息显示 loading 指示器 */}
						{isEmptyStreamingMessage ? (
							<div className="flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-xs text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								{typingText}
							</div>
						) : isEditModeAssistantMessage ? (
							/* Edit mode: render with append-to-todo functionality */
							<div className="w-full max-w-[90%]">
								<div className="mb-1 text-[11px] uppercase tracking-wide opacity-70 text-foreground">
									{t("assistant")}
								</div>
								<EditModeMessage
									content={msg.content}
									effectiveTodos={effectiveTodos}
									locale={locale}
									onUpdateTodo={onUpdateTodo}
									isUpdating={isUpdating}
								/>
							</div>
						) : (
							<div
								ref={(el) => {
									if (el) {
										messageMenuRefs.current.set(msg.id, el);
									} else {
										messageMenuRefs.current.delete(msg.id);
									}
								}}
								role="group"
								className={cn(
									"relative max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm",
									msg.role === "assistant"
										? "bg-muted text-foreground"
										: "bg-primary text-primary-foreground",
								)}
								onMouseEnter={() => {
									if (isAssistantMessageWithContent) {
										setHoveredMessageId(msg.id);
									}
								}}
								onMouseLeave={() => {
									setHoveredMessageId(null);
								}}
							>
								<div className="mb-1 text-[11px] uppercase tracking-wide opacity-70">
									{msg.role === "assistant" ? t("assistant") : t("user")}
								</div>
								<div className="leading-relaxed relative">
									{/* Hover 时显示的菜单按钮 - 位于右下角 */}
									{hoveredMessageId === msg.id &&
										isAssistantMessageWithContent && (
											<button
												type="button"
												onClick={handleMessageMenuClick}
												className="absolute -bottom-1 -right-1 opacity-70 hover:opacity-100 transition-opacity rounded-full p-1.5 bg-background/80 hover:bg-background shadow-sm border border-border/50"
												aria-label={tContextMenu("extractButton")}
											>
												<MoreVertical className="h-3.5 w-3.5" />
											</button>
										)}
									<ReactMarkdown
										remarkPlugins={[remarkGfm]}
										components={{
											h1: ({ children }) => (
												<h1
													className={cn(
														"text-lg font-bold mb-2 mt-0",
														msg.role === "assistant"
															? "text-foreground"
															: "text-primary-foreground",
													)}
												>
													{children}
												</h1>
											),
											h2: ({ children }) => (
												<h2
													className={cn(
														"text-base font-semibold mb-2 mt-3",
														msg.role === "assistant"
															? "text-foreground"
															: "text-primary-foreground",
													)}
												>
													{children}
												</h2>
											),
											h3: ({ children }) => (
												<h3
													className={cn(
														"text-sm font-semibold mb-1 mt-2",
														msg.role === "assistant"
															? "text-foreground"
															: "text-primary-foreground",
													)}
												>
													{children}
												</h3>
											),
											p: ({ children }) => (
												<p className="my-1.5 leading-relaxed">{children}</p>
											),
											ul: ({ children }) => (
												<ul className="my-2 list-disc pl-5 space-y-0.5">
													{children}
												</ul>
											),
											ol: ({ children }) => (
												<ol className="my-2 list-decimal pl-5 space-y-0.5">
													{children}
												</ol>
											),
											li: ({ children }) => (
												<li className="leading-relaxed">{children}</li>
											),
											strong: ({ children }) => (
												<strong className="font-semibold">{children}</strong>
											),
											code: ({ children }) => (
												<code
													className={cn(
														"px-1.5 py-0.5 rounded text-xs font-mono",
														msg.role === "assistant"
															? "bg-background text-foreground"
															: "bg-primary-foreground/20 text-primary-foreground",
													)}
												>
													{children}
												</code>
											),
											pre: ({ children }) => (
												<pre
													className={cn(
														"rounded p-2 overflow-x-auto my-2 text-xs",
														msg.role === "assistant"
															? "bg-background border border-border"
															: "bg-primary-foreground/20",
													)}
												>
													{children}
												</pre>
											),
											blockquote: ({ children }) => (
												<blockquote
													className={cn(
														"border-l-2 pl-3 my-2 italic",
														msg.role === "assistant"
															? "border-border opacity-80"
															: "border-primary-foreground/50 opacity-90",
													)}
												>
													{children}
												</blockquote>
											),
											a: ({ href, children }) => (
												<a
													href={href}
													className={cn(
														"underline underline-offset-2",
														msg.role === "assistant"
															? "hover:opacity-80"
															: "hover:opacity-90",
													)}
													target="_blank"
													rel="noopener noreferrer"
												>
													{children}
												</a>
											),
										}}
									>
										{msg.content}
									</ReactMarkdown>
								</div>
							</div>
						)}
						{/* 提取待办面板 - 显示在消息下方 */}
						{extractionStates.has(msg.id) && (
							<div
								className={cn(
									"w-full",
									msg.role === "assistant" ? "max-w-[80%]" : "max-w-[80%]",
								)}
							>
								<MessageTodoExtractionPanel
									todos={extractionStates.get(msg.id)?.todos || []}
									parentTodoId={
										extractionStates.get(msg.id)?.parentTodoId || null
									}
									isExtracting={
										extractionStates.get(msg.id)?.isExtracting || false
									}
									onComplete={() => {
										setExtractionStates((prev) => {
											const newMap = new Map(prev);
											newMap.delete(msg.id);
											return newMap;
										});
									}}
								/>
							</div>
						)}
					</div>
				);
			})}
			{/* 消息菜单 */}
			{menuOpenForMessageId && contextMenu.open && (
				<BaseContextMenu
					items={(() => {
						const msg = messages.find((m) => m.id === menuOpenForMessageId);
						if (!msg || msg.role !== "assistant" || !msg.content) return [];
						const extractionState = extractionStates.get(msg.id);
						const isExtractingForThisMessage =
							extractionState?.isExtracting ?? false;
						return [
							{
								icon: isExtractingForThisMessage ? Loader2 : ListTodo,
								label: isExtractingForThisMessage
									? tContextMenu("extracting") || "提取中..."
									: tContextMenu("extractButton"),
								onClick: async () => {
									if (!menuOpenForMessageId) return;
									const targetMessage = messages.find(
										(m) => m.id === menuOpenForMessageId,
									);
									if (!targetMessage) return;

									const messageId = menuOpenForMessageId;
									const currentState = extractionStates.get(messageId);
									if (currentState?.isExtracting) return;

									// 获取目标消息及其之前的所有消息
									const targetIndex = messages.findIndex(
										(m) => m.id === messageId,
									);
									const messagesForExtraction = messages
										.slice(0, targetIndex + 1)
										.map((msg) => ({
											role: msg.role,
											content: msg.content,
										}));

									// 获取父待办ID（使用第一个关联的待办）
									const parentTodoId =
										effectiveTodos.length > 0 ? effectiveTodos[0].id : null;

									// 构建待办上下文
									const todoContext =
										effectiveTodos.length > 0
											? buildHierarchicalTodoContext(
													effectiveTodos,
													allTodos,
													t,
													tCommon,
												)
											: null;

									// 设置提取状态
									setExtractionStates((prev) => {
										const newMap = new Map(prev);
										newMap.set(messageId, {
											isExtracting: true,
											todos: [],
											parentTodoId,
										});
										return newMap;
									});

									closeContextMenu();
									setMenuOpenForMessageId(null);

									try {
										const apiUrl =
											process.env.NEXT_PUBLIC_API_URL ||
											"http://localhost:8000";
										const response = await fetch(
											`${apiUrl}/api/chat/extract-todos-from-messages`,
											{
												method: "POST",
												headers: {
													"Content-Type": "application/json",
												},
												body: JSON.stringify({
													messages: messagesForExtraction,
													parent_todo_id: parentTodoId,
													todo_context: todoContext,
												}),
											},
										);

										if (!response.ok) {
											// 尝试从响应中获取错误信息
											let errorMessage = `提取待办失败 (${response.status})`;
											try {
												const errorData = await response.json();
												if (errorData.detail) {
													errorMessage = errorData.detail;
												} else if (errorData.error_message) {
													errorMessage = errorData.error_message;
												} else if (errorData.message) {
													errorMessage = errorData.message;
												}
											} catch {
												// 如果无法解析 JSON，使用状态文本
												errorMessage = `提取待办失败: ${response.statusText || response.status}`;
											}
											throw new Error(errorMessage);
										}

										const data = await response.json();

										if (data.error_message) {
											toastError(data.error_message);
											setExtractionStates((prev) => {
												const newMap = new Map(prev);
												newMap.delete(messageId);
												return newMap;
											});
											return;
										}

										if (data.todos.length === 0) {
											toastError(t("noTodosFound") || "未发现待办事项");
											setExtractionStates((prev) => {
												const newMap = new Map(prev);
												newMap.delete(messageId);
												return newMap;
											});
											return;
										}

										// 转换格式并模拟流式显示
										const extractedTodos = data.todos.map(
											(todo: {
												name: string;
												description?: string | null;
												tags?: string[];
											}) => ({
												name: todo.name,
												description: todo.description || null,
												tags: todo.tags || [],
											}),
										);

										// 模拟流式显示：逐个添加待办
										for (let i = 0; i < extractedTodos.length; i++) {
											await new Promise((resolve) => setTimeout(resolve, 200));
											setExtractionStates((prev) => {
												const newMap = new Map(prev);
												const current = newMap.get(messageId);
												if (current) {
													newMap.set(messageId, {
														...current,
														todos: extractedTodos.slice(0, i + 1),
													});
												}
												return newMap;
											});
										}

										// 提取完成
										setExtractionStates((prev) => {
											const newMap = new Map(prev);
											const current = newMap.get(messageId);
											if (current) {
												newMap.set(messageId, {
													...current,
													isExtracting: false,
												});
											}
											return newMap;
										});
									} catch (error) {
										console.error("提取待办失败:", error);
										toastError(
											error instanceof Error
												? error.message
												: "提取待办失败，请稍后重试",
										);
										setExtractionStates((prev) => {
											const newMap = new Map(prev);
											newMap.delete(messageId);
											return newMap;
										});
									}
								},
								isFirst: true,
								isLast: true,
							},
						];
					})()}
					open={contextMenu.open}
					position={{ x: contextMenu.x, y: contextMenu.y }}
					onClose={() => {
						setMenuOpenForMessageId(null);
						closeContextMenu();
					}}
				/>
			)}
		</div>
	);
}
