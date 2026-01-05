/**
 * 后端服务器管理模块
 * 负责 LifeTrace 后端服务器的启动、停止和进程管理
 */

import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import {
	DEFAULT_BACKEND_PORT,
	getActualBackendPort,
	setActualBackendPort,
} from "../core/config";
import { logFile, logToFile } from "../core/logger";
import { findAvailablePort } from "../core/port-manager";
import { setBackendProcessRef, stopBackendHealthCheck } from "./health-check";

let backendProcess: ChildProcess | null = null;

/**
 * 获取后端进程
 */
export function getBackendProcess(): ChildProcess | null {
	return backendProcess;
}

/**
 * 设置后端进程
 */
export function setBackendProcess(proc: ChildProcess | null): void {
	backendProcess = proc;
	setBackendProcessRef(proc);
}

/**
 * 检查指定端口是否运行着 LifeTrace 后端
 * 通过调用 /health 端点并验证 app 标识来确认是 LifeTrace 后端
 */
export function isLifeTraceBackend(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const req = http.get(
			{
				hostname: "127.0.0.1",
				port,
				path: "/health",
				timeout: 2000, // 2秒超时
			},
			(res) => {
				let data = "";
				res.on("data", (chunk) => {
					data += chunk.toString();
				});
				res.on("end", () => {
					try {
						const json = JSON.parse(data);
						// 验证是否是 LifeTrace 后端
						if (json.app === "lifetrace") {
							resolve(true);
						} else {
							resolve(false);
						}
					} catch {
						resolve(false);
					}
				});
			},
		);

		req.on("error", () => resolve(false));
		req.on("timeout", () => {
			req.destroy();
			resolve(false);
		});
	});
}

/**
 * 检测运行中的后端服务器端口
 * 通过调用 /health 端点并验证 app 标识来确认是 LifeTrace 后端
 */
export async function detectRunningBackendPort(): Promise<number | null> {
	// 先检查优先级端口（开发版和 Build 版默认端口）
	const priorityPorts = [8000, 8001];
	for (const port of priorityPorts) {
		if (await isLifeTraceBackend(port)) {
			logToFile(`Detected backend running on port: ${port}`);
			return port;
		}
	}

	// 再检查其他可能的端口（跳过已检查的）
	for (let port = 8002; port < 8100; port++) {
		if (await isLifeTraceBackend(port)) {
			logToFile(`Detected backend running on port: ${port}`);
			return port;
		}
	}

	return null;
}

/**
 * 启动后端服务器（支持动态端口）
 */
export async function startBackendServer(): Promise<void> {
	if (backendProcess) {
		logToFile("Backend server is already running");
		return;
	}

	// 获取后端可执行文件路径
	let backendPath: string;
	let backendDir: string;
	// Windows 平台需要 .exe 扩展名，其他平台不需要
	const execName = process.platform === "win32" ? "lifetrace.exe" : "lifetrace";

	if (app.isPackaged) {
		// 打包环境：后端在 Resources/backend/lifetrace
		backendDir = path.join(process.resourcesPath, "backend");
		backendPath = path.join(backendDir, execName);
	} else {
		// 开发环境：使用 dist-backend
		const projectRoot = path.resolve(__dirname, "../..");
		backendDir = path.join(projectRoot, "..", "dist-backend");
		backendPath = path.join(backendDir, execName);
	}

	// 检查后端可执行文件是否存在
	if (!fs.existsSync(backendPath)) {
		const errorMsg = `The backend executable was not found at: ${backendPath}\n\nPlease rebuild the application.`;
		logToFile(`ERROR: ${errorMsg}`);
		const windows = BrowserWindow.getAllWindows();
		if (windows.length > 0) {
			dialog.showErrorBox("Backend Not Found", errorMsg);
		}
		return;
	}

	// 获取数据目录
	const userDataDir = app.getPath("userData");
	const dataDir = path.join(userDataDir, "lifetrace-data");

	// 动态端口分配：查找可用的后端端口
	try {
		const port = await findAvailablePort(DEFAULT_BACKEND_PORT);
		setActualBackendPort(port);
		logToFile(`Backend will use port: ${port}`);
	} catch (error) {
		const errorMsg = `Failed to find available backend port: ${error instanceof Error ? error.message : String(error)}`;
		logToFile(`ERROR: ${errorMsg}`);
		const windows = BrowserWindow.getAllWindows();
		if (windows.length > 0) {
			dialog.showErrorBox("Port Allocation Error", errorMsg);
		}
		throw error;
	}

	logToFile(`Starting backend server...`);
	logToFile(`Backend path: ${backendPath}`);
	logToFile(`Backend directory: ${backendDir}`);
	logToFile(`Data directory: ${dataDir}`);
	logToFile(`Backend port: ${getActualBackendPort()}`);

	// 启动后端进程，使用动态分配的端口
	backendProcess = spawn(
		backendPath,
		["--port", String(getActualBackendPort()), "--data-dir", dataDir],
		{
			cwd: backendDir,
			env: {
				...process.env,
				PYTHONUNBUFFERED: "1",
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	setBackendProcessRef(backendProcess);

	// 记录后端输出
	if (backendProcess.stdout) {
		backendProcess.stdout.setEncoding("utf8");
		backendProcess.stdout.on("data", (data) => {
			const output = String(data);
			logToFile(`[Backend STDOUT] ${output.trim()}`);
		});
	}

	if (backendProcess.stderr) {
		backendProcess.stderr.setEncoding("utf8");
		backendProcess.stderr.on("data", (data) => {
			const output = String(data);
			logToFile(`[Backend STDERR] ${output.trim()}`);
		});
	}

	backendProcess.on("error", (error) => {
		const errorMsg = `Failed to start backend server: ${error.message}`;
		logToFile(`ERROR: ${errorMsg}`);
		const windows = BrowserWindow.getAllWindows();
		if (windows.length > 0) {
			dialog.showErrorBox(
				"Backend Start Error",
				`${errorMsg}\n\nCheck logs at: ${logFile}`,
			);
		}
		backendProcess = null;
		setBackendProcessRef(null);
	});

	backendProcess.on("exit", (code, signal) => {
		const exitMsg = `Backend server exited with code ${code}${signal ? `, signal ${signal}` : ""}`;
		logToFile(`ERROR: ${exitMsg}`);
		backendProcess = null;
		setBackendProcessRef(null);

		const windows = BrowserWindow.getAllWindows();
		if (windows.length > 0 && code !== 0) {
			dialog.showErrorBox(
				"Backend Server Exited",
				`The backend server exited unexpectedly.\n\n${exitMsg}\n\nCheck logs at: ${logFile}\n\nBackend path: ${backendPath}\nData directory: ${dataDir}`,
			);
		}
	});
}

/**
 * 停止后端服务器
 * 注意：这个函数只发送停止信号，不等待进程退出
 * 实际的等待逻辑在 cleanup 函数中处理
 */
export function stopBackendServer(): void {
	stopBackendHealthCheck();
	if (backendProcess && !backendProcess.killed) {
		logToFile("Stopping backend server...");
		try {
			// 发送优雅关闭信号（SIGTERM）
			backendProcess.kill("SIGTERM");
		} catch (error) {
			logToFile(
				`Error stopping backend server: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		// 不立即设置为 null，让 cleanup 函数可以等待进程退出
	}
}
