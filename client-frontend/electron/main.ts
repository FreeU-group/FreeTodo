/**
 * Electron 主进程入口
 * 应用启动协调层，负责初始化各模块并管理应用生命周期
 */

// Set console encoding to UTF-8 for Windows
if (process.platform === "win32") {
		try {
			// Try to set console code page to UTF-8
			require("node:child_process").exec("chcp 65001", () => {});
		} catch {
			// Ignore errors
		}
}

import path from "node:path";
import { app, dialog, ipcMain } from "electron";
import { BackendServer } from "./backend-server";
import { cancelBootstrap } from "./bootstrap-control";
import { emitComplete, emitStatus } from "./bootstrap-status";
import { closeBootstrapWindow, createBootstrapWindow, getBootstrapWindow } from "./bootstrap-window";
import {
	getBackendRuntime,
	getServerMode,
	getWindowMode,
	isDevelopment,
	PROCESS_CONFIG,
	TIMEOUT_CONFIG,
} from "./config";
import { GlobalShortcutManager } from "./global-shortcut-manager";
import { setupIpcHandlers } from "./ipc-handlers";
import { IslandWindowManager } from "./island-window-manager";
import { logger } from "./logger";
import {
	getServerUrl,
	setBackendUrl,
	startNextServer,
	stopNextServer,
	waitForServerPublic,
} from "./next-server";
import { requestNotificationPermission } from "./notification";
import { NotificationPopupManager } from "./notification-popup-manager";
import { isRuntimePrepared, setPreferredPythonPath, validatePythonPath } from "./python-runtime";
import { getInstallRoot, resolveRuntimeRoot } from "./runtime-paths";
import { TrayManager } from "./tray-manager";
import { WindowManager } from "./window-manager";

// 判断是否为开发模式
const isDev = isDevelopment(app.isPackaged);

// 获取服务器模式
const serverMode = getServerMode();

// 获取窗口模式（island 或 web）
const windowMode = getWindowMode();

let bootstrapCompleted = false;
let stopPromptOpen = false;

// 确保只有相同模式的应用实例运行
// DEV 和 Build 版本使用不同的锁名称，允许它们同时运行
// 但同一模式下只允许一个实例
const lockName = `freetodo-${serverMode}`;
const gotTheLock = app.requestSingleInstanceLock({ lockName } as never);

if (!gotTheLock) {
	// 如果已经有实例在运行，退出当前实例
	app.quit();
} else {
	// 初始化各管理器实例
	const backendServer = new BackendServer();
	const windowManager = new WindowManager();
	const islandWindowManager = new IslandWindowManager();

	// 初始化 Tray 和 GlobalShortcut 管理器（在 Island 创建后初始化）
	let trayManager: TrayManager | null = null;
	let shortcutManager: GlobalShortcutManager | null = null;
	// 通知弹窗管理器（bootstrap 完成后启动）
	let notificationPopupManager: NotificationPopupManager | null = null;

	// 设置全局异常处理
	setupGlobalErrorHandlers();

	// 处理 Ctrl+C (SIGINT) 和 SIGTERM 信号，确保正常退出
	let isQuitting = false;
	const gracefulShutdown = async (signal: string) => {
		if (isQuitting) {
			console.log(`\nReceived ${signal} signal again, forcing exit...`);
			process.exit(1);
			return;
		}

		isQuitting = true;
		console.log(`\nReceived ${signal} signal, shutting down gracefully...`);

		try {
			// Only stop frontend server (Next.js), backend doesn't need to stop
			console.log("\nStopping Next.js server...");
			stopNextServer();
			const { getNextProcess } = await import("./next-server");
			const nextProcess = getNextProcess();
			if (nextProcess && !nextProcess.killed) {
				// Wait for Next.js process to exit (this is critical)
				await new Promise<void>((resolve) => {
					const timeout = setTimeout(() => {
						console.log("Next.js process did not exit within 5 seconds, forcing exit...");
						if (nextProcess && !nextProcess.killed) {
							try {
								// On Windows, use SIGKILL to force kill
								if (process.platform === "win32") {
									nextProcess.kill("SIGKILL");
								} else {
									nextProcess.kill("SIGKILL");
								}
							} catch (err) {
								console.warn(`Failed to kill Next.js process: ${err instanceof Error ? err.message : String(err)}`);
							}
						}
						resolve();
					}, 5000);

					nextProcess.once("exit", () => {
						clearTimeout(timeout);
						console.log("Next.js process exited successfully");
						resolve();
					});
				});
			} else {
				console.log("Next.js process already stopped");
			}

			console.log("Frontend process stopped, exiting...");
			// Ensure app exits
			setTimeout(() => {
				app.quit();
				process.exit(0);
			}, 100);
		} catch (error) {
			console.error(
				`Error during graceful shutdown: ${error instanceof Error ? error.message : String(error)}`,
			);
			process.exit(1);
		}
	};

	// 监听 SIGINT (Ctrl+C) 和 SIGTERM 信号
	process.on("SIGINT", () => gracefulShutdown("SIGINT"));
	process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

	// 当另一个实例尝试启动时，聚焦到主窗口
	app.on("second-instance", () => {
		if (windowMode === "web") {
			// Web 模式：使用普通窗口
			if (windowManager.hasWindow()) {
				windowManager.focus();
			} else if (app.isReady()) {
				windowManager.create(getServerUrl());
			} else {
				app.once("ready", () => {
					windowManager.create(getServerUrl());
				});
			}
		} else {
			// Island 模式：使用灵动岛窗口
			if (islandWindowManager.hasWindow()) {
				islandWindowManager.show();
				islandWindowManager.getWindow()?.focus();
			} else if (app.isReady()) {
				islandWindowManager.create(getServerUrl());
			} else {
				app.once("ready", () => {
					islandWindowManager.create(getServerUrl());
				});
			}
		}
	});

	// macOS: 点击 dock 图标时显示或重建窗口
	app.on("activate", () => {
		if (windowMode === "web") {
			// Web 模式：使用普通窗口
			if (windowManager.hasWindow()) {
				windowManager.focus();
			} else {
				windowManager.create(getServerUrl());
			}
		} else {
			// Island 模式：使用灵动岛窗口
			if (islandWindowManager.hasWindow()) {
				islandWindowManager.show();
			} else {
				islandWindowManager.create(getServerUrl());
			}
		}
	});

	// 所有窗口关闭时退出应用（macOS 除外）
	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") {
			app.quit();
		}
	});

	// 应用退出前清理（不等待，快速退出）
	app.on("before-quit", () => {
		cleanup(backendServer, trayManager, shortcutManager, notificationPopupManager, false);
	});

	// 应用退出时确保清理（不等待，快速退出）
	app.on("quit", () => {
		cleanup(backendServer, trayManager, shortcutManager, notificationPopupManager, false);
	});

	// 应用准备就绪后启动
	app.whenReady().then(async () => {
		if (app.isPackaged) {
			const backendRuntime = getBackendRuntime();
			if (backendRuntime === "script") {
				const runtimeRoot = resolveRuntimeRoot();
				const venvDir = path.join(runtimeRoot, PROCESS_CONFIG.backendVenvDir);
				const requirementsPath = app.isPackaged
					? path.join(process.resourcesPath, "backend", PROCESS_CONFIG.backendRequirementsFile)
					: path.join(getInstallRoot(), PROCESS_CONFIG.backendRequirementsFile);
				if (!isRuntimePrepared(runtimeRoot, venvDir, requirementsPath)) {
					createBootstrapWindow();
					attachBootstrapHandlers();
				} else {
					bootstrapCompleted = true;
				}
			} else {
				bootstrapCompleted = true;
			}
		}
		const managers = await bootstrap(backendServer, windowManager, islandWindowManager);
		trayManager = managers.trayManager;
		shortcutManager = managers.shortcutManager;

		// 初始化系统级通知弹窗（事件驱动：自动待办检测时触发）
		notificationPopupManager = new NotificationPopupManager();
		notificationPopupManager.init();

		// 注册 IPC 事件：渲染进程触发通知弹窗（支持动态内容）
		ipcMain.on("trigger-notification-popup", (_event, data?: { title?: string; message?: string }) => {
			notificationPopupManager?.trigger(data);
		});
	});
}

/**
 * 设置全局错误处理器
 */
function setupGlobalErrorHandlers(): void {
	process.on("uncaughtException", (error) => {
		logger.fatal(`UNCAUGHT EXCEPTION: ${error.message}`);
		if (error.stack) {
			logger.fatal(`Stack: ${error.stack}`);
		}
	});

	process.on("unhandledRejection", (reason) => {
		logger.fatal(`UNHANDLED REJECTION: ${reason}`);
	});
}

function attachBootstrapHandlers(): void {
	const bootstrapWindow = getBootstrapWindow();
	if (bootstrapWindow) {
		bootstrapWindow.on("close", async (event) => {
			if (bootstrapCompleted) {
				return;
			}
			event.preventDefault();
			await confirmStopInstallation();
		});
	}

	ipcMain.removeAllListeners("bootstrap:stop");
	ipcMain.removeAllListeners("bootstrap:select-python");
	ipcMain.on("bootstrap:stop", async () => {
		await confirmStopInstallation();
	});

	ipcMain.on("bootstrap:select-python", async () => {
		const dialogOptions: Electron.OpenDialogOptions = {
			properties: ["openFile"],
			title: "选择 Python 3.12 可执行文件",
		};
		if (process.platform === "win32") {
			dialogOptions.filters = [{ name: "Python", extensions: ["exe"] }];
		}
		const result = await dialog.showOpenDialog(dialogOptions);
		if (result.canceled || result.filePaths.length === 0) {
			return;
		}
		const selectedPath = result.filePaths[0];
		const info = await validatePythonPath(selectedPath);
		if (!info || !info.version.startsWith("3.12")) {
			dialog.showErrorBox(
				"Python 版本不匹配",
				"请选择 Python 3.12 的可执行文件。",
			);
			return;
		}
		setPreferredPythonPath(selectedPath);
		emitStatus({
			message: "已选择 Python 3.12",
			pythonPath: info.executable,
		});
	});
}

async function confirmStopInstallation(): Promise<void> {
	if (bootstrapCompleted || stopPromptOpen) {
		return;
	}
	stopPromptOpen = true;
	const result = await dialog.showMessageBox({
		type: "warning",
		buttons: ["继续等待", "停止安装"],
		defaultId: 0,
		cancelId: 0,
		message: "确定要停止安装 FreeTodo 吗？",
		detail: "停止后需要重新启动安装流程。",
	});
	stopPromptOpen = false;
	if (result.response === 1) {
		emitStatus({ message: "正在停止安装", progress: 0 });
		cancelBootstrap();
		app.quit();
	}
}

function waitForBootstrapContinue(): Promise<void> {
	return new Promise((resolve) => {
		ipcMain.once("bootstrap:continue", () => resolve());
	});
}

/**
 * 应用启动流程
 */
async function bootstrap(
	backendServer: BackendServer,
	windowManager: WindowManager,
	islandWindowManager: IslandWindowManager,
): Promise<{ trayManager: TrayManager; shortcutManager: GlobalShortcutManager }> {
	try {
		// 记录启动信息
		logStartupInfo();
		const installPath = getInstallRoot();
		const runtimeRoot = resolveRuntimeRoot();
		const venvPath = path.join(runtimeRoot, PROCESS_CONFIG.backendVenvDir);
		emitStatus({
			message: "启动初始化",
			progress: 0,
			installPath,
			venvPath,
		});

			// 设置 IPC 处理器（包含 Island 相关）
		setupIpcHandlers(windowManager, islandWindowManager);

		// 请求通知权限
			await requestNotificationPermission();

		// 1. 自动检测后端端口（如果后端已运行）
		logger.info("Detecting running backend server...");
		emitStatus({ message: "检测后端服务", progress: 15 });
		const detectedBackendPort = await backendServer.detectRunningBackendPort();
		if (detectedBackendPort) {
			backendServer.setPort(detectedBackendPort);
			logger.info(`Detected backend running on port: ${detectedBackendPort}`);
			emitStatus({ message: "检测到已运行后端", progress: 20 });
		} else {
			// 如果检测不到，启动后端服务器
			logger.info("No running backend detected, will start backend server...");
			await backendServer.start({ waitForReady: false });
		}

		// 更新 NextServer 的后端 URL（后端可能使用了动态端口）
		const backendUrl = backendServer.getUrl();
		setBackendUrl(backendUrl);

		// 2. 启动 Next.js 前端服务器（无需等待后端完全就绪）
		await startNextServer();
		const serverUrl = getServerUrl();

		// 3. 根据窗口模式创建主窗口（先展示加载界面）
		if (windowMode === "web") {
			windowManager.create(serverUrl, { waitForServer: false, showLoading: true });
			logger.info("Web main window created (loading)");
		}

		// 并行等待后端与前端就绪
		const backendReadyPromise = backendServer
			.waitForReadyAndVerify(TIMEOUT_CONFIG.backendReady * 6)
			.then(() => {
				logger.console(`Backend server is ready at ${backendUrl}!`);
				emitStatus({ message: "后端健康检查通过", progress: 80 });
			})
			.catch((error) => {
				const errorMsg = `Backend server not available: ${error instanceof Error ? error.message : String(error)}`;
				logger.warn(errorMsg);
				if (!isDev) {
					throw error;
				}
			});

		const frontendReadyPromise = waitForServerPublic(serverUrl, 30000)
			.then(() => {
				logger.console(`Next.js server is ready at ${serverUrl}!`);
				emitStatus({ message: "前端服务已就绪", progress: 92 });
			})
			.catch((error) => {
				const errorMsg = `Next.js server did not start within 30000ms: ${error instanceof Error ? error.message : String(error)}`;
				logger.error(errorMsg);
				if (!isDev) {
					throw error;
				}
			});

		await Promise.all([backendReadyPromise, frontendReadyPromise]);

		// 4. 根据窗口模式创建主窗口
		if (app.isPackaged && !bootstrapCompleted) {
			emitStatus({
				message: "安装完成",
				detail: "点击“开始使用”进入应用",
				progress: 100,
			});
			emitComplete();
			await waitForBootstrapContinue();
			bootstrapCompleted = true;
		}

		if (windowMode === "web") {
			// Web 模式：创建普通窗口，加载主页面
			if (!windowManager.hasWindow()) {
				windowManager.create(serverUrl);
			} else {
				windowManager.load(serverUrl);
			}
			logger.info("Web main window created");
		} else {
			// Island 模式：创建灵动岛窗口
			islandWindowManager.create(serverUrl);
			logger.info("Island main window created");
		}
		closeBootstrapWindow();

		// 5. 初始化 Tray 和 Global Shortcuts
		// 注意：Web 模式下 TrayManager 和 GlobalShortcutManager 仍然使用 islandWindowManager
		// 这样即使在 Web 模式下，用户也可以通过快捷键或托盘切换到 Island 模式
		const trayManager = new TrayManager(islandWindowManager);
		trayManager.create();
		logger.info("System tray icon created");

		const shortcutManager = new GlobalShortcutManager(islandWindowManager);
		shortcutManager.registerDefaults();
		logger.info("Global shortcuts registered");

		logger.info(
			`Window created successfully. Frontend: ${getServerUrl()}, Backend: ${backendServer.getUrl()}`,
		);

		return { trayManager, shortcutManager };
	} catch (error) {
		handleStartupError(error);
		// Return dummy instances on error (will be cleaned up)
		return {
			trayManager: new TrayManager(islandWindowManager),
			shortcutManager: new GlobalShortcutManager(islandWindowManager),
		};
	}
}

/**
 * 记录启动信息
 */
function logStartupInfo(): void {
	logger.info("Application starting...");
	logger.info(`App isPackaged: ${app.isPackaged}`);
	logger.info(`NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
	logger.info(`isDev: ${isDev}`);
	logger.info(`Server mode: ${serverMode}`);
	logger.info(`Window mode: ${windowMode}`);
	logger.info(`Will start built-in server: ${!isDev || app.isPackaged}`);
}

/**
 * 处理启动错误
 */
function handleStartupError(error: unknown): void {
			const errorMsg = `Failed to start application: ${error instanceof Error ? error.message : String(error)}`;
			console.error(errorMsg);
	logger.fatal(errorMsg);

			if (error instanceof Error && error.stack) {
		logger.fatal(`Stack trace: ${error.stack}`);
			}

			dialog.showErrorBox(
				"Startup Error",
		`Failed to start application:\n${errorMsg}\n\nCheck logs at: ${logger.getLogFilePath()}`,
			);

			setTimeout(() => {
				app.quit();
	}, TIMEOUT_CONFIG.quitDelay);
}

/**
 * 清理资源
 * @param backendServer 后端服务器实例
 * @param trayManager Tray 管理器实例
 * @param shortcutManager 全局快捷键管理器实例
 * @param waitForExit 是否等待进程退出（默认 false，用于快速退出）
 */
function cleanup(
	backendServer: BackendServer,
	trayManager: TrayManager | null,
	shortcutManager: GlobalShortcutManager | null,
	notifPopupManager: NotificationPopupManager | null,
	waitForExit = false,
): void {
	logger.info("Cleaning up resources...");

	// 清理通知弹窗
	if (notifPopupManager) {
		notifPopupManager.stop();
	}

	// 清理 Tray
	if (trayManager) {
		trayManager.destroy();
	}

	// 清理全局快捷键（在 GlobalShortcutManager 中已自动注册清理）
	if (shortcutManager) {
		shortcutManager.unregisterAll();
	}

	// 如果 waitForExit 为 false，快速停止（不等待）
	backendServer.stop(waitForExit);
	stopNextServer();
}
