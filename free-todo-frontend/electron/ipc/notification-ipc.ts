/**
 * 通知相关 IPC 处理器
 * 处理系统通知显示和权限请求
 */

import { ipcMain, Notification } from "electron";
import { logToFile } from "../core/logger";
import { getMainWindow } from "../window/window-manager";

/**
 * 请求通知权限（如果需要）
 * 注意：Electron 会在首次显示通知时自动请求权限，无需手动检查
 */
export async function requestNotificationPermission(): Promise<void> {
	// Electron 的 Notification 类没有 permission 属性
	// 权限会在首次显示通知时自动请求
	// macOS 10.14+ 会弹出权限请求对话框
	// Windows 和 Linux 通常不需要显式权限请求
	logToFile(
		"Notification permission will be requested automatically on first notification",
	);
}

/**
 * 显示系统通知
 */
export function showSystemNotification(
	title: string,
	body: string,
	notificationId: string,
): void {
	const mainWindow = getMainWindow();
	if (!mainWindow) {
		logToFile("WARNING: Cannot show notification - mainWindow is null");
		return;
	}

	try {
		const notification = new Notification({
			title,
			body,
			silent: false, // 允许通知声音
		});

		// 处理通知点击事件
		notification.on("click", () => {
			logToFile(`Notification ${notificationId} clicked - focusing window`);
			const win = getMainWindow();
			if (win) {
				if (win.isMinimized()) {
					win.restore();
				}
				win.focus();
			}
		});

		// 处理通知显示事件
		notification.on("show", () => {
			logToFile(`Notification ${notificationId} shown: ${title}`);
		});

		// 处理通知关闭事件
		notification.on("close", () => {
			logToFile(`Notification ${notificationId} closed`);
		});

		// 显示通知
		notification.show();
	} catch (error) {
		const errorMsg = `Failed to show notification: ${error instanceof Error ? error.message : String(error)}`;
		logToFile(`ERROR: ${errorMsg}`);
		// 静默失败，不影响应用运行
	}
}

/**
 * 设置通知相关 IPC 处理器
 */
export function setupNotificationIpcHandlers(): void {
	// 处理来自渲染进程的通知请求
	ipcMain.handle(
		"show-notification",
		async (
			_event,
			data: { id: string; title: string; content: string; timestamp: string },
		) => {
			try {
				logToFile(`Received notification request: ${data.id} - ${data.title}`);
				showSystemNotification(data.title, data.content, data.id);
			} catch (error) {
				const errorMsg = `Failed to handle notification request: ${error instanceof Error ? error.message : String(error)}`;
				logToFile(`ERROR: ${errorMsg}`);
				throw error;
			}
		},
	);
}
