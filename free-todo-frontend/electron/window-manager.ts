/**
 * 窗口管理服务
 * 封装 BrowserWindow 创建和事件处理
 */

import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import { isDevelopment, WINDOW_CONFIG } from "./config";
import { logger } from "./logger";

/**
 * 窗口管理器类
 * 负责主窗口的创建、管理和事件处理
 */
export class WindowManager {
	/** 主窗口实例 */
	private mainWindow: BrowserWindow | null = null;

	/**
	 * 获取 preload 脚本路径
	 */
	private getPreloadPath(): string {
		if (app.isPackaged) {
			// 打包环境：preload.js 和 main.js 在同一个目录（应用根目录）
			return path.join(app.getAppPath(), "preload.js");
		}
		// 开发环境：使用编译后的文件路径（dist-electron 目录）
		return path.join(__dirname, "preload.js");
	}

	/**
	 * 创建主窗口
	 * @param serverUrl 前端服务器 URL
	 */
	create(serverUrl: string): void {
		const preloadPath = this.getPreloadPath();

		this.mainWindow = new BrowserWindow({
			width: WINDOW_CONFIG.width,
			height: WINDOW_CONFIG.height,
			minWidth: WINDOW_CONFIG.minWidth,
			minHeight: WINDOW_CONFIG.minHeight,
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				preload: preloadPath,
			},
			show: false, // 等待内容加载完成再显示
			backgroundColor: WINDOW_CONFIG.backgroundColor,
		});

		logger.info(`Loading URL: ${serverUrl}`);
		this.mainWindow.loadURL(serverUrl);

		// 设置事件监听器
		this.setupWindowListeners(serverUrl);

		// 开发模式下打开开发者工具
		if (isDevelopment(app.isPackaged)) {
			this.mainWindow.webContents.openDevTools();
		}
	}

	/**
	 * 设置窗口事件监听器
	 */
	private setupWindowListeners(serverUrl: string): void {
		if (!this.mainWindow) return;

		// 窗口准备显示
		this.mainWindow.once("ready-to-show", () => {
			this.mainWindow?.show();
			logger.info("Window is ready to show");
		});

		// 窗口关闭
		this.mainWindow.on("closed", () => {
			logger.info("Window closed");
			this.mainWindow = null;
		});

		// 页面加载失败
		this.mainWindow.webContents.on(
			"did-fail-load",
			(_event, errorCode, errorDescription) => {
				const errorMsg = `Window failed to load: ${errorCode} - ${errorDescription}`;
				logger.error(errorMsg);
				console.error(errorMsg);

				// 连接被拒绝或名称解析失败
				if (errorCode === -106 || errorCode === -105) {
					dialog.showErrorBox(
						"Connection Error",
						`Failed to connect to server at ${serverUrl}\n\nError: ${errorDescription}\n\nCheck logs at: ${logger.getLogFilePath()}`,
					);
				}
			},
		);

		// 渲染进程崩溃
		this.mainWindow.webContents.on("render-process-gone", (_event, details) => {
			const errorMsg = `Render process crashed: ${details.reason} (exit code: ${details.exitCode})`;
			logger.fatal(errorMsg);
			console.error(errorMsg);

			dialog.showErrorBox(
				"Application Crashed",
				`The application window crashed:\n${details.reason}\n\nCheck logs at: ${logger.getLogFilePath()}`,
			);
		});

		// 窗口无响应
		this.mainWindow.webContents.on("unresponsive", () => {
			logger.warn("Window became unresponsive");
		});

		// 窗口恢复响应
		this.mainWindow.webContents.on("responsive", () => {
			logger.info("Window became responsive again");
		});
	}

	/**
	 * 聚焦窗口
	 * 如果窗口最小化则恢复，然后聚焦
	 */
	focus(): void {
		if (this.mainWindow) {
			if (this.mainWindow.isMinimized()) {
				this.mainWindow.restore();
			}
			this.mainWindow.focus();
		}
	}

	/**
	 * 获取主窗口实例
	 */
	getWindow(): BrowserWindow | null {
		return this.mainWindow;
	}

	/**
	 * 检查窗口是否存在
	 */
	hasWindow(): boolean {
		return this.mainWindow !== null;
	}

	/**
	 * 检查是否有任何窗口打开
	 */
	static hasAnyWindows(): boolean {
		return BrowserWindow.getAllWindows().length > 0;
	}
}
