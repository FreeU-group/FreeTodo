import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
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
	);
}
