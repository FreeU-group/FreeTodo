import { create } from "zustand";

export interface Notification {
	id: string;
	title: string;
	content: string;
	timestamp: string;
	source?: string;
	todoId?: number;
}

export interface PollingEndpoint {
	id: string;
	url: string;
	interval: number;
	enabled: boolean;
}

interface NotificationStoreState {
	notifications: Notification[];
	endpoints: Map<string, PollingEndpoint>;
	isExpanded: boolean;
	notifiedIds: Set<string>;
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

function isImportantNotification(notification: Notification): boolean {
	const title = notification.title || "";
	return title.includes("邀约") || title.includes("invitation");
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
