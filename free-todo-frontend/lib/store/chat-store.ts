import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ChatMode } from "@/apps/chat/types";

interface ChatStoreState {
	chatMode: ChatMode;
	conversationId: string | null;
	historyOpen: boolean;
	setChatMode: (mode: ChatMode) => void;
	setConversationId: (id: string | null) => void;
	setHistoryOpen: (open: boolean) => void;
}

export const useChatStore = create<ChatStoreState>()(
	persist(
		(set) => ({
			chatMode: "ask",
			conversationId: null,
			historyOpen: false,
			setChatMode: (mode) => set({ chatMode: mode }),
			setConversationId: (id) => set({ conversationId: id }),
			setHistoryOpen: (open) => set({ historyOpen: open }),
		}),
		{
			name: "chat-config",
			storage: createJSONStorage(() => {
				return {
					getItem: (name: string): string | null => {
						if (typeof window === "undefined") return null;

						try {
							const stored = localStorage.getItem(name);
							if (!stored) return null;

							const parsed = JSON.parse(stored);
							const state = parsed.state || parsed;

							// chatMode 始终使用默认值 "ask"，不再从 localStorage 恢复
							// 用户每次对话默认进入 Ask 模式
							const chatMode: ChatMode = "ask";

							// 验证 conversationId - 刷新后清空，不默认选中历史记录
							const conversationId: string | null = null;

							// 验证 historyOpen
							const historyOpen: boolean =
								typeof state.historyOpen === "boolean"
									? state.historyOpen
									: false;

							return JSON.stringify({
								state: {
									chatMode,
									conversationId,
									historyOpen,
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
