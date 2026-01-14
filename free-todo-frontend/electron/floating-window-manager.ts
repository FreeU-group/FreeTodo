/**
 * 悬浮窗管理服务
 * 管理桌面悬浮按钮窗口，用于快速截图和待办提取
 */

import path from "node:path";
import {
	BrowserWindow,
	app,
	desktopCapturer,
	screen,
	type Display,
} from "electron";
import { isDevelopment, WINDOW_CONFIG } from "./config";
import { logger } from "./logger";

/** 悬浮窗配置 */
const FLOATING_WINDOW_CONFIG = {
	/** 窗口宽度 */
	width: 120,
	/** 窗口高度 */
	height: 120,
	/** 距离屏幕右边缘的距离 */
	rightMargin: 30,
	/** 距离屏幕底部的距离 */
	bottomMargin: 150,
	/** 背景颜色 */
	backgroundColor: "#1a1a1a",
} as const;

/**
 * 悬浮窗管理器类
 * 负责悬浮按钮窗口的创建、管理和事件处理
 */
export class FloatingWindowManager {
	/** 悬浮窗实例 */
	private floatingWindow: BrowserWindow | null = null;
	/** 后端 URL */
	private backendUrl: string;
	/** 前端 URL */
	private frontendUrl: string;

	constructor(backendUrl: string, frontendUrl: string) {
		this.backendUrl = backendUrl;
		this.frontendUrl = frontendUrl;
	}

	/**
	 * 更新后端 URL
	 */
	setBackendUrl(url: string): void {
		this.backendUrl = url;
	}

	/**
	 * 更新前端 URL
	 */
	setFrontendUrl(url: string): void {
		this.frontendUrl = url;
	}

	/**
	 * 获取 preload 脚本路径
	 */
	private getPreloadPath(): string {
		if (app.isPackaged) {
			return path.join(app.getAppPath(), "preload.js");
		}
		return path.join(__dirname, "preload.js");
	}

	/**
	 * 获取悬浮窗应该显示的位置
	 */
	private getWindowPosition(): { x: number; y: number } {
		const primaryDisplay: Display = screen.getPrimaryDisplay();
		const { width: screenWidth, height: screenHeight } =
			primaryDisplay.workAreaSize;

		const x =
			screenWidth -
			FLOATING_WINDOW_CONFIG.width -
			FLOATING_WINDOW_CONFIG.rightMargin;
		const y =
			screenHeight -
			FLOATING_WINDOW_CONFIG.height -
			FLOATING_WINDOW_CONFIG.bottomMargin;

		return { x, y };
	}

	/**
	 * 创建悬浮窗
	 */
	create(): void {
		if (this.floatingWindow) {
			logger.info("Floating window already exists, focusing...");
			this.floatingWindow.focus();
			return;
		}

		const preloadPath = this.getPreloadPath();
		const { x, y } = this.getWindowPosition();

		this.floatingWindow = new BrowserWindow({
			width: FLOATING_WINDOW_CONFIG.width,
			height: FLOATING_WINDOW_CONFIG.height,
			x,
			y,
			frame: false, // 无边框
			transparent: true, // 透明背景
			alwaysOnTop: true, // 始终置顶
			resizable: false, // 不可调整大小
			skipTaskbar: true, // 不在任务栏显示
			hasShadow: false, // 无阴影
			focusable: true,
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				preload: preloadPath,
			},
			show: false,
			backgroundColor: "#00000000", // 完全透明
		});

		// 加载悬浮窗页面
		const floatingUrl = `${this.frontendUrl}/floating`;
		logger.info(`Loading floating window URL: ${floatingUrl}`);
		this.floatingWindow.loadURL(floatingUrl);

		// 设置事件监听器
		this.setupWindowListeners();

		// 开发模式下可以打开开发者工具（注释掉以保持窗口干净）
		// if (isDevelopment(app.isPackaged)) {
		// 	this.floatingWindow.webContents.openDevTools({ mode: 'detach' });
		// }
	}

	/**
	 * 设置窗口事件监听器
	 */
	private setupWindowListeners(): void {
		if (!this.floatingWindow) return;

		this.floatingWindow.once("ready-to-show", () => {
			this.floatingWindow?.show();
			logger.info("Floating window is ready to show");
		});

		this.floatingWindow.on("closed", () => {
			logger.info("Floating window closed");
			this.floatingWindow = null;
		});

		// 页面加载失败时的处理
		this.floatingWindow.webContents.on(
			"did-fail-load",
			(_event, errorCode, errorDescription) => {
				logger.error(
					`Floating window failed to load: ${errorCode} - ${errorDescription}`,
				);
			},
		);
	}

	/**
	 * 截取屏幕并返回 base64 编码的图片
	 */
	async captureScreen(): Promise<string | null> {
		try {
			// 隐藏悬浮窗以避免截图时包含它
			const wasVisible = this.floatingWindow?.isVisible() ?? false;
			if (wasVisible) {
				this.floatingWindow?.hide();
			}

			// 等待一小段时间让窗口完全隐藏
			await new Promise((resolve) => setTimeout(resolve, 100));

			// 获取所有屏幕源
			const sources = await desktopCapturer.getSources({
				types: ["screen"],
				thumbnailSize: {
					width: 1920,
					height: 1080,
				},
			});

			// 恢复悬浮窗显示
			if (wasVisible) {
				this.floatingWindow?.show();
			}

			if (sources.length === 0) {
				logger.error("No screen sources found");
				return null;
			}

			// 使用主屏幕的截图
			const primarySource = sources[0];
			const thumbnail = primarySource.thumbnail;

			// 转换为 base64
			const base64Data = thumbnail.toDataURL();

			logger.info(
				`Screen captured successfully, size: ${thumbnail.getSize().width}x${thumbnail.getSize().height}`,
			);

			return base64Data;
		} catch (error) {
			logger.error(`Failed to capture screen: ${error}`);
			return null;
		}
	}

	/**
	 * 获取后端 URL
	 */
	getBackendUrl(): string {
		return this.backendUrl;
	}

	/**
	 * 显示悬浮窗
	 */
	show(): void {
		if (this.floatingWindow) {
			this.floatingWindow.show();
		}
	}

	/**
	 * 隐藏悬浮窗
	 */
	hide(): void {
		if (this.floatingWindow) {
			this.floatingWindow.hide();
		}
	}

	/**
	 * 切换悬浮窗显示状态
	 */
	toggle(): void {
		if (this.floatingWindow?.isVisible()) {
			this.hide();
		} else {
			this.show();
		}
	}

	/**
	 * 关闭悬浮窗
	 */
	close(): void {
		if (this.floatingWindow) {
			this.floatingWindow.close();
			this.floatingWindow = null;
		}
	}

	/**
	 * 检查悬浮窗是否存在
	 */
	hasWindow(): boolean {
		return this.floatingWindow !== null;
	}

	/**
	 * 获取悬浮窗实例
	 */
	getWindow(): BrowserWindow | null {
		return this.floatingWindow;
	}
}
