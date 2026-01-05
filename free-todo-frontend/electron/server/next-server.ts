/**
 * Next.js 服务器管理模块
 * 负责 Next.js 服务器的启动、停止和进程管理
 */

import { type ChildProcess, fork, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";
import {
	DEFAULT_FRONTEND_PORT,
	getActualFrontendPort,
	getBackendUrl,
	getServerUrl,
	isDev,
	setActualFrontendPort,
} from "../core/config";
import { logFile, logToFile } from "../core/logger";
import { findAvailablePort } from "../core/port-manager";
import { setNextProcessRef, stopHealthCheck, waitForServer } from "./health-check";

let nextProcess: ChildProcess | null = null;

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

/**
 * 启动 Next.js 服务器（支持动态端口）
 * 在打包的应用中，总是启动内置的生产服务器
 */
export async function startNextServer(): Promise<void> {
	// 如果应用已打包，必须启动内置服务器，不允许依赖外部 dev 服务器
	if (app.isPackaged) {
		logToFile("App is packaged - starting built-in production server");
	} else if (isDev) {
		// 开发模式下，尝试探测可用的前端端口（以防开发服务器未启动）
		try {
			const port = await findAvailablePort(DEFAULT_FRONTEND_PORT);
			setActualFrontendPort(port);
		} catch {
			setActualFrontendPort(DEFAULT_FRONTEND_PORT);
		}
		const serverUrl = getServerUrl();
		const msg = `Development mode: expecting Next.js dev server at ${serverUrl}`;
		console.log(msg);
		logToFile(msg);

		// 检查是否已经有 Next.js 服务器在运行
		try {
			await waitForServer(serverUrl, 2000);
			logToFile("Next.js dev server is already running");
			return;
		} catch {
			// 没有运行，需要启动
		}

		// 启动 Next.js dev 服务器
		// 在 Windows 上，需要使用 shell: true 来运行 .cmd 文件
		const devCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
		const devArgs = ["dev"];

		logToFile(
			`Starting Next.js dev server: ${devCommand} ${devArgs.join(" ")}`,
		);
		logToFile(`Working directory: ${path.join(__dirname, "..")}`);

		nextProcess = spawn(devCommand, devArgs, {
			cwd: path.join(__dirname, ".."),
			env: {
				...process.env,
				PORT: String(getActualFrontendPort()),
				NODE_ENV: "development",
			},
			stdio: ["ignore", "pipe", "pipe"],
			shell: process.platform === "win32", // Windows 上需要 shell
		});
		setNextProcessRef(nextProcess);

		// 监听输出
		if (nextProcess.stdout) {
			nextProcess.stdout.on("data", (data) => {
				logToFile(`[Next.js Dev] ${data.toString().trim()}`);
			});
		}

		if (nextProcess.stderr) {
			nextProcess.stderr.on("data", (data) => {
				logToFile(`[Next.js Dev Error] ${data.toString().trim()}`);
			});
		}

		nextProcess.on("error", (error) => {
			logToFile(`Failed to start Next.js dev server: ${error.message}`);
		});

		nextProcess.on("exit", (code) => {
			logToFile(`Next.js dev server exited with code ${code}`);
		});

		return;
	} else {
		logToFile(
			"Running in production mode (not packaged) - starting built-in server",
		);
	}

	// 动态端口分配：查找可用的前端端口
	try {
		const port = await findAvailablePort(DEFAULT_FRONTEND_PORT);
		setActualFrontendPort(port);
		logToFile(`Frontend will use port: ${port}`);
	} catch (error) {
		const errorMsg = `Failed to find available frontend port: ${error instanceof Error ? error.message : String(error)}`;
		logToFile(`ERROR: ${errorMsg}`);
		dialog.showErrorBox("Port Allocation Error", errorMsg);
		throw error;
	}

	const serverPath = path.join(
		process.resourcesPath,
		"standalone",
		"server.js",
	);

	const msg = `Starting Next.js server from: ${serverPath}`;
	console.log(msg);
	logToFile(msg);

	// 检查服务器文件是否存在
	if (!fs.existsSync(serverPath)) {
		const errorMsg = `Server file not found: ${serverPath}`;
		logToFile(`ERROR: ${errorMsg}`);
		dialog.showErrorBox(
			"Server Not Found",
			`The Next.js server file was not found at:\n${serverPath}\n\nPlease rebuild the application.`,
		);
		throw new Error(errorMsg);
	}

	// 设置工作目录为 standalone 目录，这样相对路径可以正确解析
	const serverDir = path.dirname(serverPath);

	logToFile(`Server directory: ${serverDir}`);
	logToFile(`Server path: ${serverPath}`);
	logToFile(`PORT: ${getActualFrontendPort()}, HOSTNAME: localhost`);
	logToFile(`NEXT_PUBLIC_API_URL: ${getBackendUrl()}`);

	// 检查关键文件是否存在
	const nextServerDir = path.join(serverDir, ".next", "server");
	if (!fs.existsSync(nextServerDir)) {
		const errorMsg = `Required directory not found: ${nextServerDir}`;
		logToFile(`ERROR: ${errorMsg}`);
		throw new Error(errorMsg);
	}
	logToFile(`Verified .next/server directory exists`);

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

	logToFile(`Spawned process with PID: ${nextProcess.pid}`);

	// 确保进程引用被保持
	if (!nextProcess.pid) {
		const errorMsg = "Failed to spawn process - no PID assigned";
		logToFile(`ERROR: ${errorMsg}`);
		throw new Error(errorMsg);
	}

	// 监听进程的 spawn 事件
	nextProcess.on("spawn", () => {
		logToFile(`Process spawned successfully with PID: ${nextProcess?.pid}`);
	});

	// 收集所有输出用于日志
	let stdoutBuffer = "";
	let stderrBuffer = "";

	// 立即设置数据监听器，避免丢失早期输出
	if (nextProcess.stdout) {
		nextProcess.stdout.setEncoding("utf8");
		nextProcess.stdout.on("data", (data) => {
			const output = String(data);
			stdoutBuffer += output;
			// 立即记录到日志文件
			logToFile(`[Next.js STDOUT] ${output.trim()}`);
		});
		nextProcess.stdout.on("end", () => {
			logToFile("[Next.js STDOUT] stream ended");
		});
		nextProcess.stdout.on("error", (err) => {
			logToFile(`[Next.js STDOUT] stream error: ${err.message}`);
		});
	}

	if (nextProcess.stderr) {
		nextProcess.stderr.setEncoding("utf8");
		nextProcess.stderr.on("data", (data) => {
			const output = String(data);
			stderrBuffer += output;
			// 立即记录到日志文件
			logToFile(`[Next.js STDERR] ${output.trim()}`);
		});
		nextProcess.stderr.on("end", () => {
			logToFile("[Next.js STDERR] stream ended");
		});
		nextProcess.stderr.on("error", (err) => {
			logToFile(`[Next.js STDERR] stream error: ${err.message}`);
		});
	}

	nextProcess.on("error", (error) => {
		const errorMsg = `Failed to start Next.js server: ${error.message}`;
		logToFile(`ERROR: ${errorMsg}`);
		logToFile(`Error stack: ${error.stack || "No stack trace"}`);

		// 显示错误对话框
		const windows = BrowserWindow.getAllWindows();
		if (windows.length > 0) {
			dialog.showErrorBox(
				"Server Start Error",
				`Failed to start Next.js server:\n${error.message}\n\nCheck logs at: ${logFile}`,
			);
		}

		try {
			console.error(errorMsg, error);
		} catch (_err) {
			// 忽略 EPIPE 错误
		}
	});

	// 监听未捕获的异常（可能在子进程中）
	process.on("uncaughtException", (error) => {
		logToFile(`UNCAUGHT EXCEPTION: ${error.message}`);
		logToFile(`Stack: ${error.stack || "No stack"}`);
	});

	process.on("unhandledRejection", (reason) => {
		logToFile(`UNHANDLED REJECTION: ${reason}`);
	});

	nextProcess.on("exit", (code, signal) => {
		const exitMsg = `Next.js server exited with code ${code}, signal ${signal}`;
		logToFile(exitMsg);
		logToFile(`STDOUT buffer (last 2000 chars): ${stdoutBuffer.slice(-2000)}`);
		logToFile(`STDERR buffer (last 2000 chars): ${stderrBuffer.slice(-2000)}`);

		// 检查 node_modules 是否存在
		const nodeModulesPath = path.join(serverDir, "node_modules");
		const nextModulePath = path.join(nodeModulesPath, "next");
		logToFile(`Checking node_modules: ${nodeModulesPath}`);
		logToFile(`node_modules exists: ${fs.existsSync(nodeModulesPath)}`);
		logToFile(`next module exists: ${fs.existsSync(nextModulePath)}`);

		// 检查关键依赖
		const styledJsxPath = path.join(nodeModulesPath, "styled-jsx");
		const swcHelpersPath = path.join(nodeModulesPath, "@swc", "helpers");
		logToFile(`styled-jsx exists: ${fs.existsSync(styledJsxPath)}`);
		logToFile(`@swc/helpers exists: ${fs.existsSync(swcHelpersPath)}`);

		// 如果服务器在启动后很快退出（无论是 code 0 还是其他），都认为是错误
		// 因为服务器应该持续运行
		const errorMsg = `Server exited unexpectedly with code ${code}${signal ? `, signal ${signal}` : ""}. Check logs at: ${logFile}`;
		logToFile(`ERROR: ${errorMsg}`);

		const windows = BrowserWindow.getAllWindows();
		if (windows.length > 0) {
			dialog.showErrorBox(
				"Server Exited Unexpectedly",
				`The Next.js server exited unexpectedly.\n\n${errorMsg}\n\nSTDOUT:\n${stdoutBuffer.slice(-1000) || "(empty)"}\n\nSTDERR:\n${stderrBuffer.slice(-1000) || "(empty)"}\n\nCheck logs at: ${logFile}`,
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
	stopHealthCheck();
	if (nextProcess && !nextProcess.killed) {
		logToFile("Stopping Next.js server...");
		try {
			// 发送优雅关闭信号（SIGTERM）
			nextProcess.kill("SIGTERM");
		} catch (error) {
			logToFile(
				`Error stopping Next.js server: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		// 不立即设置为 null，让 cleanup 函数可以等待进程退出
	}
}
