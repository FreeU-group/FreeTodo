import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface ChatStoreState {
	conversationId: string | null;
	historyOpen: boolean;
	historyPinned: boolean;
	pendingPrompt: string | null; // 待发送的预设消息（由其他组件触发）
	pendingNewChat: boolean; // 是否需要先开启新会话再发送消息
	setConversationId: (id: string | null) => void;
	setHistoryOpen: (open: boolean) => void;
	setHistoryPinned: (pinned: boolean) => void;
	setPendingPrompt: (prompt: string | null, startNewChat?: boolean) => void;
}

export const useChatStore = create<ChatStoreState>()(
	persist(
		(set) => ({
			conversationId: null,
			historyOpen: false,
			historyPinned: false,
			pendingPrompt: null,
			pendingNewChat: false,
			setConversationId: (id) => set({ conversationId: id }),
			setHistoryOpen: (open) => set({ historyOpen: open }),
			setHistoryPinned: (pinned) => set({ historyPinned: pinned }),
			setPendingPrompt: (prompt, startNewChat = false) =>
				set({ pendingPrompt: prompt, pendingNewChat: startNewChat }),
		}),
		{
			name: "chat-config",
			storage: createJSONStorage(() => {
				return {
					getItem: (name: string): string | null => {
						if (typeof window === "undefined") return null;

						try {
							const stored = localStorage.getItem(name);
							const parsed = stored ? JSON.parse(stored) : null;
							const state = parsed?.state || parsed || {};

							// 验证 conversationId - 刷新后清空，不默认选中历史记录
							const conversationId: string | null = null;

							// 验证 historyOpen
							const historyOpen: boolean =
								typeof state.historyOpen === "boolean"
									? state.historyOpen
									: false;
							const historyPinned: boolean =
								typeof state.historyPinned === "boolean"
									? state.historyPinned
									: false;

							return JSON.stringify({
								state: {
									conversationId,
									historyOpen,
									historyPinned,
								},
							});
						} catch (e) {
							console.error("Error loading chat config:", e);
							return null;
						}
					},
					setItem: (name: string, value: string): void => {
						if (typeof window === "undefined") return;

						try {
							localStorage.setItem(name, value);
						} catch (e) {
							console.error("Error saving chat config:", e);
						}
					},
					removeItem: (name: string): void => {
						if (typeof window === "undefined") return;
						localStorage.removeItem(name);
					},
				};
			}),
		},
	),
);
