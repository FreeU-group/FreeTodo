import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ChatMode = "ask" | "plan";

interface ChatStoreState {
	chatMode: ChatMode;
	conversationId: string | null;
	historyOpen: boolean;
	setChatMode: (mode: ChatMode) => void;
	setConversationId: (id: string | null) => void;
	setHistoryOpen: (open: boolean) => void;
}

const isValidChatMode = (value: string | null): value is ChatMode => {
	return value === "ask" || value === "plan";
};

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

							// 验证 chatMode
							const chatMode: ChatMode = isValidChatMode(state.chatMode)
								? state.chatMode
								: "ask";

							// 验证 conversationId
							const conversationId: string | null =
								state.conversationId && typeof state.conversationId === "string"
									? state.conversationId
									: null;

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
