/**
 * 窗口管理服务
 * 封装 BrowserWindow 创建和事件处理
 */

import http from "node:http";
import path from "node:path";
import { app, BrowserWindow, dialog, screen } from "electron";
import {
	enableDynamicIsland,
	WINDOW_CONFIG,
} from "./config";
import { logger } from "./logger";

/**
 * 窗口管理器类
 * 负责主窗口的创建、管理和事件处理
 */
export class WindowManager {
	/** 主窗口实例 */
	private mainWindow: BrowserWindow | null = null;
	/** 透明背景就绪标志（仅灵动岛模式） */
	private transparentBackgroundReady: boolean = false;
	/** 保存窗口的原始位置和尺寸（用于从全屏模式恢复） */
	private originalBounds: {
		x: number;
		y: number;
		width: number;
		height: number;
	} | null = null;

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
	 * 等待服务器就绪
	 * @param url 服务器 URL
	 * @param timeout 超时时间（毫秒）
	 */
	private async waitForServer(url: string, timeout: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const startTime = Date.now();

			const check = () => {
				http
					.get(url, (res) => {
						if (res.statusCode === 200 || res.statusCode === 304) {
							resolve();
						} else {
							retry();
						}
					})
					.on("error", () => {
						retry();
					});
			};

			const retry = () => {
				if (Date.now() - startTime >= timeout) {
					reject(new Error(`Server did not start within ${timeout}ms`));
				} else {
					setTimeout(check, 500);
				}
			};

			check();
		});
	}

	/**
	 * 获取原始窗口边界
	 */
	getOriginalBounds(): typeof this.originalBounds {
		return this.originalBounds;
	}

	/**
	 * 创建主窗口
	 * @param serverUrl 前端服务器 URL
	 */
	create(serverUrl: string): void {
		const preloadPath = this.getPreloadPath();

		// 获取主显示器尺寸（用于全屏模式）
		const primaryDisplay = screen.getPrimaryDisplay();
		const { width: screenWidth, height: screenHeight } =
			primaryDisplay.workAreaSize;

		// 保存原始位置和尺寸（用于从全屏模式恢复）
		if (enableDynamicIsland && !this.originalBounds) {
			// 窗口初始位置在右下角，但大小是全屏（这样灵动岛可以通过 CSS 定位）
			this.originalBounds = {
				x: 0,
				y: 0,
				width: screenWidth,
				height: screenHeight,
			};
		} else if (!enableDynamicIsland && !this.originalBounds) {
			this.originalBounds = {
				x: 0,
				y: 0,
				width: WINDOW_CONFIG.width,
				height: WINDOW_CONFIG.height,
			};
		}

		this.mainWindow = new BrowserWindow({
			width: enableDynamicIsland ? screenWidth : WINDOW_CONFIG.width,
			height: enableDynamicIsland ? screenHeight : WINDOW_CONFIG.height,
			minWidth: enableDynamicIsland ? undefined : WINDOW_CONFIG.minWidth,
			minHeight: enableDynamicIsland ? undefined : WINDOW_CONFIG.minHeight,
			frame: !enableDynamicIsland, // 灵动岛模式无边框
			transparent: !!enableDynamicIsland, // 灵动岛模式透明
			alwaysOnTop: !!enableDynamicIsland, // 灵动岛模式置顶
			hasShadow: !enableDynamicIsland, // 灵动岛模式无阴影
			resizable: !enableDynamicIsland, // 灵动岛模式初始不可调整
			movable: !enableDynamicIsland, // 灵动岛模式初始不可移动
			skipTaskbar: !!enableDynamicIsland, // 灵动岛模式不显示在任务栏
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				preload: preloadPath,
			},
			show: false, // 等待内容加载完成再显示
			backgroundColor: enableDynamicIsland
				? "#00000000"
				: WINDOW_CONFIG.backgroundColor,
		});

		// 注入透明背景 CSS（如果启用灵动岛）
		if (enableDynamicIsland && this.mainWindow) {
			this.mainWindow.webContents.insertCSS(`
				html, body, #__next, #__next > div, #__next > div > div {
					background-color: transparent !important;
					background: transparent !important;
				}
			`);
			logger.info("Transparent background CSS injected via insertCSS");

			// 监听页面开始加载，尽早注入透明背景脚本
			this.mainWindow.webContents.once("did-start-loading", () => {
				if (!this.mainWindow) return;
				// 注入脚本设置透明背景，尽可能早地执行
				this.mainWindow.webContents
					.executeJavaScript(`
					(function() {
						const isElectron = navigator.userAgent.includes('Electron') ||
							(typeof window.electronAPI !== 'undefined') ||
							(typeof window.require !== 'undefined');

						if (isElectron) {
							// 立即设置透明背景
							const html = document.documentElement;
							if (html) {
								html.setAttribute('data-electron', 'true');
								html.style.setProperty('background-color', 'transparent', 'important');
								html.style.setProperty('background', 'transparent', 'important');
							}

							// 监听 DOMContentLoaded 和 body 创建
							const setBodyTransparent = () => {
								const body = document.body;
								if (body) {
									body.style.setProperty('background-color', 'transparent', 'important');
									body.style.setProperty('background', 'transparent', 'important');
								}
							};

							if (document.body) {
								setBodyTransparent();
							} else {
								document.addEventListener('DOMContentLoaded', setBodyTransparent);
								// 也监听 body 的创建
								if (document.documentElement) {
									const observer = new MutationObserver(() => {
										if (document.body) {
											setBodyTransparent();
											observer.disconnect();
										}
									});
									observer.observe(document.documentElement, { childList: true, subtree: true });
								}
							}

							// 设置 #__next 透明
							const setNextTransparent = () => {
								const next = document.getElementById('__next');
								if (next) {
									next.style.setProperty('background-color', 'transparent', 'important');
									next.style.setProperty('background', 'transparent', 'important');
								}
							};

							// 延迟执行，确保 #__next 已创建
							setTimeout(setNextTransparent, 100);
							setTimeout(setNextTransparent, 500);
							setTimeout(setNextTransparent, 1000);
						}
					})();
				`)
					.catch(() => {
						// 忽略错误
					});
			});

			// 监听页面导航，确保每次页面加载都应用透明背景
			this.mainWindow.webContents.on("did-navigate", () => {
				if (this.mainWindow) {
					this.mainWindow.webContents
						.insertCSS(`
						html, body, #__next, #__next > div, #__next > div > div {
							background-color: transparent !important;
							background: transparent !important;
						}
					`)
						.catch(() => {});
				}
			});
		}

		// 设置事件监听器
		this.setupWindowListeners(serverUrl);

		// 确保服务器已经启动后再加载 URL
		const loadWindow = async () => {
			try {
				// 确保服务器就绪
				await this.waitForServer(serverUrl, 5000);
				logger.info(`Loading URL: ${serverUrl}`);
				if (this.mainWindow && !this.mainWindow.isDestroyed()) {
					this.mainWindow.loadURL(serverUrl);
				}
			} catch (error) {
				logger.warn(
					`Failed to verify server, loading URL anyway: ${error instanceof Error ? error.message : String(error)}`,
				);
				// 即使检查失败，也尝试加载（可能服务器刚启动）
				if (this.mainWindow && !this.mainWindow.isDestroyed()) {
					this.mainWindow.loadURL(serverUrl);
				}
			}
		};

		// 延迟一点加载，确保窗口完全创建
		setTimeout(() => {
			loadWindow();
		}, 100);
	}

	/**
	 * 设置窗口事件监听器
	 */
	private setupWindowListeners(serverUrl: string): void {
		if (!this.mainWindow) return;

		// 透明背景就绪标志由 setupIpcHandlers 中的监听器更新

		// 窗口准备显示
		this.mainWindow.once("ready-to-show", () => {
			// 如果启用灵动岛模式，窗口始终显示但是透明和点击穿透
			// 这样只有悬浮按钮可见，不影响其他工作
			if (enableDynamicIsland && this.mainWindow) {
				// 等待透明背景设置完成后再显示窗口
				// 这样可以避免 Next.js SSR 导致的窗口显示问题
				const showWindow = () => {
					if (this.mainWindow) {
						this.mainWindow.show();
						// 默认设置点击穿透，直到鼠标悬停在灵动岛上
						this.mainWindow.setIgnoreMouseEvents(true, { forward: true });
						logger.info(
							"Dynamic Island mode enabled: window shown, click-through active",
						);
					}
				};

				// 等待透明背景设置完成后再显示窗口
				// 优先等待 IPC 信号，如果没有收到信号则延迟显示
				const showWindowDelayed = () => {
					if (!this.mainWindow) return;

					// 如果已经收到透明背景就绪信号，直接显示
					if (this.transparentBackgroundReady) {
						showWindow();
						return;
					}

					// 等待页面加载完成
					if (this.mainWindow.webContents.isLoading()) {
						this.mainWindow.webContents.once("did-finish-load", () => {
							// 等待透明背景设置完成（preload 脚本会发送信号）
							// 增加延迟时间，确保 Next.js 的客户端脚本完全执行
							// 在显示窗口前，再次注入脚本强制设置透明背景
							if (!this.mainWindow) return;
							this.mainWindow.webContents
								.executeJavaScript(`
								(function() {
									const html = document.documentElement;
									const body = document.body;
									const next = document.getElementById('__next');

									if (html) {
										html.setAttribute('data-electron', 'true');
										html.style.setProperty('background-color', 'transparent', 'important');
										html.style.setProperty('background', 'transparent', 'important');
									}

									if (body) {
										body.style.setProperty('background-color', 'transparent', 'important');
										body.style.setProperty('background', 'transparent', 'important');
									}

									if (next) {
										next.style.setProperty('background-color', 'transparent', 'important');
										next.style.setProperty('background', 'transparent', 'important');
									}
								})();
							`)
								.then(() => {
									// 延迟显示，确保透明背景已应用
									setTimeout(() => {
										showWindow();
									}, 300);
								})
								.catch(() => {
									// 即使执行失败也显示窗口
									setTimeout(() => {
										showWindow();
									}, 500);
								});
						});
					} else {
						// 页面已加载完成，直接延迟显示
						setTimeout(() => {
							showWindow();
						}, 300);
					}
				};

				// 延迟一点，等待透明背景就绪信号
				setTimeout(() => {
					showWindowDelayed();
				}, 100);
			} else {
				// 非灵动岛模式，直接显示
				if (this.mainWindow) {
					this.mainWindow.show();
			logger.info("Window is ready to show");
				}
			}
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
	 * 设置透明背景就绪标志（由 IPC 处理器调用）
	 */
	setTransparentBackgroundReady(ready: boolean): void {
		this.transparentBackgroundReady = ready;
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
