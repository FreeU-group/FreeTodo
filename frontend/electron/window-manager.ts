/**
 * 窗口管理服务
 * 封装 BrowserWindow 创建和事件处理
 */

import http from "node:http";
import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import {
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
			// 打包环境：preload.js 在 dist-electron 目录下（和 main.js 在同一目录）
			return path.join(app.getAppPath(), "dist-electron", "preload.js");
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
	create(
		serverUrl: string,
		options?: { waitForServer?: boolean; showLoading?: boolean },
	): void {
		const { waitForServer = true, showLoading = false } = options ?? {};
		const preloadPath = this.getPreloadPath();

		// 保存原始位置和尺寸（用于从全屏模式恢复）
		if (!this.originalBounds) {
			this.originalBounds = {
				x: 0,
				y: 0,
				width: WINDOW_CONFIG.width,
				height: WINDOW_CONFIG.height,
			};
		}

		this.mainWindow = new BrowserWindow({
			width: WINDOW_CONFIG.width,
			height: WINDOW_CONFIG.height,
			x: 0,
			y: 0,
			minWidth: WINDOW_CONFIG.minWidth,
			minHeight: WINDOW_CONFIG.minHeight,
			frame: true,
			transparent: false,
			alwaysOnTop: false,
			hasShadow: true,
			resizable: true,
			movable: true,
			skipTaskbar: false,
			webPreferences: {
				nodeIntegration: false,
				contextIsolation: true,
				preload: preloadPath,
			},
			show: false, // 等待内容加载完成再显示
			backgroundColor: WINDOW_CONFIG.backgroundColor,
		});


		// 监听页面加载完成，检查 preload 脚本是否正确加载
		this.mainWindow.webContents.once("did-finish-load", () => {
			logger.info("Page finished loading, checking preload script...");
			// 注入调试代码检查 electronAPI
			this.mainWindow?.webContents
				.executeJavaScript(`
				(function() {
					const hasElectronAPI = typeof window.electronAPI !== 'undefined';
					const result = {
						hasElectronAPI,
						electronAPIKeys: hasElectronAPI ? Object.keys(window.electronAPI) : [],
						userAgent: navigator.userAgent,
					};
					console.log('[Electron Main] Preload script check:', result);
					return result;
				})();
			`)
				.then((result) => {
					logger.info(
						`Preload script check result: ${JSON.stringify(result, null, 2)}`,
					);
					if (!result.hasElectronAPI) {
						logger.warn(
							"WARNING: electronAPI is not available in renderer process!",
						);
						console.warn(
							"[WARN] electronAPI is not available. Check preload script loading.",
						);
					} else {
						logger.info("✅ electronAPI is available in renderer process");
						logger.info(`Available methods: ${result.electronAPIKeys.join(", ")}`);
					}
				})
				.catch((err) => {
					logger.error(`Error checking preload script: ${err instanceof Error ? err.message : String(err)}`);
					console.error("Error checking preload script:", err);
				});
		});

		// 设置 ready-to-show 事件监听器
		this.mainWindow.once("ready-to-show", () => {
			if (this.mainWindow) {
				this.mainWindow.show();
				logger.info("Window is ready to show");
			}
		});

		// 拦截导航，防止加载到错误的 URL（如 DevTools URL）
		this.mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
			const parsedUrl = new URL(navigationUrl);
			// 只允许加载 localhost:PORT 的 URL
			if (
				parsedUrl.hostname !== "localhost" &&
				parsedUrl.hostname !== "127.0.0.1"
			) {
				event.preventDefault();
				logger.info(`Navigation blocked to: ${navigationUrl}`);
			}
			// 阻止加载 DevTools URL
			if (navigationUrl.startsWith("devtools://")) {
				event.preventDefault();
				logger.info(`DevTools URL blocked: ${navigationUrl}`);
			}
		});

		// 窗口关闭
		this.mainWindow.on("closed", () => {
			logger.info("Window closed");
			this.mainWindow = null;
		});

		// 处理窗口加载失败
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

		// 处理渲染进程崩溃
		this.mainWindow.webContents.on("render-process-gone", (_event, details) => {
			const errorMsg = `Render process crashed: ${details.reason} (exit code: ${details.exitCode})`;
			logger.fatal(errorMsg);
			console.error(errorMsg);

			dialog.showErrorBox(
				"Application Crashed",
				`The application window crashed:\n${details.reason}\n\nCheck logs at: ${logger.getLogFilePath()}`,
			);
		});

		// 处理未捕获的异常
		this.mainWindow.webContents.on("unresponsive", () => {
			logger.warn("Window became unresponsive");
		});

		this.mainWindow.webContents.on("responsive", () => {
			logger.info("Window became responsive again");
		});

		if (showLoading && this.mainWindow) {
			const loadingHtml = this.getLoadingPageHtml();
			const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(loadingHtml)}`;
			this.mainWindow.loadURL(dataUrl);
		}

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

		if (waitForServer) {
			// 延迟一点加载，确保窗口完全创建
			setTimeout(() => {
				loadWindow();
			}, 100);
		}
	}

	/**
	 * 主动加载指定 URL（用于延迟加载）
	 */
	load(serverUrl: string): void {
		if (this.mainWindow && !this.mainWindow.isDestroyed()) {
			this.mainWindow.loadURL(serverUrl);
		}
	}

	/**
	 * 内置加载界面
	 */
	private getLoadingPageHtml(): string {
		return `
<!doctype html>
<html lang="zh">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>FreeTodo 加载中</title>
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #0f1115; color: #e5e7eb; font-family: "Segoe UI", Arial, sans-serif; }
      .wrap { display: flex; align-items: center; justify-content: center; height: 100%; flex-direction: column; gap: 14px; }
      .logo { font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; font-size: 14px; color: #9ca3af; }
      .spinner { width: 32px; height: 32px; border-radius: 50%; border: 3px solid #2b303b; border-top-color: #3b82f6; animation: spin 1s linear infinite; }
      .hint { font-size: 13px; color: #9ca3af; }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <div class="spinner"></div>
      <div class="logo">FreeTodo</div>
      <div class="hint">正在启动服务...</div>
    </div>
  </body>
</html>
`;
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
