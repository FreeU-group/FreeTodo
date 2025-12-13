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

		setNotification: (notification) => {
			set({ currentNotification: notification });
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
