/**
 * 系统通知服务
 * 提供系统原生通知功能
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

/**
 * 请求通知权限
 * 注意：Electron 会在首次显示通知时自动请求权限，无需手动检查
 * macOS 10.14+ 会弹出权限请求对话框
 * Windows 和 Linux 通常不需要显式权限请求
 */
export async function requestNotificationPermission(): Promise<void> {
	logger.info(
		"Notification permission will be requested automatically on first notification",
	);
}

/**
 * 显示系统通知
 * @param data 通知数据
 * @param windowManager 窗口管理器（用于点击通知时聚焦窗口）
 */
export function showSystemNotification(
	_data: NotificationData,
	_windowManager: WindowManager,
): void {
	// 系统原生通知已禁用，所有通知统一由自定义悬浮窗（signal-popup）处理
}
