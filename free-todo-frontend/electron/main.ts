/**
 * Electron 主进程入口
 * 应用启动协调层，负责初始化各模块并管理应用生命周期
 */

import { app, dialog } from "electron";
import { BackendServer } from "./backend-server";
import { isDevelopment, TIMEOUT_CONFIG } from "./config";
import { setupIpcHandlers } from "./ipc-handlers";
import { logger } from "./logger";
import {
	getServerUrl,
	setBackendUrl,
	startNextServer,
	stopNextServer,
	waitForServerPublic,
} from "./next-server";
import { requestNotificationPermission } from "./notification";
import { WindowManager } from "./window-manager";

// 判断是否为开发模式
const isDev = isDevelopment(app.isPackaged);

// 确保只有一个应用实例运行
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	// 如果已经有实例在运行，退出当前实例
	app.quit();
} else {
	// 初始化各管理器实例
	const backendServer = new BackendServer();
	const windowManager = new WindowManager();

	// 设置全局异常处理
	setupGlobalErrorHandlers();

	// 当另一个实例尝试启动时，聚焦到当前窗口
	app.on("second-instance", () => {
		if (windowManager.hasWindow()) {
			windowManager.focus();
		} else if (app.isReady()) {
			windowManager.create(getServerUrl());
		} else {
			app.once("ready", () => {
				windowManager.create(getServerUrl());
			});
		}
	});

	// macOS: 点击 dock 图标时重新创建窗口
	app.on("activate", () => {
		if (!WindowManager.hasAnyWindows()) {
			windowManager.create(getServerUrl());
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
		cleanup(backendServer);
	});

	// 应用退出时确保清理
	app.on("quit", () => {
		cleanup(backendServer);
	});

	// 应用准备就绪后启动
	app.whenReady().then(async () => {
		await bootstrap(backendServer, windowManager);
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
	windowManager: WindowManager,
): Promise<void> {
	try {
		// 记录启动信息
		logStartupInfo();

		// 设置 IPC 处理器
		setupIpcHandlers(windowManager);

		// 请求通知权限
		await requestNotificationPermission();

		// 1. 自动检测后端端口（如果后端已运行）
		logger.info("Detecting running backend server...");
		const detectedBackendPort = await backendServer.detectRunningBackendPort();
		if (detectedBackendPort) {
			backendServer.setPort(detectedBackendPort);
			logger.info(`Detected backend running on port: ${detectedBackendPort}`);
		} else {
			// 如果检测不到，启动后端服务器
			logger.info("No running backend detected, will start backend server...");
			await backendServer.start();
		}

		// 等待后端就绪（最多等待 180 秒）
		const backendUrl = backendServer.getUrl();
		logger.console(
			`Waiting for backend server at ${backendUrl} to be ready...`,
		);
		try {
			await backendServer.waitForReadyPublic(
				backendUrl,
				TIMEOUT_CONFIG.backendReady * 6, // 3分钟超时
			);
			logger.console(`Backend server is ready at ${backendUrl}!`);
			// 确保健康检查已启动
			backendServer.ensureHealthCheck();
		} catch (error) {
			const errorMsg = `Backend server not available: ${error instanceof Error ? error.message : String(error)}`;
			logger.warn(errorMsg);
			// 开发模式下，后端服务器不可用时不阻塞，继续启动窗口
			if (!isDev) {
				throw error; // 生产模式下必须要有后端
			}
		}

		// 更新 NextServer 的后端 URL（后端可能使用了动态端口）
		setBackendUrl(backendServer.getUrl());

		// 2. 启动 Next.js 前端服务器
		await startNextServer();

		// 3. 等待 Next.js 服务器就绪（最多等待 30 秒）
		const serverUrl = getServerUrl();
		logger.console(
			`Waiting for Next.js server at ${serverUrl} to be ready...`,
		);
		try {
			await waitForServerPublic(serverUrl, 30000);
			logger.console(`Next.js server is ready at ${serverUrl}!`);
		} catch (error) {
			const errorMsg = `Next.js server did not start within 30000ms: ${error instanceof Error ? error.message : String(error)}`;
			logger.error(errorMsg);
			// 开发模式下，即使服务器未就绪也继续（可能启动较慢）
			if (!isDev) {
				throw error; // 生产模式下必须要有服务器
			}
		}

		// 4. 创建窗口
		windowManager.create(serverUrl);

		logger.info(
			`Window created successfully. Frontend: ${getServerUrl()}, Backend: ${backendServer.getUrl()}`,
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
function cleanup(backendServer: BackendServer): void {
	backendServer.stop();
	stopNextServer();
}
