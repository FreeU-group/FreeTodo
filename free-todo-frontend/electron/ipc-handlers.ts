/**
 * IPC 通信处理器
 * 集中管理所有主进程与渲染进程之间的 IPC 通信
 */

import { app, ipcMain, screen } from "electron";
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

	// ========== 灵动岛相关 IPC 处理器 ==========

	// 设置窗口是否忽略鼠标事件（用于透明窗口点击穿透）
	ipcMain.handle(
		"set-ignore-mouse-events",
		async (_event, ignore: boolean, options?: { forward?: boolean }) => {
			const win = windowManager.getWindow();
			if (win) {
				win.setIgnoreMouseEvents(ignore, options || {});
			}
		},
	);

	// 移动窗口到指定位置（用于拖拽）
	ipcMain.handle("move-window", async (_event, x: number, y: number) => {
		const win = windowManager.getWindow();
		if (win) {
			win.setPosition(Math.round(x), Math.round(y));
		}
	});

	// 获取窗口当前位置
	ipcMain.handle("get-window-position", () => {
		const win = windowManager.getWindow();
		if (win) {
			const [x, y] = win.getPosition();
			return { x, y };
		}
		return { x: 0, y: 0 };
	});

	// 获取屏幕信息
	ipcMain.handle("get-screen-info", () => {
		const { width, height } = screen.getPrimaryDisplay().workAreaSize;
		return { screenWidth: width, screenHeight: height };
	});

	// 折叠窗口到小尺寸（FLOAT 模式）
	ipcMain.handle("collapse-window", async () => {
		const win = windowManager.getWindow();
		if (!win) return;

		const { width: screenWidth, height: screenHeight } =
			screen.getPrimaryDisplay().workAreaSize;
		const smallWidth = 240;
		const smallHeight = 120;
		const margin = 24;

		// 设置为不可调整大小和不可移动
		win.setResizable(false);
		win.setMovable(false);
		win.setAlwaysOnTop(true);
		win.setSkipTaskbar(true);

		// 设置窗口位置和大小
		win.setBounds({
			x: screenWidth - smallWidth - margin,
			y: screenHeight - smallHeight - margin,
			width: smallWidth,
			height: smallHeight,
		});

		// 启用点击穿透
		win.setIgnoreMouseEvents(true, { forward: true });
		win.setFocusable(false);
	});

	// 展开窗口到面板模式（PANEL 模式）
	ipcMain.handle("expand-window", async () => {
		const win = windowManager.getWindow();
		if (!win) return;

		const { width: screenWidth, height: screenHeight } =
			screen.getPrimaryDisplay().workAreaSize;
		const expandedWidth = 1100;
		const expandedHeight = 760;

		// 设置为可调整大小和可移动
		win.setResizable(true);
		win.setMovable(true);
		win.setAlwaysOnTop(false);
		win.setSkipTaskbar(false);
		win.setFocusable(true);

		// 居中窗口
		win.setBounds({
			x: Math.round((screenWidth - expandedWidth) / 2),
			y: Math.round((screenHeight - expandedHeight) / 2),
			width: expandedWidth,
			height: expandedHeight,
		});

		// 禁用点击穿透
		win.setIgnoreMouseEvents(false);
	});

	// 展开窗口到全屏模式（FULLSCREEN 模式）
	ipcMain.handle("expand-window-full", async () => {
		const win = windowManager.getWindow();
		if (!win) return;

		const { width: screenWidth, height: screenHeight } =
			screen.getPrimaryDisplay().workAreaSize;

		// 设置为可调整大小和可移动
		win.setResizable(true);
		win.setMovable(true);
		win.setAlwaysOnTop(false);
		win.setSkipTaskbar(false);
		win.setFocusable(true);

		// 设置为全屏
		win.setBounds({
			x: 0,
			y: 0,
			width: screenWidth,
			height: screenHeight,
		});

		// 禁用点击穿透
		win.setIgnoreMouseEvents(false);
	});

	// 调整窗口大小（用于自定义缩放把手）
	ipcMain.handle(
		"resize-window",
		async (_event, dx: number, dy: number, pos: string) => {
			const win = windowManager.getWindow();
			if (!win) return;

			const bounds = win.getBounds();
			const minWidth = 320;
			const minHeight = 240;
			let newWidth = bounds.width;
			let newHeight = bounds.height;
			let newX = bounds.x;
			let newY = bounds.y;

			// 根据位置和 delta 计算新尺寸和位置
			switch (pos) {
				case "right":
					newWidth = Math.max(minWidth, bounds.width + dx);
					break;
				case "left":
					newWidth = Math.max(minWidth, bounds.width - dx);
					newX = bounds.x + dx;
					break;
				case "bottom":
					newHeight = Math.max(minHeight, bounds.height + dy);
					break;
				case "top":
					newHeight = Math.max(minHeight, bounds.height - dy);
					newY = bounds.y + dy;
					break;
				case "top-right":
					newWidth = Math.max(minWidth, bounds.width + dx);
					newHeight = Math.max(minHeight, bounds.height - dy);
					newY = bounds.y + dy;
					break;
				case "top-left":
					newWidth = Math.max(minWidth, bounds.width - dx);
					newHeight = Math.max(minHeight, bounds.height - dy);
					newX = bounds.x + dx;
					newY = bounds.y + dy;
					break;
				case "bottom-right":
					newWidth = Math.max(minWidth, bounds.width + dx);
					newHeight = Math.max(minHeight, bounds.height + dy);
					break;
				case "bottom-left":
					newWidth = Math.max(minWidth, bounds.width - dx);
					newHeight = Math.max(minHeight, bounds.height + dy);
					newX = bounds.x + dx;
					break;
			}

			win.setBounds({
				x: newX,
				y: newY,
				width: newWidth,
				height: newHeight,
			});
		},
	);

	// 退出应用
	ipcMain.handle("app-quit", async () => {
		app.quit();
	});

	// 透明背景就绪通知
	ipcMain.on("transparent-background-ready", () => {
		const win = windowManager.getWindow();
		if (win) {
			win.setBackgroundColor("#00000000");
		}
		// 通知窗口管理器透明背景已就绪
		windowManager.setTransparentBackgroundReady(true);
		logger.info("Transparent background ready signal received");
	});
}
