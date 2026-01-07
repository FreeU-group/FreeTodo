/**
 * 系统通知服务
 * 提供系统原生通知功能
 */

import { Notification } from "electron";
import { logger } from "./logger";
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
	data: NotificationData,
	windowManager: WindowManager,
): void {
	if (!windowManager.hasWindow()) {
		logger.warn("Cannot show notification - mainWindow is null");
		return;
	}

	try {
		const notification = new Notification({
			title: data.title,
			body: data.content,
			silent: false, // 允许通知声音
		});

		// 处理通知点击事件
		notification.on("click", () => {
			logger.info(`Notification ${data.id} clicked - focusing window`);
			windowManager.focus();
		});

		// 处理通知显示事件
		notification.on("show", () => {
			logger.info(`Notification ${data.id} shown: ${data.title}`);
		});

		// 处理通知关闭事件
		notification.on("close", () => {
			logger.info(`Notification ${data.id} closed`);
		});

		// 显示通知
		notification.show();
	} catch (error) {
		const errorMsg = `Failed to show notification: ${error instanceof Error ? error.message : String(error)}`;
		logger.error(errorMsg);
		// 静默失败，不影响应用运行
	}
}
