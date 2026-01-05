/**
 * 应用相关 IPC 处理器
 * 处理应用级别的操作
 */

import { app, ipcMain } from "electron";

/**
 * 设置应用相关 IPC 处理器
 */
export function setupAppIpcHandlers(): void {
	// IPC: 退出应用
	ipcMain.on("app-quit", () => {
		console.log("[main] 收到退出应用请求");
		app.quit();
	});
}
