import { unwrapApiData } from "@/lib/api/fetcher";
import { getNotificationApiNotificationsGet } from "@/lib/generated/notifications/notifications";
import { listTodosApiTodosGet } from "@/lib/generated/todos/todos";
import type {
	Notification,
	PollingEndpoint,
} from "@/lib/store/notification-store";
import { useNotificationStore } from "@/lib/store/notification-store";
import type { TodoListResponse } from "@/lib/types";

// 通知响应类型（后端 OpenAPI 未定义响应 schema，手动定义）
interface NotificationResponse {
	id?: string;
	title: string;
	content: string;
	timestamp?: string;
	todoId?: number;
	notification_type?: string;
}

class NotificationPoller {
	private timers: Map<string, NodeJS.Timeout> = new Map();
	private endpointConfigs: Map<string, string> = new Map();
	private isPageVisible: boolean = true;

	constructor() {
		// 监听页面可见性变化
		if (typeof document !== "undefined") {
			document.addEventListener("visibilitychange", () => {
				this.isPageVisible = !document.hidden;
				if (this.isPageVisible) {
					// 页面可见时恢复所有轮询
					this.resumeAll();
				} else {
					// 页面隐藏时暂停所有轮询
					this.pauseAll();
				}
			});
		}
	}

	/**
	 * 注册并启动轮询端点
	 */
	registerEndpoint(endpoint: PollingEndpoint): void {
		// 如果已存在，先停止旧的
		this.unregisterEndpoint(endpoint.id);

		if (!endpoint.enabled) {
			return;
		}

		// 立即执行一次
		this.pollEndpoint(endpoint);

		// 设置定时器
		const timer = setInterval(() => {
			if (this.isPageVisible) {
				this.pollEndpoint(endpoint);
			}
		}, endpoint.interval);

		this.timers.set(endpoint.id, timer);
		this.endpointConfigs.set(endpoint.id, this.getEndpointConfigKey(endpoint));
	}

	/**
	 * 注销并停止轮询端点
	 */
	unregisterEndpoint(id: string): void {
		const timer = this.timers.get(id);
		if (timer) {
			clearInterval(timer);
			this.timers.delete(id);
		}
		this.endpointConfigs.delete(id);
	}

	/**
	 * 轮询单个端点
	 */
	private async pollEndpoint(endpoint: PollingEndpoint): Promise<void> {
		try {
			// 检查是否是 draft todo 端点
			if (
				endpoint.url.includes("/api/todos") &&
				endpoint.url.includes("status=draft")
			) {
				await this.pollDraftTodos(endpoint);
				return;
			}

			// 标准通知端点 - 使用 Orval 生成的 API
			const response = await getNotificationApiNotificationsGet();
			const notificationData = unwrapApiData<
				NotificationResponse[] | NotificationResponse | null
			>(response);

			const rawList = Array.isArray(notificationData)
				? notificationData
				: notificationData
					? [notificationData]
					: [];

			const notifications: Notification[] = rawList
				.filter((item) => item && (item.title || item.content))
				.map((item, index) => ({
					id:
						item.id ||
						`${endpoint.id}-${item.timestamp || Date.now()}-${index}`,
					title: item.title,
					content: item.content,
					timestamp: item.timestamp || new Date().toISOString(),
					source: endpoint.id,
					todoId: item.todoId,
				}));

			const store = useNotificationStore.getState();

			for (const n of notifications) {
				if (!store.notifiedIds.has(n.id)) {
					this.triggerElectronPopupIfNeeded(n);
				}
			}

			store.setNotificationsFromSource(endpoint.id, notifications);
		} catch (error) {
			// 静默处理错误，避免频繁失败请求
			console.warn(`Failed to poll endpoint ${endpoint.id}:`, error);
		}
	}

	/**
	 * 轮询 draft todo 端点
	 */
	private async pollDraftTodos(endpoint: PollingEndpoint): Promise<void> {
		try {
			// 解析 URL 参数
			let limit = 1;
			try {
				const urlStr = endpoint.url.startsWith("/")
					? `http://localhost${endpoint.url}`
					: endpoint.url;
				const url = new URL(urlStr);
				const limitParam = url.searchParams.get("limit");
				if (limitParam) {
					limit = parseInt(limitParam, 10) || 1;
				}
			} catch {
				// URL解析失败，使用默认值
				limit = 1;
			}

			// 获取 draft todos - 使用 Orval 生成的 API
			const result = await listTodosApiTodosGet({
				status: "draft",
				limit,
				offset: 0,
			});
			const data = unwrapApiData<TodoListResponse>(result);
			const todos = data?.todos ?? [];

			const store = useNotificationStore.getState();
			const current = store.notifications.find(
				(notification) => notification.source === endpoint.id,
			);

			// 如果当前有 draft todo 通知，检查对应的 todo 是否还存在
			if (
				current &&
				current.source === endpoint.id &&
				current.todoId !== undefined
			) {
				const todoExists = todos.some((todo) => todo.id === current.todoId);
				if (!todoExists) {
					store.removeNotificationsBySource(endpoint.id);
					store.setExpanded(false);
					return;
				}
			}

			if (todos.length > 0) {
				const latestTodo = todos[0];
				const notification: Notification = {
					id: `draft-todo-${latestTodo.id}`,
					title: "新待办事项待确认",
					content: latestTodo.name || "待办事项",
					timestamp: latestTodo.createdAt || new Date().toISOString(),
					source: endpoint.id,
					todoId: latestTodo.id,
				};

				const isNew = !store.notifiedIds.has(notification.id);
				store.setNotificationsFromSource(endpoint.id, [notification]);
				if (
					isNew &&
					typeof window !== "undefined" &&
					window.electronAPI?.triggerNotificationPopup
				) {
					window.electronAPI.triggerNotificationPopup({
						title: "待办提醒",
						message: `检测到：${latestTodo.name || "新的待办事项"}`,
					});
				}
			} else {
				store.removeNotificationsBySource(endpoint.id);
				store.setExpanded(false);
			}
		} catch (error) {
			// 静默处理错误，避免频繁失败请求
			console.warn(`Failed to poll draft todos from ${endpoint.id}:`, error);
		}
	}

	/** Keywords in notification titles that should trigger an Electron system popup. */
	private static readonly POPUP_KEYWORDS = [
		"邀约", "invitation",
		"自动待办", "auto_todo",
		"待办调整", "update",
		"待办完成", "complete",
		"待办取消", "cancel",
		"日程冲突", "conflict",
	];

	/**
	 * Try to trigger an interactive popup for pending intent actions.
	 * Returns true if handled as interactive, false otherwise.
	 */
	private tryInteractivePopup(notification: Notification): boolean {
		if (
			typeof window === "undefined" ||
			!window.electronAPI?.triggerInteractivePopup
		) {
			return false;
		}
		try {
			const parsed = JSON.parse(notification.content);
			if (parsed?.action_id && (parsed.action_type === "todo" || parsed.action_type === "executable")) {
				window.electronAPI.triggerInteractivePopup({
					actionId: parsed.action_id,
					actionType: parsed.action_type,
					title: parsed.title || notification.title,
					description: parsed.description || "",
					executionPlan: parsed.execution_plan,
				});
				return true;
			}
		} catch {
			// Not JSON — fall through to legacy popup
		}
		return false;
	}

	/**
	 * Trigger Electron system popup for todo-related notifications
	 * (create / update / complete / cancel / invitation / conflict).
	 */
	private triggerElectronPopupIfNeeded(notification: Notification): void {
		if (this.tryInteractivePopup(notification)) return;

		if (
			typeof window === "undefined" ||
			!window.electronAPI?.triggerNotificationPopup
		) {
			return;
		}
		const title = notification.title || "";
		const shouldPopup = NotificationPoller.POPUP_KEYWORDS.some((kw) =>
			title.includes(kw),
		);
		if (!shouldPopup) return;

		const snippet =
			notification.content.length > 80
				? `${notification.content.slice(0, 80)}…`
				: notification.content;
		window.electronAPI.triggerNotificationPopup({
			title: notification.title,
			message: snippet,
		});
	}

	/**
	 * 暂停所有轮询
	 */
	private pauseAll(): void {
		// 定时器继续运行，但 pollEndpoint 会检查 isPageVisible
		// 这样页面重新可见时可以立即恢复
	}

	/**
	 * 恢复所有轮询
	 */
	private resumeAll(): void {
		// 立即执行一次所有端点的轮询
		const store = useNotificationStore.getState();
		const endpoints = store.getAllEndpoints();
		for (const endpoint of endpoints) {
			if (endpoint.enabled) {
				this.pollEndpoint(endpoint);
			}
		}
	}

	/**
	 * 清理所有轮询定时器
	 */
	cleanup(): void {
		for (const timer of this.timers.values()) {
			clearInterval(timer);
		}
		this.timers.clear();
		this.endpointConfigs.clear();
	}

	/**
	 * 更新端点配置
	 */
	updateEndpoint(endpoint: PollingEndpoint): void {
		const nextConfigKey = this.getEndpointConfigKey(endpoint);
		const currentConfigKey = this.endpointConfigs.get(endpoint.id);
		const hasActiveTimer = this.timers.has(endpoint.id);

		if (endpoint.enabled && currentConfigKey === nextConfigKey && hasActiveTimer) {
			return;
		}

		this.unregisterEndpoint(endpoint.id);
		if (endpoint.enabled) {
			this.registerEndpoint(endpoint);
		}
	}

	private getEndpointConfigKey(endpoint: PollingEndpoint): string {
		return JSON.stringify({
			url: endpoint.url,
			interval: endpoint.interval,
			enabled: endpoint.enabled,
		});
	}
}

// 单例实例
let pollerInstance: NotificationPoller | null = null;

export function getNotificationPoller(): NotificationPoller {
	if (!pollerInstance) {
		pollerInstance = new NotificationPoller();
	}
	return pollerInstance;
}

// 清理函数（用于组件卸载时）
export function cleanupNotificationPoller(): void {
	if (pollerInstance) {
		pollerInstance.cleanup();
		pollerInstance = null;
	}
}
