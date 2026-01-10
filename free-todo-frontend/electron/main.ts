/**
 * Electron 主进程入口
 * 应用启动协调层，负责初始化各模块并管理应用生命周期
 */

import { app, dialog } from "electron";
import { BackendServer } from "./backend-server";
import { getServerMode, isDevelopment, TIMEOUT_CONFIG } from "./config";
import { setupIpcHandlers } from "./ipc-handlers";
import { logger } from "./logger";
import { NextServer } from "./next-server";
import { requestNotificationPermission } from "./notification";
import { WindowManager } from "./window-manager";

// 判断是否为开发模式
const isDev = isDevelopment(app.isPackaged);

// 获取服务器模式
const serverMode = getServerMode();

// 确保只有相同模式的应用实例运行
// DEV 和 Build 版本使用不同的锁名称，允许它们同时运行
// 但同一模式下只允许一个实例
const lockName = `lifetrace-${serverMode}`;
const gotTheLock = app.requestSingleInstanceLock({ lockName } as never);

if (!gotTheLock) {
	// 如果已经有实例在运行，退出当前实例
	app.quit();
} else {
	// 初始化各管理器实例
	const backendServer = new BackendServer();
	// NextServer 需要后端 URL，初始时使用默认值，启动后更新
	const nextServer = new NextServer(backendServer.getUrl());
	const windowManager = new WindowManager();

	// 设置全局异常处理
	setupGlobalErrorHandlers();

	// 当另一个实例尝试启动时，聚焦到当前窗口
	app.on("second-instance", () => {
		if (windowManager.hasWindow()) {
			windowManager.focus();
		} else if (app.isReady()) {
			windowManager.create(nextServer.getUrl());
		} else {
			app.once("ready", () => {
				windowManager.create(nextServer.getUrl());
			});
		}
	});

	// macOS: 点击 dock 图标时重新创建窗口
	app.on("activate", () => {
		if (!WindowManager.hasAnyWindows()) {
			windowManager.create(nextServer.getUrl());
		}
	});

	// 所有窗口关闭时退出应用（macOS 除外）
	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") {
			app.quit();
		}
	});

	// 应用退出前清理
	app.on("before-quit", () => {
		cleanup(backendServer, nextServer);
	});

	// 应用退出时确保清理
	app.on("quit", () => {
		cleanup(backendServer, nextServer);
	});

	// 应用准备就绪后启动
	app.whenReady().then(async () => {
		await bootstrap(backendServer, nextServer, windowManager);
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

/**
 * 应用启动流程
 */
async function bootstrap(
	backendServer: BackendServer,
	nextServer: NextServer,
	windowManager: WindowManager,
): Promise<void> {
	try {
		// 记录启动信息
		logStartupInfo();

		// 设置 IPC 处理器
		setupIpcHandlers(windowManager);

		// 请求通知权限
		await requestNotificationPermission();

		// 1. 启动后端服务器
		await backendServer.start();

		// 更新 NextServer 的后端 URL（后端可能使用了动态端口）
		nextServer.setBackendUrl(backendServer.getUrl());

		// 2. 启动 Next.js 前端服务器
		await nextServer.start();

		// 3. 创建窗口
		windowManager.create(nextServer.getUrl());

		logger.info(
			`Window created successfully. Frontend: ${nextServer.getUrl()}, Backend: ${backendServer.getUrl()}`,
		);
	} catch (error) {
		handleStartupError(error);
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
 */
function cleanup(backendServer: BackendServer, nextServer: NextServer): void {
	logger.writeEndMarker();
	backendServer.stop();
	nextServer.stop();
}
