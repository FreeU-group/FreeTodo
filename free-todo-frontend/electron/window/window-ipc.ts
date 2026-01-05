/**
 * 窗口相关 IPC 处理器
 * 处理窗口展开、折叠、移动、调整大小等操作
 */

import { BrowserWindow, ipcMain, screen } from "electron";
import { enableDynamicIsland } from "../core/config";
import { logToFile } from "../core/logger";
import { getMainWindow, getOriginalBounds } from "./window-manager";

/**
 * 设置窗口相关 IPC 处理器
 */
export function setupWindowIpcHandlers(): void {
	// 注册 IPC 处理器：设置窗口是否忽略鼠标事件（用于透明窗口点击穿透）
	ipcMain.on(
		"set-ignore-mouse-events",
		(event, ignore: boolean, options?: { forward?: boolean }) => {
			const win = BrowserWindow.fromWebContents(event.sender);
			if (win) {
				win.setIgnoreMouseEvents(ignore, options || {});
			}
		},
	);

	// 注册 IPC 处理器：显示窗口（用于全屏模式）
	ipcMain.on("show-window", (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win) {
			win.show();
			// 全屏模式下，取消点击穿透，确保可以交互
			win.setIgnoreMouseEvents(false);
			// 确保窗口在最前面
			win.focus();
			logToFile("Window shown (fullscreen mode)");
		}
	});

	// 注册 IPC 处理器：隐藏窗口（用于退出全屏模式）
	ipcMain.on("hide-window", (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win) {
			// 隐藏窗口前，重新启用点击穿透（如果启用灵动岛模式）
			if (enableDynamicIsland) {
				win.setIgnoreMouseEvents(true, { forward: true });
			}
			win.hide();
			logToFile("Window hidden (exit fullscreen mode)");
		}
	});

	// 注册 IPC 处理器：移动窗口到指定位置（用于拖拽）
	ipcMain.on("move-window", (event, x: number, y: number) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win && enableDynamicIsland) {
			win.setPosition(Math.round(x), Math.round(y));
		}
	});

	// 注册 IPC 处理器：获取窗口当前位置
	ipcMain.handle("get-window-position", (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win) {
			const [x, y] = win.getPosition();
			return { x, y };
		}
		return { x: 0, y: 0 };
	});

	// IPC: 展开窗口到全屏（完全照抄 electron-with-nextjs）
	ipcMain.handle("expand-window-full", () => {
		const mainWindow = getMainWindow();
		if (!mainWindow || !enableDynamicIsland) return;

		const { width: screenWidth, height: screenHeight } =
			screen.getPrimaryDisplay().workAreaSize;
		const margin = 24;

		// 必须设置可调整和可移动（因为创建时是 false）
		mainWindow.setResizable(true);
		mainWindow.setMovable(true);

		mainWindow.setBounds({
			x: margin,
			y: margin,
			width: screenWidth - margin * 2,
			height: screenHeight - margin * 2,
		});

		// 全屏模式也添加圆角（16px），使用 clip-path 实现完美圆角
		// 立即注入，并在页面加载完成后再次注入确保生效
		const injectRoundedCorners = () => {
			mainWindow?.webContents
				.insertCSS(`
				html {
					border-radius: 16px !important;
					overflow: hidden !important;
					clip-path: inset(0 round 16px) !important;
				}
				body {
					border-radius: 16px !important;
					overflow: hidden !important;
					clip-path: inset(0 round 16px) !important;
					background-color: transparent !important;
				}
				#__next {
					border-radius: 16px !important;
					overflow: hidden !important;
					clip-path: inset(0 round 16px) !important;
					background-color: transparent !important;
				}
				#__next > div {
					border-radius: 16px !important;
					overflow: hidden !important;
					clip-path: inset(0 round 16px) !important;
				}
			`)
				.catch(() => {});
		};

		// 立即注入
		injectRoundedCorners();

		// 延迟再次注入确保生效
		setTimeout(() => {
			injectRoundedCorners();
		}, 200);

		// 监听页面加载完成，再次注入
		mainWindow.webContents.once("did-finish-load", () => {
			setTimeout(() => {
				injectRoundedCorners();
			}, 100);
		});
	});

	// IPC: 展开窗口到窗口化模式（完全照抄 electron-with-nextjs）
	ipcMain.handle("expand-window", () => {
		const mainWindow = getMainWindow();
		if (!mainWindow || !enableDynamicIsland) return;

		const { width: screenWidth, height: screenHeight } =
			screen.getPrimaryDisplay().workAreaSize;
		const expandedWidth = 500;
		const expandedHeight = Math.round(screenHeight * 0.8);
		const margin = 24;
		const top = Math.round((screenHeight - expandedHeight) / 2);

		// 必须设置可调整和可移动（因为创建时是 false）
		mainWindow.setResizable(true);
		mainWindow.setMovable(true);

		mainWindow.setBounds({
			x: screenWidth - expandedWidth - margin,
			y: top,
			width: expandedWidth,
			height: expandedHeight,
		});

		// 注入窗口圆角 CSS（Panel 模式，增大到16px），使用 clip-path 实现完美圆角
		mainWindow.webContents
			.insertCSS(`
			html {
				border-radius: 16px !important;
				overflow: hidden !important;
				clip-path: inset(0 round 16px) !important;
			}
			body {
				border-radius: 16px !important;
				overflow: hidden !important;
				clip-path: inset(0 round 16px) !important;
				background-color: transparent !important;
			}
			#__next {
				border-radius: 16px !important;
				overflow: hidden !important;
				clip-path: inset(0 round 16px) !important;
				background-color: transparent !important;
			}
			#__next > div {
				border-radius: 16px !important;
				overflow: hidden !important;
				clip-path: inset(0 round 16px) !important;
			}
		`)
			.catch(() => {});
	});

	// IPC: 在指定位置展开窗口（完全照抄 electron-with-nextjs 的方式，但使用传入的位置）
	ipcMain.handle(
		"expand-window-at-position",
		(_event, x: number, y: number, width: number, height: number) => {
			const mainWindow = getMainWindow();
			if (!mainWindow || !enableDynamicIsland) return;

			// 必须设置可调整和可移动（因为创建时是 false）
			mainWindow.setResizable(true);
			mainWindow.setMovable(true);

			// 直接使用传入的位置和尺寸，不做任何限制
			mainWindow.setBounds({
				x,
				y,
				width,
				height,
			});
		},
	);

	// IPC: 恢复窗口到原始大小
	ipcMain.handle("collapse-window", () => {
		const mainWindow = getMainWindow();
		const originalBounds = getOriginalBounds();
		if (!mainWindow || !enableDynamicIsland || !originalBounds) return;

		// 恢复为不可调整大小和不可移动
		mainWindow.setResizable(false);
		mainWindow.setMovable(false);

		mainWindow.setBounds(originalBounds);

		// 移除圆角 CSS 和 clip-path（折叠回灵动岛时不需要圆角）
		mainWindow.webContents
			.insertCSS(`
			html {
				border-radius: 0 !important;
				clip-path: none !important;
			}
			body {
				border-radius: 0 !important;
				clip-path: none !important;
			}
			#__next {
				border-radius: 0 !important;
				clip-path: none !important;
			}
			#__next > div {
				border-radius: 0 !important;
				clip-path: none !important;
			}
		`)
			.catch(() => {});

		// 重新启用点击穿透（FLOAT 模式需要）
		mainWindow.setIgnoreMouseEvents(true, { forward: true });
	});

	// IPC: 获取屏幕信息（完全照抄 electron-with-nextjs）
	ipcMain.handle("get-screen-info", () => {
		const { width, height } = screen.getPrimaryDisplay().workAreaSize;
		return { screenWidth: width, screenHeight: height };
	});

	// IPC: 调整窗口大小（用于自定义缩放把手）
	ipcMain.on(
		"resize-window",
		(event, deltaX: number, deltaY: number, position: string) => {
			const win = BrowserWindow.fromWebContents(event.sender);
			if (!win || !enableDynamicIsland) return;

			const bounds = win.getBounds();
			let newWidth = bounds.width;
			let newHeight = bounds.height;
			let newX = bounds.x;
			let newY = bounds.y;

			// 根据位置和 delta 计算新尺寸和位置
			switch (position) {
				case "right":
					newWidth = Math.max(200, bounds.width + deltaX);
					break;
				case "left":
					newWidth = Math.max(200, bounds.width - deltaX);
					newX = bounds.x + deltaX;
					break;
				case "bottom":
					newHeight = Math.max(200, bounds.height + deltaY);
					break;
				case "top":
					newHeight = Math.max(200, bounds.height - deltaY);
					newY = bounds.y + deltaY;
					break;
				case "top-right":
					newWidth = Math.max(200, bounds.width + deltaX);
					newHeight = Math.max(200, bounds.height - deltaY);
					newY = bounds.y + deltaY;
					break;
				case "top-left":
					newWidth = Math.max(200, bounds.width - deltaX);
					newHeight = Math.max(200, bounds.height - deltaY);
					newX = bounds.x + deltaX;
					newY = bounds.y + deltaY;
					break;
				case "bottom-right":
					newWidth = Math.max(200, bounds.width + deltaX);
					newHeight = Math.max(200, bounds.height + deltaY);
					break;
				case "bottom-left":
					newWidth = Math.max(200, bounds.width - deltaX);
					newHeight = Math.max(200, bounds.height + deltaY);
					newX = bounds.x + deltaX;
					break;
			}

			console.log("[main] 调整窗口大小:", {
				position,
				deltaX,
				deltaY,
				oldBounds: bounds,
				newBounds: { x: newX, y: newY, width: newWidth, height: newHeight },
			});
			win.setBounds({
				x: newX,
				y: newY,
				width: newWidth,
				height: newHeight,
			});
		},
	);
}
