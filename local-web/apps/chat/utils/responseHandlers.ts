import type { useTranslations } from "next-intl";
import type { ChatMessage } from "@/apps/chat/types";

/**
 * 处理流式请求错误
 */
export function handleStreamError(
	err: unknown,
	abortController: AbortController,
	assistantContent: string,
	assistantMessageId: string,
	t: ReturnType<typeof useTranslations<"chat">>,
	setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
	setError: React.Dispatch<React.SetStateAction<string | null>>,
): void {
	if (
		abortController.signal.aborted ||
		(err instanceof Error && err.name === "AbortError")
	) {
		// 用户主动取消
		if (!assistantContent) {
			setMessages((prev) =>
				prev.filter((msg) => msg.id !== assistantMessageId),
			);
		}
	} else {
		console.error(err);
		const fallback = t("errorOccurred");
		setMessages((prev) =>
			prev.map((msg) =>
				msg.id === assistantMessageId ? { ...msg, content: fallback } : msg,
			),
		);
		setError(fallback);
	}
}

/**
 * 处理空响应
 */
export function handleEmptyResponse(
	assistantMessageId: string,
	t: ReturnType<typeof useTranslations<"chat">>,
	setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
): void {
	const fallback = t("noResponseReceived");
	setMessages((prev) =>
		prev.map((msg) =>
			msg.id === assistantMessageId ? { ...msg, content: fallback } : msg,
		),
	);
}
