/**
 * 应用生命周期管理模块
 * 处理应用启动、关闭、信号处理等
 */

import { app, BrowserWindow } from "electron";
import { logToFile } from "../core/logger";
import { getBackendProcess, setBackendProcess } from "../server/backend-server";
import { stopBackendHealthCheck, stopHealthCheck } from "../server/health-check";
import { getNextProcess, setNextProcess } from "../server/next-server";
import { createWindow, getMainWindow } from "../window/window-manager";

let isExiting = false;

/**
 * 检查是否正在退出
 */
export function getIsExiting(): boolean {
	return isExiting;
}

/**
 * 优雅关闭
 */
export function gracefulShutdown(useAppQuit = false): void {
	if (isExiting) {
		return; // 防止重复调用
	}
	isExiting = true;
	logToFile("Graceful shutdown initiated");
	console.log("[INFO] Shutting down gracefully...");

	// 停止健康检查
	stopHealthCheck();
	stopBackendHealthCheck();

	// 保存进程引用，因为后续会设置为 null
	const nextProc = getNextProcess();
	const backendProc = getBackendProcess();

	// 统计需要等待的进程数
	let pendingProcesses = 0;
	const checkAndExit = () => {
		pendingProcesses--;
		if (pendingProcesses <= 0) {
			logToFile("All child processes exited, exiting application");
			console.log("[OK] All processes stopped, exiting...");
			// 清理进程引用
			setNextProcess(null);
			setBackendProcess(null);
			if (useAppQuit) {
				app.quit();
			} else {
				app.exit(0);
			}
		}
	};

	// 停止后端服务器（如果存在）
	if (backendProc && !backendProc.killed) {
		pendingProcesses++;
		logToFile("Stopping backend server...");
		console.log("[INFO] Stopping backend server...");
		try {
			backendProc.kill("SIGTERM");
			backendProc.once("exit", () => {
				logToFile("Backend server exited");
				console.log("[OK] Backend server stopped");
				checkAndExit();
			});
			// 设置超时，如果 5 秒内没有退出，强制终止
			setTimeout(() => {
				if (backendProc && !backendProc.killed) {
					logToFile("Force killing backend process (timeout)");
					console.log("[WARN] Backend server did not exit, forcing kill...");
					try {
						backendProc.kill("SIGKILL");
					} catch (error) {
						logToFile(
							`Error force killing backend: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}
			}, 5000);
		} catch (error) {
			logToFile(
				`Error stopping backend server: ${error instanceof Error ? error.message : String(error)}`,
			);
			checkAndExit(); // 即使出错也继续退出流程
		}
	}

	// 停止 Next.js 服务器（如果存在）
	if (nextProc && !nextProc.killed) {
		pendingProcesses++;
		logToFile("Stopping Next.js server...");
		console.log("[INFO] Stopping Next.js server...");
		try {
			nextProc.kill("SIGTERM");
			nextProc.once("exit", () => {
				logToFile("Next.js server exited");
				console.log("[OK] Next.js server stopped");
				checkAndExit();
			});
			// 设置超时，如果 5 秒内没有退出，强制终止
			setTimeout(() => {
				if (nextProc && !nextProc.killed) {
					logToFile("Force killing Next.js process (timeout)");
					console.log("[WARN] Next.js server did not exit, forcing kill...");
					try {
						nextProc.kill("SIGKILL");
					} catch (error) {
						logToFile(
							`Error force killing Next.js: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}
			}, 5000);
		} catch (error) {
			logToFile(
				`Error stopping Next.js server: ${error instanceof Error ? error.message : String(error)}`,
			);
			checkAndExit(); // 即使出错也继续退出流程
		}
	}

	// 如果没有需要等待的进程，立即退出
	if (pendingProcesses === 0) {
		logToFile("No child processes to wait for, exiting immediately");
		console.log("[INFO] No child processes to stop, exiting immediately");
		setNextProcess(null);
		setBackendProcess(null);
		if (useAppQuit) {
			app.quit();
		} else {
			app.exit(0);
		}
	} else {
		console.log(
			`[INFO] Waiting for ${pendingProcesses} process(es) to stop...`,
		);
	}
}

/**
 * 设置应用生命周期事件处理器
 */
export function setupLifecycleHandlers(): void {
	// macOS: 点击 dock 图标时重新创建窗口
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});

	// 所有窗口关闭时退出应用（macOS 除外）
	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") {
			app.quit();
		}
	});

	// 应用退出前清理（使用 Electron 的正常退出流程）
	app.on("before-quit", (event) => {
		logToFile("Application before-quit event triggered");
		// 阻止立即退出，等待子进程优雅退出
		event.preventDefault();
		gracefulShutdown(true);
	});

	// 应用退出时确保清理（备用，通常不会到达这里，因为 before-quit 已经处理了）
	app.on("will-quit", (event) => {
		void event;
		logToFile("Application will-quit event triggered");
		// 这里不再需要处理，因为 before-quit 已经处理了所有清理
	});

	// 处理进程信号（Ctrl+C, kill 等）
	const cleanup = () => {
		gracefulShutdown(false);
	};

	process.on("SIGINT", () => {
		logToFile("SIGINT received (Ctrl+C)");
		cleanup();
	});

	process.on("SIGTERM", () => {
		logToFile("SIGTERM received");
		cleanup();
	});
}

/**
 * 处理单实例锁定
 * 当另一个实例尝试启动时，聚焦到当前窗口
 */
export function handleSecondInstance(): void {
	const mainWindow = getMainWindow();
	if (mainWindow) {
		if (mainWindow.isMinimized()) mainWindow.restore();
		mainWindow.focus();
	} else {
		// 如果窗口不存在，等待应用 ready 后再创建窗口，避免在未 ready 状态下创建 BrowserWindow
		if (app.isReady()) {
			createWindow();
		} else {
			app.once("ready", () => {
				createWindow();
			});
		}
	}
}
