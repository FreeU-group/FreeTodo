/**
 * 系统通知服务
 * 系统原生通知已禁用，所有通知统一由自定义悬浮窗（signal-popup）处理
 */

import type { WindowManager } from "./window-manager";

/**
 * 通知数据接口
 */
export interface NotificationData {
	/** 通知 ID */
	id: string;
	/** 通知标题 */
	title: string;
	/** 通知内容 */
	content: string;
	/** 时间戳 */
	timestamp: string;
}

export async function requestNotificationPermission(): Promise<void> {
	// no-op: 系统原生通知已禁用
}

export function showSystemNotification(
	_data: NotificationData,
	_windowManager: WindowManager,
): void {
	// no-op: 系统原生通知已禁用，所有通知统一由自定义悬浮窗处理
}
