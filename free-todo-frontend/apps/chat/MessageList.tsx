import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: 保持依赖个数恒定以避免 HMR 报错
	useEffect(() => {
		if (messages.length === 0) return;
		const el = messageListRef.current;
		if (el) {
			el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
		}
	}, [messages, isStreaming]);

	return (
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
								{msg.content || typingText}
							</ReactMarkdown>
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
	);
}
