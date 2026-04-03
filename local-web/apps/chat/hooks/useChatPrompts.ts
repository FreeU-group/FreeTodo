import { useEffect, useState } from "react";
import { unwrapApiData } from "@/lib/api/fetcher";
import { getChatPromptsApiGetChatPromptsGet } from "@/lib/generated/config/config";

/**
 * 聊天提示词响应接口
 */
interface ChatPromptsResponse {
	success: boolean;
	editSystemPrompt: string;
	planSystemPrompt: string;
}

/**
 * 管理 editSystemPrompt 的异步加载
 *
 * @param locale - 语言设置
 * @returns editSystemPrompt 和加载状态
 */
export const useChatPrompts = (locale: string) => {
	const [editSystemPrompt, setEditSystemPrompt] = useState<string>("");
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		let cancelled = false;

		async function loadPrompts() {
			setIsLoading(true);
			try {
				const response = await getChatPromptsApiGetChatPromptsGet({
					locale,
				});
				const data = unwrapApiData<ChatPromptsResponse>(response);

				if (!cancelled && data?.success) {
					setEditSystemPrompt(data.editSystemPrompt);
				}
			} catch (error) {
				console.error("Failed to load chat prompts:", error);
				// 如果加载失败，使用空字符串（向后兼容）
				if (!cancelled) {
					setEditSystemPrompt("");
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		void loadPrompts();

		return () => {
			cancelled = true;
		};
	}, [locale]);

	return {
		editSystemPrompt,
		isLoading,
	};
};
