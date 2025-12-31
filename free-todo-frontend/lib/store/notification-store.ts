import { create } from "zustand";

export interface Notification {
	id: string;
	title: string;
	content: string;
	timestamp: string;
	source?: string; // 来源端点标识
	todoId?: number; // draft todo 的 ID（如果通知来自 draft todo）
}

export interface PollingEndpoint {
	id: string;
	url: string;
	interval: number; // 毫秒
	enabled: boolean;
}

interface NotificationStoreState {
	// 当前通知
	currentNotification: Notification | null;
	// 轮询端点配置
	endpoints: Map<string, PollingEndpoint>;
	// 展开/收起状态
	isExpanded: boolean;
	// 最后发送系统通知的 ID（用于去重）
	lastNotifiedId: string | null;
	// 方法
	setNotification: (notification: Notification | null) => void;
	registerEndpoint: (endpoint: PollingEndpoint) => void;
	unregisterEndpoint: (id: string) => void;
	toggleExpanded: () => void;
	setExpanded: (expanded: boolean) => void;
	getEndpoint: (id: string) => PollingEndpoint | undefined;
	getAllEndpoints: () => PollingEndpoint[];
}

export const useNotificationStore = create<NotificationStoreState>(
	(set, get) => ({
		currentNotification: null,
		endpoints: new Map(),
		isExpanded: false,
		lastNotifiedId: null,

		setNotification: (notification) => {
			set({ currentNotification: notification });

			// 如果有新通知且与上次通知不同，触发 Electron 系统通知
			if (notification) {
				const { lastNotifiedId } = get();
				const isNewNotification = notification.id !== lastNotifiedId;

				if (isNewNotification) {
					// 更新最后通知的 ID
					set({ lastNotifiedId: notification.id });

					// 在 Electron 环境中显示系统通知
					if (
						typeof window !== "undefined" &&
						window.electronAPI?.showNotification
					) {
						window.electronAPI
							.showNotification({
								id: notification.id,
								title: notification.title,
								content: notification.content,
								timestamp: notification.timestamp,
							})
							.catch((error) => {
								// 静默处理错误，不影响应用运行
								console.warn("Failed to show system notification:", error);
							});
					}
				}
			} else {
				// 通知被清除时，不清除 lastNotifiedId，保持去重状态
				// 这样如果同一个通知再次出现，不会重复触发系统通知
			}
		},

		registerEndpoint: (endpoint) => {
			const { endpoints } = get();
			const newEndpoints = new Map(endpoints);
			newEndpoints.set(endpoint.id, endpoint);
			set({ endpoints: newEndpoints });
		},

		unregisterEndpoint: (id) => {
			const { endpoints } = get();
			const newEndpoints = new Map(endpoints);
			newEndpoints.delete(id);
			set({ endpoints: newEndpoints });
		},

		toggleExpanded: () => {
			set((state) => ({ isExpanded: !state.isExpanded }));
		},

		setExpanded: (expanded) => {
			set({ isExpanded: expanded });
		},

		getEndpoint: (id) => {
			return get().endpoints.get(id);
		},

		getAllEndpoints: () => {
			return Array.from(get().endpoints.values());
		},
	}),
);
