/**
 * Electron 主进程入口
 * 协调各个模块，启动应用
 */

import { app, dialog } from "electron";

// 核心模块
import {
	DEFAULT_BACKEND_PORT,
	DEFAULT_FRONTEND_PORT,
	getBackendUrl,
	getServerUrl,
	isDev,
	setActualBackendPort,
} from "./core/config";
import { logFile, logToFile } from "./core/logger";
// IPC 处理器模块
import { autoSetupVirtualAudio, requestNotificationPermission, setupAllIpcHandlers } from "./ipc";
// 生命周期管理模块
import { handleSecondInstance, setupLifecycleHandlers } from "./lifecycle/app-lifecycle";
import {
	detectRunningBackendPort,
	startBackendServer,
	stopBackendServer,
} from "./server/backend-server";
// 服务器管理模块
import {
	startBackendHealthCheck,
	startHealthCheck,
	waitForBackend,
	waitForServer,
} from "./server/health-check";
import { startNextServer, stopNextServer } from "./server/next-server";
// 窗口管理模块
import { createWindow } from "./window/window-manager";

// 导出停止函数供外部使用
export { stopBackendServer, stopNextServer };

// 确保只有一个应用实例运行
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	// 如果已经有实例在运行，退出当前实例
	app.quit();
} else {
	// 当另一个实例尝试启动时，聚焦到当前窗口
	app.on("second-instance", handleSecondInstance);

	// 设置生命周期事件处理器
	setupLifecycleHandlers();

	// 应用准备就绪
	app.whenReady().then(async () => {
		try {
			logToFile("Application starting...");

			// 自动检测虚拟音频设备（异步，不阻塞启动）
			autoSetupVirtualAudio().catch((err) => {
				logToFile(`自动配置虚拟音频设备失败: ${err.message}`);
			});

			logToFile(`App isPackaged: ${app.isPackaged}`);
			logToFile(`NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
			logToFile(`isDev: ${isDev}`);
			logToFile(`Will start built-in server: ${!isDev || app.isPackaged}`);
			logToFile(
				`Default ports: frontend=${DEFAULT_FRONTEND_PORT}, backend=${DEFAULT_BACKEND_PORT}`,
			);

			// 设置所有 IPC 处理器
			setupAllIpcHandlers();

			// 请求通知权限（如果需要）
			await requestNotificationPermission();

			// 1. 自动检测后端端口（如果后端已运行）
			logToFile("Detecting running backend server...");
			console.log("[INFO] Detecting running backend server...");
			const detectedBackendPort = await detectRunningBackendPort();
			if (detectedBackendPort) {
				setActualBackendPort(detectedBackendPort);
				logToFile(`Detected backend running on port: ${detectedBackendPort}`);
				console.log(
					`[OK] Detected backend running on port: ${detectedBackendPort}`,
				);
			} else {
				// 如果检测不到，启动后端服务器
				logToFile("No running backend detected, will start backend server...");
				console.log(
					"[WARN] No running backend detected, will start backend server...",
				);
				await startBackendServer();
			}

			// 2. 等待后端就绪（最多等待 180 秒）
			const backendUrl = getBackendUrl();
			const waitBackendMsg = `Waiting for backend server at ${backendUrl} to be ready...`;
			console.log(waitBackendMsg);
			logToFile(waitBackendMsg);
			try {
				await waitForBackend(backendUrl, 180000); // 3 分钟超时
				const backendReadyMsg = `Backend server is ready at ${backendUrl}!`;
				console.log(backendReadyMsg);
				logToFile(backendReadyMsg);

				// 3. 启动后端健康检查
				startBackendHealthCheck();
			} catch (error) {
				const errorMsg = `Backend server not available: ${error instanceof Error ? error.message : String(error)}`;
				logToFile(`WARNING: ${errorMsg}`);
				console.warn(`[WARN] ${errorMsg}`);
				// 开发模式下，后端服务器不可用时不阻塞，继续启动窗口
				if (!isDev) {
					throw error; // 生产模式下必须要有后端
				}
			}

			// 4. 启动 Next.js 服务器（会自动探测可用端口）
			await startNextServer();

			// 5. 等待 Next.js 服务器就绪（最多等待 30 秒）
			const serverUrl = getServerUrl();
			const waitMsg = `Waiting for Next.js server at ${serverUrl} to be ready...`;
			console.log(waitMsg);
			logToFile(waitMsg);
			await waitForServer(serverUrl, 30000);

			const readyMsg = `Next.js server is ready at ${serverUrl}!`;
			console.log(readyMsg);
			logToFile(readyMsg);

			// 6. 启动 Next.js 健康检查
			startHealthCheck();

			// 7. 创建窗口
			createWindow();
			logToFile(
				`Window created successfully. Frontend: ${serverUrl}, Backend: ${backendUrl}`,
			);
		} catch (error) {
			const errorMsg = `Failed to start application: ${error instanceof Error ? error.message : String(error)}`;
			console.error(errorMsg);
			logToFile(`FATAL ERROR: ${errorMsg}`);
			if (error instanceof Error && error.stack) {
				logToFile(`Stack trace: ${error.stack}`);
			}

			dialog.showErrorBox(
				"Startup Error",
				`Failed to start application:\n${errorMsg}\n\nCheck logs at: ${logFile}`,
			);

			setTimeout(() => {
				app.quit();
			}, 3000);
		}
	});
}
