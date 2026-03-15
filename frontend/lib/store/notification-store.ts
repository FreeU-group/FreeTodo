import { create } from "zustand";
import { isTauri, isWeb } from "@/lib/utils/platform";

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
	// 当前通知列表
	notifications: Notification[];
	// 轮询端点配置
	endpoints: Map<string, PollingEndpoint>;
	// 展开/收起状态
	isExpanded: boolean;
	// 已触发系统通知的 ID（用于去重）
	notifiedIds: Set<string>;
	// 方法
	setNotificationsFromSource: (source: string, notifications: Notification[]) => void;
	upsertNotification: (notification: Notification) => void;
	removeNotification: (id: string) => void;
	removeNotificationsBySource: (source: string) => void;
	registerEndpoint: (endpoint: PollingEndpoint) => void;
	unregisterEndpoint: (id: string) => void;
	toggleExpanded: () => void;
	setExpanded: (expanded: boolean) => void;
	getEndpoint: (id: string) => PollingEndpoint | undefined;
	getAllEndpoints: () => PollingEndpoint[];
}

function sortNotifications(notifications: Notification[]): Notification[] {
	return [...notifications].sort((a, b) => {
		const aTime = new Date(a.timestamp).getTime();
		const bTime = new Date(b.timestamp).getTime();
		const safeATime = Number.isNaN(aTime) ? 0 : aTime;
		const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
		return safeBTime - safeATime;
	});
}

type TauriNotificationApi = {
	isPermissionGranted?: () => Promise<boolean> | boolean;
	requestPermission?: () => Promise<NotificationPermission> | NotificationPermission;
	sendNotification?: (options: { title: string; body?: string }) => Promise<void> | void;
};

const getTauriNotificationApi = (): TauriNotificationApi | null => {
	if (typeof window === "undefined") return null;
	const tauri = (window as Window & { __TAURI__?: { notification?: TauriNotificationApi } })
		.__TAURI__;
	return tauri?.notification ?? null;
};

let webPermissionRequest: Promise<NotificationPermission> | null = null;

const requestWebPermission = async (): Promise<NotificationPermission> => {
	if (webPermissionRequest) return webPermissionRequest;
	webPermissionRequest = Notification.requestPermission();
	return webPermissionRequest;
};

const showWebNotification = async (_notification: Notification): Promise<void> => {
	// 浏览器原生通知已禁用，所有通知统一由自定义悬浮窗处理
};

const showTauriNotification = async (_notification: Notification): Promise<void> => {
	// Tauri 原生通知已禁用，所有通知统一由自定义悬浮窗处理
};

function isImportantNotification(notification: Notification): boolean {
	const title = notification.title || "";
	return title.includes("邀约") || title.includes("invitation");
}

function notifySystem(_notification: Notification): void {
	// 系统原生通知已禁用，所有通知统一由自定义悬浮窗（signal-popup）处理
	// Electron/浏览器/Tauri 的原生通知均不再触发
	return;
	if (typeof window === "undefined") return;
	if (window.electronAPI?.showNotification) {
		window.electronAPI
			.showNotification({
				id: _notification.id,
				title: _notification.title,
				content: _notification.content,
				timestamp: _notification.timestamp,
			})
			.catch((error) => {
				// 静默处理错误，不影响应用运行
				console.warn("Failed to show system notification:", error);
			});
		return;
	}
	if (isTauri()) {
		void showTauriNotification(notification);
		return;
	}
	if (isWeb()) {
		void showWebNotification(notification);
	}
}

export const useNotificationStore = create<NotificationStoreState>((set, get) => ({
	notifications: [],
	endpoints: new Map(),
	isExpanded: false,
	notifiedIds: new Set(),

	setNotificationsFromSource: (source, notifications) => {
		const current = get().notifications;
		const filtered = current.filter((item) => item.source !== source);
		const tagged = notifications.map((notification) => ({
			...notification,
			source,
		}));
		const next = sortNotifications([...filtered, ...tagged]);

		const nextNotifiedIds = new Set(get().notifiedIds);
		let hasNewImportant = false;
		for (const notification of tagged) {
			if (!nextNotifiedIds.has(notification.id)) {
				notifySystem(notification);
				nextNotifiedIds.add(notification.id);
				if (isImportantNotification(notification)) {
					hasNewImportant = true;
				}
			}
		}

		set({
			notifications: next,
			notifiedIds: nextNotifiedIds,
			...(hasNewImportant ? { isExpanded: true } : {}),
		});
	},

	upsertNotification: (notification) => {
		const current = get().notifications.filter((item) => item.id !== notification.id);
		const next = sortNotifications([...current, notification]);

		const nextNotifiedIds = new Set(get().notifiedIds);
		if (!nextNotifiedIds.has(notification.id)) {
			notifySystem(notification);
			nextNotifiedIds.add(notification.id);
		}

		set({ notifications: next, notifiedIds: nextNotifiedIds });
	},

	removeNotification: (id) => {
		const current = get().notifications;
		const next = current.filter((item) => item.id !== id);
		set({ notifications: next });
	},

	removeNotificationsBySource: (source) => {
		const current = get().notifications;
		const next = current.filter((item) => item.source !== source);
		set({ notifications: next });
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
}));
