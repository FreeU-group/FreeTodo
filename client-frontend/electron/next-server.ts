/**
 * Next.js 服务器管理模块
 * 负责 Next.js 服务器的启动、停止和进程管理
 */

import { type ChildProcess, fork, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import { emitStatus } from "./bootstrap-status";
import {
	isDevelopment,
	LOG_CONFIG,
	PORT_CONFIG,
} from "./config";
import { logger } from "./logger";
import { portManager } from "./port-manager";

// 需要从 health-check 导入的函数（如果不存在则创建）
// 暂时使用内联实现，后续可以提取到 health-check.ts
function setNextProcessRef(_proc: { killed: boolean } | null): void {
	// 设置进程引用（用于健康检查，如果需要）
}

function stopHealthCheck(): void {
	// 健康检查停止逻辑（如果需要）
}

function waitForServer(url: string, timeout: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const startTime = Date.now();
		const http = require("node:http") as typeof import("node:http");

		const check = () => {
			http
				.get(url, (res: import("node:http").IncomingMessage) => {
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

let nextProcess: ChildProcess | null = null;
let isStopping = false;

	/**
 * 获取 Next.js 进程
 */
export function getNextProcess(): ChildProcess | null {
	return nextProcess;
	}

	/**
 * 设置 Next.js 进程
 */
export function setNextProcess(proc: ChildProcess | null): void {
	nextProcess = proc;
	setNextProcessRef(proc);
}

// 动态端口（运行时确定）
let actualFrontendPort: number = PORT_CONFIG.frontend.default;

/**
 * 获取当前前端端口
 */
function getActualFrontendPort(): number {
	return actualFrontendPort;
}

/**
 * 设置前端端口
 */
function setActualFrontendPort(port: number): void {
	actualFrontendPort = port;
		}


/**
 * 获取后端服务器 URL（需要从外部传入）
 */
let backendUrl = "http://localhost:8000";

/**
 * 设置后端 URL
 */
export function setBackendUrl(url: string): void {
	backendUrl = url;
}

/**
 * 获取后端服务器 URL
 */
export function getBackendUrl(): string {
	return backendUrl;
}

	/**
 * 启动 Next.js 服务器（支持动态端口）
 * 在打包的应用中，总是启动内置的生产服务器
	 */
export async function startNextServer(): Promise<void> {
	const isDev = isDevelopment(app.isPackaged);
	emitStatus({ message: "启动前端服务", progress: 82 });

	// 如果应用已打包，必须启动内置服务器，不允许依赖外部 dev 服务器
		if (app.isPackaged) {
			logger.info("App is packaged - starting built-in production server");
	} else if (isDev) {
		// 开发模式下，尝试探测可用的前端端口（以防开发服务器未启动）
		try {
			const port = await portManager.findAvailablePort(
				PORT_CONFIG.frontend.default,
			);
			setActualFrontendPort(port);
		} catch {
			setActualFrontendPort(PORT_CONFIG.frontend.default);
		}
		const serverUrl = getServerUrl();
		const msg = `Development mode: expecting Next.js dev server at ${serverUrl}`;
		logger.console(msg);
		logger.info(msg);

		// 检查是否已经有 Next.js 服务器在运行
		try {
			await waitForServer(serverUrl, 2000);
			logger.info("Next.js dev server is already running");
			return;
		} catch {
			// 没有运行，需要启动
		}

		// 启动 Next.js dev 服务器
		// 在 Windows 上，需要使用 shell: true 来运行 .cmd 文件
		const devCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
		const devArgs = ["dev"];

		logger.info(
			`Starting Next.js dev server: ${devCommand} ${devArgs.join(" ")}`,
		);
		logger.info(`Working directory: ${path.join(__dirname, "..")}`);

		// Set console encoding to UTF-8 for Windows
		if (process.platform === "win32") {
			try {
				// Try to set console code page to UTF-8
				require("node:child_process").exec("chcp 65001", () => {});
			} catch {
				// Ignore errors
			}
		}

		nextProcess = spawn(devCommand, devArgs, {
			cwd: path.join(__dirname, ".."),
			env: {
				...process.env,
				PORT: String(getActualFrontendPort()),
				NODE_ENV: "development",
				// Set UTF-8 encoding for child process
				...(process.platform === "win32" && { CHCP: "65001" }),
			},
			stdio: ["ignore", "pipe", "pipe"],
			shell: process.platform === "win32", // Windows needs shell
			detached: false, // Ensure child process is part of the same process group
		});
		setNextProcessRef(nextProcess);

		// Listen to output - output directly to console, don't log to file (avoid garbled characters)
		if (nextProcess.stdout) {
			nextProcess.stdout.setEncoding("utf8");
			nextProcess.stdout.on("data", (data) => {
				const output = String(data);
				// Output directly to console (just like pnpm dev)
				// Use Buffer to ensure correct encoding
				try {
					process.stdout.write(Buffer.from(output, "utf8"));
				} catch {
					process.stdout.write(output);
				}
			});
		}

		if (nextProcess.stderr) {
			nextProcess.stderr.setEncoding("utf8");
			nextProcess.stderr.on("data", (data) => {
				const output = String(data);
				// Output directly to console (just like pnpm dev)
				// Use Buffer to ensure correct encoding
				try {
					process.stderr.write(Buffer.from(output, "utf8"));
				} catch {
					process.stderr.write(output);
				}
			});
		}

		nextProcess.on("error", (error) => {
			logger.error(`Failed to start Next.js dev server: ${error.message}`);
		});

		nextProcess.on("exit", (code) => {
			logger.error(`Next.js dev server exited with code ${code}`);
		});

		return;
		} else {
			logger.info(
				"Running in production mode (not packaged) - starting built-in server",
			);
		}

	// 动态端口分配：查找可用的前端端口
		try {
		const port = await portManager.findAvailablePort(
				PORT_CONFIG.frontend.default,
			);
		setActualFrontendPort(port);
		logger.info(`Frontend will use port: ${port}`);
		} catch (error) {
			const errorMsg = `Failed to find available frontend port: ${error instanceof Error ? error.message : String(error)}`;
			logger.error(errorMsg);
			dialog.showErrorBox("Port Allocation Error", errorMsg);
			throw error;
		}

		const serverPath = path.join(
			process.resourcesPath,
			"standalone",
			"server.js",
		);

	const msg = `Starting Next.js server from: ${serverPath}`;
	logger.console(msg);
	logger.info(msg);
	emitStatus({ message: "启动前端服务", progress: 85, detail: serverPath });

	// 检查服务器文件是否存在
		if (!fs.existsSync(serverPath)) {
			const errorMsg = `Server file not found: ${serverPath}`;
			logger.error(errorMsg);
			dialog.showErrorBox(
				"Server Not Found",
				`The Next.js server file was not found at:\n${serverPath}\n\nPlease rebuild the application.`,
			);
			throw new Error(errorMsg);
		}

	// 设置工作目录为 standalone 目录，这样相对路径可以正确解析
		const serverDir = path.dirname(serverPath);

		logger.info(`Server directory: ${serverDir}`);
		logger.info(`Server path: ${serverPath}`);
	logger.info(`PORT: ${getActualFrontendPort()}, HOSTNAME: localhost`);
	logger.info(`NEXT_PUBLIC_API_URL: ${getBackendUrl()}`);

	// 检查关键文件是否存在
		const nextServerDir = path.join(serverDir, ".next", "server");
		if (!fs.existsSync(nextServerDir)) {
			const errorMsg = `Required directory not found: ${nextServerDir}`;
			logger.error(errorMsg);
			throw new Error(errorMsg);
		}
		logger.info("Verified .next/server directory exists");

	// 强制设置生产环境变量，确保服务器以生产模式运行
	// 创建新的环境对象，避免直接修改 process.env
	const serverEnv: Record<string, string | undefined> = {};

	// 复制所有环境变量，但排除 dev 相关变量
	for (const key in process.env) {
		if (!key.startsWith("NEXT_DEV") && !key.startsWith("TURBOPACK")) {
			serverEnv[key] = process.env[key];
		}
	}

	// 强制设置生产模式环境变量，使用动态分配的端口
	serverEnv.PORT = String(getActualFrontendPort());
		serverEnv.HOSTNAME = "localhost";
	serverEnv.NODE_ENV = "production"; // 强制生产模式
	// 注入后端 URL，让 Next.js 的 rewrite 和 API 调用使用正确的后端地址
	serverEnv.NEXT_PUBLIC_API_URL = getBackendUrl();

	// 使用 fork 启动 Node.js 服务器进程
	// fork 是 spawn 的特殊情况，专门用于 Node.js 脚本，提供更好的 IPC 支持
	// 注意：fork 会自动设置 execPath，所以我们只需要传递脚本路径
	nextProcess = fork(serverPath, [], {
		cwd: serverDir, // 设置工作目录
			env: serverEnv as NodeJS.ProcessEnv,
		stdio: ["ignore", "pipe", "pipe", "ipc"], // stdin: ignore, stdout/stderr: pipe, ipc channel
		silent: false, // 不静默，允许输出
		});
	setNextProcessRef(nextProcess);

	logger.info(`Spawned process with PID: ${nextProcess.pid}`);

	// 确保进程引用被保持
	if (!nextProcess.pid) {
			const errorMsg = "Failed to spawn process - no PID assigned";
			logger.error(errorMsg);
			throw new Error(errorMsg);
		}

	// 监听进程的 spawn 事件
	nextProcess.on("spawn", () => {
		logger.info(`Process spawned successfully with PID: ${nextProcess?.pid}`);
	});

	// 收集所有输出用于日志
	let stdoutBuffer = "";
	let stderrBuffer = "";

	// 立即设置数据监听器，避免丢失早期输出
	// 直接输出到控制台，不记录到日志文件（避免乱码）
	if (nextProcess.stdout) {
		nextProcess.stdout.setEncoding("utf8");
		nextProcess.stdout.on("data", (data) => {
			const output = String(data);
			stdoutBuffer += output;
			// 直接输出到控制台
			process.stdout.write(output);
		});
		nextProcess.stdout.on("end", () => {
			logger.info("[Next.js STDOUT] stream ended");
		});
		nextProcess.stdout.on("error", (err) => {
			logger.error(`[Next.js STDOUT] stream error: ${err.message}`);
		});
	}

	if (nextProcess.stderr) {
		nextProcess.stderr.setEncoding("utf8");
		nextProcess.stderr.on("data", (data) => {
			const output = String(data);
			stderrBuffer += output;
			// 直接输出到控制台
			process.stderr.write(output);
		});
		nextProcess.stderr.on("end", () => {
			logger.info("[Next.js STDERR] stream ended");
		});
		nextProcess.stderr.on("error", (err) => {
			logger.error(`[Next.js STDERR] stream error: ${err.message}`);
		});
	}

	nextProcess.on("error", (error) => {
			const errorMsg = `Failed to start Next.js server: ${error.message}`;
		logger.error(errorMsg);
		if (error.stack) {
			logger.error(`Error stack: ${error.stack}`);
		}

		// 显示错误对话框
		const windows = BrowserWindow.getAllWindows();
		if (windows.length > 0) {
			dialog.showErrorBox(
				"Server Start Error",
				`Failed to start Next.js server:\n${error.message}\n\nCheck logs at: ${logger.getLogFilePath()}`,
			);
		}

			try {
				console.error(errorMsg, error);
			} catch {
				// 忽略 EPIPE 错误
			}
		});

	// 监听未捕获的异常（可能在子进程中）
	process.on("uncaughtException", (error) => {
		logger.error(`UNCAUGHT EXCEPTION: ${error.message}`);
		if (error.stack) {
			logger.error(`Stack: ${error.stack}`);
	}
	});

	process.on("unhandledRejection", (reason) => {
		logger.error(`UNHANDLED REJECTION: ${reason}`);
	});

	nextProcess.on("exit", (code, signal) => {
		const exitMsg = `Next.js server exited with code ${code}, signal ${signal}`;

		// 如果是主动关闭（调用了 stop() 方法），不显示错误对话框
		if (isStopping) {
			logger.info(`${exitMsg} (intentional shutdown)`);
			isStopping = false; // 重置标志
			return;
		}

		logger.error(exitMsg);
		logger.info(
			`STDOUT buffer (last ${LOG_CONFIG.bufferDisplayLimit} chars): ${stdoutBuffer.slice(-LOG_CONFIG.bufferDisplayLimit)}`,
		);
		logger.info(
			`STDERR buffer (last ${LOG_CONFIG.bufferDisplayLimit} chars): ${stderrBuffer.slice(-LOG_CONFIG.bufferDisplayLimit)}`,
		);

		// 检查 node_modules 是否存在
		const nodeModulesPath = path.join(serverDir, "node_modules");
		const nextModulePath = path.join(nodeModulesPath, "next");
		logger.info(`Checking node_modules: ${nodeModulesPath}`);
		logger.info(`node_modules exists: ${fs.existsSync(nodeModulesPath)}`);
		logger.info(`next module exists: ${fs.existsSync(nextModulePath)}`);

		// 检查关键依赖
		const styledJsxPath = path.join(nodeModulesPath, "styled-jsx");
		const swcHelpersPath = path.join(nodeModulesPath, "@swc", "helpers");
		logger.info(`styled-jsx exists: ${fs.existsSync(styledJsxPath)}`);
		logger.info(`@swc/helpers exists: ${fs.existsSync(swcHelpersPath)}`);

		// 如果服务器在启动后很快退出（无论是 code 0 还是其他），都认为是错误
		// 因为服务器应该持续运行
		const errorMsg = `Server exited unexpectedly with code ${code}${signal ? `, signal ${signal}` : ""}. Check logs at: ${logger.getLogFilePath()}`;
		logger.error(errorMsg);

		const windows = BrowserWindow.getAllWindows();
		if (windows.length > 0) {
		dialog.showErrorBox(
			"Server Exited Unexpectedly",
				`The Next.js server exited unexpectedly.\n\n${errorMsg}\n\nSTDOUT:\n${stdoutBuffer.slice(-LOG_CONFIG.dialogDisplayLimit) || "(empty)"}\n\nSTDERR:\n${stderrBuffer.slice(-LOG_CONFIG.dialogDisplayLimit) || "(empty)"}\n\nCheck logs at: ${logger.getLogFilePath()}`,
		);
		}

		// 延迟退出，让用户看到错误消息
		setTimeout(() => {
			app.quit();
		}, 3000);
	});
	}

	/**
 * 关闭 Next.js 服务器
 * 注意：这个函数只发送停止信号，不等待进程退出
 * 实际的等待逻辑在 cleanup 函数中处理
 */
export function stopNextServer(): void {
	isStopping = true;
	stopHealthCheck();
	if (nextProcess && !nextProcess.killed) {
		logger.info("Stopping Next.js server...");
		try {
			// 发送优雅关闭信号（SIGTERM）
			nextProcess.kill("SIGTERM");
		} catch (error) {
			logger.error(
				`Error stopping Next.js server: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		// 不立即设置为 null，让 cleanup 函数可以等待进程退出
		}
	}

	/**
 * 获取服务器 URL（用于外部调用）
	 */
export function getServerUrl(): string {
	return `http://localhost:${actualFrontendPort}`;
	}

	/**
 * 等待服务器就绪（公共方法）
 */
export async function waitForServerPublic(
	url: string,
	timeout: number,
): Promise<void> {
	await waitForServer(url, timeout);
}
