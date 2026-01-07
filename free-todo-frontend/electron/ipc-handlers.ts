/**
 * IPC 通信处理器
 * 集中管理所有主进程与渲染进程之间的 IPC 通信
 */

import { ipcMain } from "electron";
import { logger } from "./logger";
import {
	type NotificationData,
	showSystemNotification,
} from "./notification";
import type { WindowManager } from "./window-manager";

/**
 * 设置所有 IPC 处理器
 * @param windowManager 窗口管理器实例
 */
export function setupIpcHandlers(windowManager: WindowManager): void {
	// 处理来自渲染进程的通知请求
	ipcMain.handle(
		"show-notification",
		async (_event, data: NotificationData) => {
			try {
				logger.info(`Received notification request: ${data.id} - ${data.title}`);
				showSystemNotification(data, windowManager);
			} catch (error) {
				const errorMsg = `Failed to handle notification request: ${error instanceof Error ? error.message : String(error)}`;
				logger.error(errorMsg);
				throw error;
			}
		},
	);

	// 未来可在此处添加更多 IPC 处理器
	// 例如：文件系统操作、系统信息获取等
}
