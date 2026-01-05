/**
 * 窗口管理模块
 * 负责创建和管理主窗口
 */

import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Menu, screen } from "electron";
import { enableDynamicIsland, getServerUrl } from "../core/config";
import { logFile, logToFile } from "../core/logger";
import { waitForServer } from "../server/health-check";

let mainWindow: BrowserWindow | null = null;

// 保存窗口的原始位置和尺寸（用于从全屏模式恢复）
let originalBounds: {
	x: number;
	y: number;
	width: number;
	height: number;
} | null = null;

/**
 * 获取主窗口
 */
export function getMainWindow(): BrowserWindow | null {
	return mainWindow;
}

/**
 * 设置主窗口
 */
export function setMainWindow(win: BrowserWindow | null): void {
	mainWindow = win;
}

/**
 * 获取原始窗口边界
 */
export function getOriginalBounds(): typeof originalBounds {
	return originalBounds;
}

/**
 * 设置原始窗口边界
 */
export function setOriginalBounds(
	bounds: typeof originalBounds,
): void {
	originalBounds = bounds;
}

/**
 * 获取 preload 脚本路径
 */
export function getPreloadPath(): string {
	if (app.isPackaged) {
		// 打包环境：preload.js 和 main.js 在同一个目录（应用根目录）
		// 使用 app.getAppPath() 获取应用路径
		return path.join(app.getAppPath(), "preload.js");
	}
	// 开发环境：preload.js 和 main.js 都在 dist-electron 目录
	// __dirname 在 bundle 后指向 dist-electron 目录
	return path.join(__dirname, "preload.js");
}

/**
 * 创建主窗口（使用动态 URL）
 */
export function createWindow(): void {
	const serverUrl = getServerUrl();
	const preloadPath = getPreloadPath();

	// 获取主显示器尺寸（用于全屏模式）
	const primaryDisplay = screen.getPrimaryDisplay();
	const { width: screenWidth, height: screenHeight } =
		primaryDisplay.workAreaSize;

	// 灵动岛模式：参考 island 的实现，窗口始终是全屏大小
	// 然后通过 CSS 控制灵动岛的位置和大小（right: 32, bottom: 32, width: 180, height: 48）
	// 保存原始位置和尺寸（用于从全屏模式恢复）
	if (enableDynamicIsland && !originalBounds) {
		// 窗口初始位置在右下角，但大小是全屏（这样灵动岛可以通过 CSS 定位）
		originalBounds = {
			x: 0,
			y: 0,
			width: screenWidth,
			height: screenHeight,
		};
	} else if (!enableDynamicIsland && !originalBounds) {
		originalBounds = {
			x: 0,
			y: 0,
			width: 1200,
			height: 800,
		};
	}

	mainWindow = new BrowserWindow({
		width: enableDynamicIsland ? screenWidth : 1200, // 灵动岛模式使用全屏宽度（初始）
		height: enableDynamicIsland ? screenHeight : 800, // 灵动岛模式使用全屏高度（初始）
		x: 0,
		y: 0,
		minWidth: enableDynamicIsland ? undefined : 800,
		minHeight: enableDynamicIsland ? undefined : 600,
		frame: !enableDynamicIsland, // 灵动岛模式无边框
		transparent: !!enableDynamicIsland, // 灵动岛模式透明
		alwaysOnTop: !!enableDynamicIsland, // 灵动岛模式置顶
		hasShadow: !enableDynamicIsland, // 灵动岛模式无阴影
		resizable: !enableDynamicIsland, // 灵动岛模式初始不可调整（expand-window 时会设置为可调整）
		movable: !enableDynamicIsland, // 灵动岛模式初始不可移动（expand-window 时会设置为可移动）
		skipTaskbar: !!enableDynamicIsland, // 灵动岛模式不显示在任务栏
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: preloadPath,
		},
		show: false, // 等待内容加载完成再显示
		backgroundColor: enableDynamicIsland ? "#00000000" : "#1a1a1a", // 使用透明色值
	});

	// 方案 1: 使用 insertCSS 在页面加载前注入透明背景 CSS（最有效）
	// 这个方法会在页面加载前就应用 CSS，避免 SSR 导致的窗口显示问题
	// 参考 electron-with-nextjs，始终注入透明背景 CSS
	if (enableDynamicIsland && mainWindow) {
		// 在页面加载前注入 CSS（参考 electron-with-nextjs 的 globals.css）
		mainWindow.webContents.insertCSS(`
			html, body, #__next, #__next > div, #__next > div > div {
				background-color: transparent !important;
				background: transparent !important;
			}
		`);
		logToFile("Transparent background CSS injected via insertCSS");

		// 监听页面导航，确保每次页面加载都应用透明背景
		mainWindow.webContents.on("did-navigate", () => {
			if (mainWindow) {
				mainWindow.webContents
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

	// 在加载 URL 前，注入透明背景脚本（在 did-start-loading 时执行）
	// 这个脚本会在页面加载的早期执行，尽可能早地设置透明背景
	mainWindow.webContents.once("did-start-loading", () => {
		if (!mainWindow) return;
		// 注入脚本设置透明背景，尽可能早地执行
		mainWindow.webContents
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

	// 确保服务器已经启动后再加载 URL
	// 在 createWindow 被调用时，服务器应该已经就绪
	// 但为了安全，我们再次检查
	const loadWindow = async () => {
		try {
			// 确保服务器就绪
			await waitForServer(serverUrl, 5000);
			logToFile(`Loading URL: ${serverUrl}`);
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.loadURL(serverUrl);
			}
		} catch (error) {
			logToFile(
				`Failed to verify server, loading URL anyway: ${error instanceof Error ? error.message : String(error)}`,
			);
			// 即使检查失败，也尝试加载（可能服务器刚启动）
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.loadURL(serverUrl);
			}
		}
	};

	// 延迟一点加载，确保窗口完全创建
	setTimeout(() => {
		loadWindow();
	}, 100);

	// 监听页面加载完成，检查 preload 脚本是否正确加载
	mainWindow.webContents.once("did-finish-load", () => {
		logToFile("Page finished loading, checking preload script...");
		// 注入调试代码检查 electronAPI
		mainWindow?.webContents
			.executeJavaScript(`
			(function() {
				const hasElectronAPI = typeof window.electronAPI !== 'undefined';
				const hasGetSystemAudioStream = hasElectronAPI && typeof window.electronAPI.getSystemAudioStream === 'function';
				const result = {
					hasElectronAPI,
					hasGetSystemAudioStream,
					electronAPIKeys: hasElectronAPI ? Object.keys(window.electronAPI) : [],
					userAgent: navigator.userAgent,
					hasProcess: typeof window.process !== 'undefined',
					processType: typeof window.process !== 'undefined' ? window.process.type : undefined
				};
				console.log('[Electron Main] Preload script check:', result);
				return result;
			})();
		`)
			.then((result) => {
				logToFile(
					`Preload script check result: ${JSON.stringify(result, null, 2)}`,
				);
				if (!result.hasElectronAPI) {
					logToFile(
						"WARNING: electronAPI is not available in renderer process!",
					);
					console.warn(
						"[WARN] electronAPI is not available. Check preload script loading.",
					);
					if (mainWindow) {
						dialog.showMessageBox(mainWindow, {
							type: "warning",
							title: "Preload Script Warning",
							message: "electronAPI is not available",
							detail: `This may affect system audio capture.\n\nCheck logs at: ${logFile}\n\nResult: ${JSON.stringify(result, null, 2)}`,
						});
					}
				} else {
					logToFile("✅ electronAPI is available in renderer process");
					logToFile(`Available methods: ${result.electronAPIKeys.join(", ")}`);
				}
			})
			.catch((err) => {
				logToFile(`Error checking preload script: ${err.message}`);
				console.error("Error checking preload script:", err);
			});
	});

	// 监听透明背景设置完成事件
	let transparentBackgroundReady = false;
	ipcMain.on("transparent-background-ready", () => {
		transparentBackgroundReady = true;
		logToFile("Transparent background ready signal received");
	});

	mainWindow.once("ready-to-show", () => {
		// 如果启用灵动岛模式，窗口始终显示但是透明和点击穿透
		// 这样只有悬浮按钮可见，不影响其他工作
		if (enableDynamicIsland && mainWindow) {
			// 等待透明背景设置完成后再显示窗口
			// 这样可以避免 Next.js SSR 导致的窗口显示问题
			const showWindow = () => {
				if (mainWindow) {
					mainWindow.show();
					// 默认设置点击穿透，直到鼠标悬停在灵动岛上
					mainWindow.setIgnoreMouseEvents(true, { forward: true });
					logToFile(
						"Dynamic Island mode enabled: window shown, click-through active",
					);
				}
			};

			// 等待透明背景设置完成后再显示窗口
			// 优先等待 IPC 信号，如果没有收到信号则延迟显示
			const showWindowDelayed = () => {
				if (!mainWindow) return;

				// 如果已经收到透明背景就绪信号，直接显示
				if (transparentBackgroundReady) {
					showWindow();
					return;
				}

				// 等待页面加载完成
				if (mainWindow.webContents.isLoading()) {
					mainWindow.webContents.once("did-finish-load", () => {
						// 等待透明背景设置完成（preload 脚本会发送信号）
						// 增加延迟时间，确保 Next.js 的客户端脚本完全执行
						// 在显示窗口前，再次注入脚本强制设置透明背景
						if (!mainWindow) return;
						mainWindow.webContents
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
							.catch(() => {
								// 忽略错误
							});

						setTimeout(() => {
							const checkTransparent = () => {
								if (transparentBackgroundReady) {
									showWindow();
								} else {
									// 如果 2 秒后还没收到信号，也显示窗口（避免无限等待）
									setTimeout(() => {
										if (!transparentBackgroundReady) {
											logToFile(
												"Warning: Transparent background ready signal not received, showing window anyway",
											);
											showWindow();
										}
									}, 2000);
									// 继续等待信号
									setTimeout(checkTransparent, 100);
								}
							};
							checkTransparent();
						}, 1000); // 延迟 1 秒，确保 Next.js 客户端脚本完全执行
					});
				} else {
					// 页面已加载，等待透明背景设置完成
					// 增加延迟时间，确保 Next.js 的客户端脚本完全执行
					setTimeout(() => {
						const checkTransparent = () => {
							if (transparentBackgroundReady) {
								showWindow();
							} else {
								setTimeout(() => {
									if (!transparentBackgroundReady) {
										logToFile(
											"Warning: Transparent background ready signal not received, showing window anyway",
										);
										showWindow();
									}
								}, 2000);
								setTimeout(checkTransparent, 100);
							}
						};
						checkTransparent();
					}, 500); // 额外延迟 500ms，确保 Next.js 客户端脚本执行
				}
			};

			showWindowDelayed();
		} else {
			mainWindow?.show();
			logToFile("Window is ready to show");
		}
	});

	// 拦截导航，防止加载到错误的 URL（如 DevTools URL）
	mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
		const parsedUrl = new URL(navigationUrl);
		// 只允许加载 localhost:PORT 的 URL
		if (
			parsedUrl.hostname !== "localhost" &&
			parsedUrl.hostname !== "127.0.0.1"
		) {
			event.preventDefault();
			logToFile(`Navigation blocked to: ${navigationUrl}`);
		}
		// 阻止加载 DevTools URL
		if (navigationUrl.startsWith("devtools://")) {
			event.preventDefault();
			logToFile(`DevTools URL blocked: ${navigationUrl}`);
		}
	});

	mainWindow.on("closed", () => {
		logToFile("Window closed");
		mainWindow = null;
	});

	// 处理窗口加载失败
	mainWindow.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription) => {
			const errorMsg = `Window failed to load: ${errorCode} - ${errorDescription}`;
			logToFile(`ERROR: ${errorMsg}`);
			console.error(errorMsg);

			// 如果服务器未就绪，显示错误
			if (errorCode === -106 || errorCode === -105) {
				// ERR_CONNECTION_REFUSED or ERR_NAME_NOT_RESOLVED
				dialog.showErrorBox(
					"Connection Error",
					`Failed to connect to server at ${serverUrl}\n\nError: ${errorDescription}\n\nCheck logs at: ${logFile}`,
				);
			}
		},
	);

	// 处理渲染进程崩溃
	mainWindow.webContents.on("render-process-gone", (_event, details) => {
		const errorMsg = `Render process crashed: ${details.reason} (exit code: ${details.exitCode})`;
		logToFile(`FATAL ERROR: ${errorMsg}`);
		console.error(errorMsg);

		dialog.showErrorBox(
			"Application Crashed",
			`The application window crashed:\n${details.reason}\n\nCheck logs at: ${logFile}`,
		);

		// 不立即退出，让用户看到错误
	});

	// 处理未捕获的异常
	mainWindow.webContents.on("unresponsive", () => {
		logToFile("WARNING: Window became unresponsive");
	});

	mainWindow.webContents.on("responsive", () => {
		logToFile("Window became responsive again");
	});

	// 创建右键菜单（完全照搬 island 实现）
	if (enableDynamicIsland && mainWindow) {
		mainWindow.webContents.on("context-menu", (e, params) => {
			// 标记参数已使用，避免 TypeScript 未使用警告
			void e;
			void params;
			// Only show context menu if we are interacting with the UI
			const contextMenu = Menu.buildFromTemplate([
				{ label: "退出应用", click: () => app.quit() },
			]);
			contextMenu.popup();
		});
	}
}
