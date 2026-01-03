import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { ChatMode } from "@/apps/chat/types";

interface ChatStoreState {
	chatMode: ChatMode;
	conversationId: string | null;
	historyOpen: boolean;
	webSearchEnabled: boolean;
	setChatMode: (mode: ChatMode) => void;
	setConversationId: (id: string | null) => void;
	setHistoryOpen: (open: boolean) => void;
	setWebSearchEnabled: (enabled: boolean) => void;
}

const isValidChatMode = (value: string | null): value is ChatMode => {
	return (
		value === "ask" ||
		value === "plan" ||
		value === "edit" ||
		value === "difyTest"
	);
};

export const useChatStore = create<ChatStoreState>()(
	persist(
		(set) => ({
			chatMode: "ask",
			conversationId: null,
			historyOpen: false,
			webSearchEnabled: false,
			setChatMode: (mode) => set({ chatMode: mode }),
			setConversationId: (id) => set({ conversationId: id }),
			setHistoryOpen: (open) => set({ historyOpen: open }),
			setWebSearchEnabled: (enabled) => set({ webSearchEnabled: enabled }),
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

							// 验证 chatMode
							const chatMode: ChatMode = isValidChatMode(state.chatMode)
								? state.chatMode
								: "ask";

							// 验证 conversationId - 刷新后清空，不默认选中历史记录
							const conversationId: string | null = null;

							// 验证 historyOpen
							const historyOpen: boolean =
								typeof state.historyOpen === "boolean"
									? state.historyOpen
									: false;

							// 验证 webSearchEnabled
							const webSearchEnabled: boolean =
								typeof state.webSearchEnabled === "boolean"
									? state.webSearchEnabled
									: false;

							return JSON.stringify({
								state: {
									chatMode,
									conversationId,
									historyOpen,
									webSearchEnabled,
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
