/**
 * Next.js 前端服务器管理
 * 继承 ProcessManager 实现前端服务器的启动和管理
 */

import { fork } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app, dialog } from "electron";
import {
	HEALTH_CHECK_INTERVAL,
	isDevelopment,
	LOG_CONFIG,
	PORT_CONFIG,
	TIMEOUT_CONFIG,
} from "./config";
import { logger } from "./logger";
import { portManager } from "./port-manager";
import { ProcessManager } from "./process-manager";

/**
 * Next.js 服务器管理类
 * 负责启动、监控和停止 Next.js 前端服务器
 */
export class NextServer extends ProcessManager {
	/** 后端服务器 URL（用于注入环境变量） */
	private backendUrl: string;
	/** 是否跳过启动（开发模式） */
	private skipped = false;

	constructor(backendUrl: string) {
		super(
			{
				name: "Next.js",
				healthEndpoint: "",
				healthCheckInterval: HEALTH_CHECK_INTERVAL.frontend,
				readyTimeout: TIMEOUT_CONFIG.frontendReady,
				acceptedStatusCodes: { min: 200, max: 305 },
			},
			PORT_CONFIG.frontend.default,
		);
		this.backendUrl = backendUrl;
	}

	/**
	 * 更新后端 URL
	 */
	setBackendUrl(url: string): void {
		this.backendUrl = url;
	}

	/**
	 * 启动 Next.js 服务器
	 */
	async start(): Promise<void> {
		// 开发模式下跳过启动，使用外部 dev 服务器
		if (isDevelopment(app.isPackaged)) {
			await this.handleDevMode();
			return;
		}

		// 生产模式下启动内置服务器
		await this.startProductionServer();
	}

	/**
	 * 处理开发模式
	 * 探测端口但不启动服务器，期望外部 dev 服务器已运行
	 */
	private async handleDevMode(): Promise<void> {
		this.skipped = true;

		try {
			this.port = await portManager.findAvailablePort(
				PORT_CONFIG.frontend.default,
				PORT_CONFIG.frontend.maxAttempts,
			);
		} catch {
			this.port = PORT_CONFIG.frontend.default;
		}

		const msg = `Development mode: expecting Next.js dev server at ${this.getUrl()}`;
		logger.console(msg);
	}

	/**
	 * 启动生产服务器
	 */
	private async startProductionServer(): Promise<void> {
		if (app.isPackaged) {
			logger.info("App is packaged - starting built-in production server");
		} else {
			logger.info(
				"Running in production mode (not packaged) - starting built-in server",
			);
		}

		// 动态端口分配
		try {
			this.port = await portManager.findAvailablePort(
				PORT_CONFIG.frontend.default,
				PORT_CONFIG.frontend.maxAttempts,
			);
			logger.info(`Frontend will use port: ${this.port}`);
		} catch (error) {
			const errorMsg = `Failed to find available frontend port: ${error instanceof Error ? error.message : String(error)}`;
			logger.error(errorMsg);
			dialog.showErrorBox("Port Allocation Error", errorMsg);
			throw error;
		}

		// 服务器路径
		const serverPath = path.join(
			process.resourcesPath,
			"standalone",
			"server.js",
		);

		logger.console(`Starting Next.js server from: ${serverPath}`);

		// 检查服务器文件
		if (!fs.existsSync(serverPath)) {
			const errorMsg = `Server file not found: ${serverPath}`;
			logger.error(errorMsg);
			dialog.showErrorBox(
				"Server Not Found",
				`The Next.js server file was not found at:\n${serverPath}\n\nPlease rebuild the application.`,
			);
			throw new Error(errorMsg);
		}

		const serverDir = path.dirname(serverPath);

		// 记录路径信息
		logger.info(`Server directory: ${serverDir}`);
		logger.info(`Server path: ${serverPath}`);
		logger.info(`PORT: ${this.port}, HOSTNAME: localhost`);
		logger.info(`NEXT_PUBLIC_API_URL: ${this.backendUrl}`);

		// 检查关键目录
		const nextServerDir = path.join(serverDir, ".next", "server");
		if (!fs.existsSync(nextServerDir)) {
			const errorMsg = `Required directory not found: ${nextServerDir}`;
			logger.error(errorMsg);
			throw new Error(errorMsg);
		}
		logger.info("Verified .next/server directory exists");

		// 准备环境变量
		const serverEnv = this.prepareServerEnv();
		serverEnv.PORT = String(this.port);
		serverEnv.HOSTNAME = "localhost";
		serverEnv.NODE_ENV = "production";
		serverEnv.NEXT_PUBLIC_API_URL = this.backendUrl;

		// 使用 fork 启动服务器进程
		this.process = fork(serverPath, [], {
			cwd: serverDir,
			env: serverEnv as NodeJS.ProcessEnv,
			stdio: ["ignore", "pipe", "pipe", "ipc"],
			silent: false,
		});

		logger.info(`Spawned process with PID: ${this.process.pid}`);

		if (!this.process.pid) {
			const errorMsg = "Failed to spawn process - no PID assigned";
			logger.error(errorMsg);
			throw new Error(errorMsg);
		}

		// 监听进程 spawn 事件
		this.process.on("spawn", () => {
			logger.info(`Process spawned successfully with PID: ${this.process?.pid}`);
		});

		// 设置输出监听器
		this.setupProcessOutputListeners(this.process);

		// 设置错误处理
		this.process.on("error", (error) => {
			const errorMsg = `Failed to start Next.js server: ${error.message}`;
			logger.errorWithStack(errorMsg, error);

			dialog.showErrorBox(
				"Server Start Error",
				`Failed to start Next.js server:\n${error.message}\n\nCheck logs at: ${logger.getLogFilePath()}`,
			);

			try {
				console.error(errorMsg, error);
			} catch {
				// 忽略 EPIPE 错误
			}
		});

		// 设置退出处理
		this.process.on("exit", (code, signal) => {
			this.handleProcessExit(code, signal, serverDir);
		});

		// 等待服务器就绪
		logger.console(`Waiting for Next.js server at ${this.getUrl()} to be ready...`);
		await this.waitForReady(this.getUrl(), this.config.readyTimeout);
		logger.console(`Next.js server is ready at ${this.getUrl()}!`);

		// 启动健康检查
		this.startHealthCheck();
	}

	/**
	 * 准备服务器环境变量
	 * 排除开发相关的环境变量
	 */
	private prepareServerEnv(): Record<string, string | undefined> {
		const serverEnv: Record<string, string | undefined> = {};

		for (const key in process.env) {
			if (!key.startsWith("NEXT_DEV") && !key.startsWith("TURBOPACK")) {
				serverEnv[key] = process.env[key];
			}
		}

		return serverEnv;
	}

	/**
	 * 处理进程退出事件
	 */
	private handleProcessExit(
		code: number | null,
		signal: string | null,
		serverDir: string,
	): void {
		const exitMsg = `Next.js server exited with code ${code}, signal ${signal}`;

		// 如果是主动关闭（调用了 stop() 方法），不显示错误对话框
		if (this.isStopping) {
			logger.info(`${exitMsg} (intentional shutdown)`);
			return;
		}

		logger.error(exitMsg);

		const buffers = this.getOutputBuffers();
		logger.info(
			`STDOUT buffer (last ${LOG_CONFIG.bufferDisplayLimit} chars): ${buffers.stdout.slice(-LOG_CONFIG.bufferDisplayLimit)}`,
		);
		logger.info(
			`STDERR buffer (last ${LOG_CONFIG.bufferDisplayLimit} chars): ${buffers.stderr.slice(-LOG_CONFIG.bufferDisplayLimit)}`,
		);

		// 检查依赖
		this.logDependencyStatus(serverDir);

		const errorMsg = `Server exited unexpectedly with code ${code}${signal ? `, signal ${signal}` : ""}. Check logs at: ${logger.getLogFilePath()}`;
		logger.error(errorMsg);

		dialog.showErrorBox(
			"Server Exited Unexpectedly",
			`The Next.js server exited unexpectedly.\n\n${errorMsg}\n\nSTDOUT:\n${buffers.stdout.slice(-LOG_CONFIG.dialogDisplayLimit) || "(empty)"}\n\nSTDERR:\n${buffers.stderr.slice(-LOG_CONFIG.dialogDisplayLimit) || "(empty)"}\n\nCheck logs at: ${logger.getLogFilePath()}`,
		);

		// 延迟退出
		setTimeout(() => {
			app.quit();
		}, TIMEOUT_CONFIG.quitDelay);
	}

	/**
	 * 记录依赖状态（用于调试）
	 */
	private logDependencyStatus(serverDir: string): void {
		const nodeModulesPath = path.join(serverDir, "node_modules");
		const deps = [
			{ name: "node_modules", path: nodeModulesPath },
			{ name: "next", path: path.join(nodeModulesPath, "next") },
			{ name: "styled-jsx", path: path.join(nodeModulesPath, "styled-jsx") },
			{
				name: "@swc/helpers",
				path: path.join(nodeModulesPath, "@swc", "helpers"),
			},
		];

		logger.info(`Checking dependencies in: ${nodeModulesPath}`);
		for (const dep of deps) {
			logger.info(`${dep.name} exists: ${fs.existsSync(dep.path)}`);
		}
	}

	/**
	 * 检查是否跳过了启动（开发模式）
	 */
	wasSkipped(): boolean {
		return this.skipped;
	}

	/**
	 * 重写 isRunning 以支持开发模式
	 */
	override isRunning(): boolean {
		if (this.skipped) {
			return true; // 开发模式下假设外部服务器在运行
		}
		return super.isRunning();
	}
}
