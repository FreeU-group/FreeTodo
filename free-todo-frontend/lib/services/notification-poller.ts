import { fetchNotification, getTodos } from "@/lib/api";
import type {
	Notification,
	PollingEndpoint,
} from "@/lib/store/notification-store";
import { useNotificationStore } from "@/lib/store/notification-store";

class NotificationPoller {
	private timers: Map<string, NodeJS.Timeout> = new Map();
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

			// 标准通知端点
			const response = await fetchNotification(endpoint.url);
			if (response) {
				// 转换为通知格式
				const notification: Notification = {
					id: response.id || `${endpoint.id}-${Date.now()}`,
					title: response.title,
					content: response.content,
					timestamp: response.timestamp || new Date().toISOString(),
					source: endpoint.id,
				};

				// 检查是否是新通知（简单去重：比较 ID 和内容）
				const store = useNotificationStore.getState();
				const current = store.currentNotification;
				if (
					!current ||
					current.id !== notification.id ||
					current.content !== notification.content
				) {
					store.setNotification(notification);
				}
			}
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

			// 获取 draft todos
			const result = await getTodos({
				status: "draft",
				limit,
				offset: 0,
			});

			const store = useNotificationStore.getState();
			const current = store.currentNotification;

			// 如果当前有 draft todo 通知，检查对应的 todo 是否还存在
			if (
				current &&
				current.source === endpoint.id &&
				current.todoId !== undefined
			) {
				const todoExists =
					result.todos?.some((todo) => todo.id === current.todoId) ?? false;
				// 如果 todo 不存在了，清除通知
				if (!todoExists) {
					store.setNotification(null);
					store.setExpanded(false);
					return;
				}
			}

			if (result.todos && result.todos.length > 0) {
				// 取最新的一个 todo
				const latestTodo = result.todos[0];

				// 转换为通知格式
				const notification: Notification = {
					id: `draft-todo-${latestTodo.id}`,
					title: "新待办事项待确认",
					content: latestTodo.name || "待办事项",
					timestamp: latestTodo.created_at || new Date().toISOString(),
					source: endpoint.id,
					todoId: latestTodo.id, // 添加 todoId 以便后续操作
				};

				// 检查是否是新通知（比较 todo ID）
				if (
					!current ||
					current.id !== notification.id ||
					current.content !== notification.content
				) {
					store.setNotification(notification);
				}
			} else {
				// 如果没有 draft todos 了，且当前通知是来自这个端点的，清除通知
				if (current && current.source === endpoint.id) {
					store.setNotification(null);
					store.setExpanded(false);
				}
			}
		} catch (error) {
			// 静默处理错误，避免频繁失败请求
			console.warn(`Failed to poll draft todos from ${endpoint.id}:`, error);
		}
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
	}

	/**
	 * 更新端点配置
	 */
	updateEndpoint(endpoint: PollingEndpoint): void {
		this.unregisterEndpoint(endpoint.id);
		if (endpoint.enabled) {
			this.registerEndpoint(endpoint);
		}
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
