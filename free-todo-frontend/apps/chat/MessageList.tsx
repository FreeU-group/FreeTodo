import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "@/apps/chat/types";
import { cn } from "@/lib/utils";

type MessageListProps = {
	messages: ChatMessage[];
	isStreaming: boolean;
	typingText: string;
	locale: string;
};

export function MessageList({
	messages,
	isStreaming,
	typingText,
	locale,
}: MessageListProps) {
	const messageListRef = useRef<HTMLDivElement>(null);
	// 跟踪用户是否在底部（或接近底部）
	const isAtBottomRef = useRef(true);
	// 跟踪上一次消息数量，用于检测新消息
	const prevMessageCountRef = useRef(0);

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
	// biome-ignore lint/correctness/useExhaustiveDependencies: 保持依赖个数恒定以避免 HMR 报错
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

				return (
					<div
						key={msg.id}
						className={cn(
							"flex",
							msg.role === "assistant" ? "justify-start" : "justify-end",
						)}
					>
						{/* 空的 streaming 消息显示 loading 指示器 */}
						{isEmptyStreamingMessage ? (
							<div className="flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-xs text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" />
								{typingText}
							</div>
						) : (
							<div
								className={cn(
									"max-w-[80%] rounded-2xl px-4 py-3 text-sm shadow-sm",
									msg.role === "assistant"
										? "bg-muted text-foreground"
										: "bg-primary text-primary-foreground",
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
								<div className="leading-relaxed">
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
					</div>
				);
			})}
		</div>
	);
}
