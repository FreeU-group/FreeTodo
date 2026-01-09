/**
 * 后端服务器管理
 * 继承 ProcessManager 实现后端服务器的启动和管理
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app, dialog } from "electron";
import {
	HEALTH_CHECK_INTERVAL,
	PORT_CONFIG,
	PROCESS_CONFIG,
	TIMEOUT_CONFIG,
} from "./config";
import { logger } from "./logger";
import { portManager } from "./port-manager";
import { ProcessManager } from "./process-manager";

/**
 * 后端服务器管理类
 * 负责启动、监控和停止 Python 后端服务器
 */
export class BackendServer extends ProcessManager {
	/** 后端可执行文件路径 */
	private backendPath: string | null = null;
	/** 后端工作目录 */
	private backendDir: string | null = null;
	/** 数据目录路径 */
	private dataDir: string | null = null;

	constructor() {
		super(
			{
				name: "Backend",
				healthEndpoint: "/health",
				healthCheckInterval: HEALTH_CHECK_INTERVAL.backend,
				readyTimeout: TIMEOUT_CONFIG.backendReady,
				acceptedStatusCodes: { min: 200, max: 400 },
			},
			PORT_CONFIG.backend.default,
		);
	}

	/**
	 * 解析后端可执行文件路径
	 * 根据打包状态和平台确定正确的路径
	 */
	private resolveBackendPaths(): void {
		if (app.isPackaged) {
			// 打包环境：后端在 Resources/backend/lifetrace
			this.backendDir = path.join(process.resourcesPath, "backend");
		} else {
			// 开发环境：使用根目录下的 dist-backend
			// __dirname 指向 dist-electron 目录，需要向上两级到达项目根目录
			const projectRoot = path.resolve(__dirname, "../..");
			this.backendDir = path.join(projectRoot, "dist-backend");
		}

		this.backendPath = path.join(
			this.backendDir,
			PROCESS_CONFIG.backendExecName,
		);

		// 数据目录
		const userDataDir = app.getPath("userData");
		this.dataDir = path.join(userDataDir, PROCESS_CONFIG.backendDataDir);
	}

	/**
	 * 检查后端可执行文件是否存在
	 */
	private checkBackendExists(): boolean {
		if (!this.backendPath || !fs.existsSync(this.backendPath)) {
			const errorMsg = `The backend executable was not found at: ${this.backendPath}\n\nPlease rebuild the application.`;
			logger.error(errorMsg);
			dialog.showErrorBox("Backend Not Found", errorMsg);
			return false;
		}
		return true;
	}

	/**
	 * 启动后端服务器
	 */
	async start(): Promise<void> {
		if (this.process) {
			logger.info("Backend server is already running");
			return;
		}

		// 解析路径
		this.resolveBackendPaths();

		// 检查可执行文件
		if (!this.checkBackendExists()) {
			return;
		}

		// 动态端口分配
		try {
			this.port = await portManager.findAvailablePort(
				PORT_CONFIG.backend.default,
				PORT_CONFIG.backend.maxAttempts,
			);
			logger.info(`Backend will use port: ${this.port}`);
		} catch (error) {
			const errorMsg = `Failed to find available backend port: ${error instanceof Error ? error.message : String(error)}`;
			logger.error(errorMsg);
			dialog.showErrorBox("Port Allocation Error", errorMsg);
			throw error;
		}

		// 确保路径已解析（用于类型收窄）
		if (!this.backendPath || !this.backendDir || !this.dataDir) {
			throw new Error("Backend paths not resolved");
		}

		logger.info("Starting backend server...");
		logger.info(`Backend path: ${this.backendPath}`);
		logger.info(`Backend directory: ${this.backendDir}`);
		logger.info(`Data directory: ${this.dataDir}`);
		logger.info(`Backend port: ${this.port}`);

		// 启动后端进程
		this.process = spawn(
			this.backendPath,
			["--port", String(this.port), "--data-dir", this.dataDir],
			{
				cwd: this.backendDir,
				env: {
					...process.env,
					PYTHONUNBUFFERED: "1",
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);

		// 设置输出监听器
		this.setupProcessOutputListeners(this.process);

		// 设置错误处理
		this.process.on("error", (error) => {
			const errorMsg = `Failed to start backend server: ${error.message}`;
			logger.error(errorMsg);
			dialog.showErrorBox(
				"Backend Start Error",
				`${errorMsg}\n\nCheck logs at: ${logger.getLogFilePath()}`,
			);
			this.process = null;
		});

		// 设置退出处理
		this.process.on("exit", (code, signal) => {
			const exitMsg = `Backend server exited with code ${code}${signal ? `, signal ${signal}` : ""}`;
			this.process = null;

			// 如果是主动关闭（调用了 stop() 方法），不显示错误对话框
			if (this.isStopping) {
				logger.info(`${exitMsg} (intentional shutdown)`);
				return;
			}

			logger.error(exitMsg);

			// 只在非正常退出时显示错误对话框（code 不为 0 且不为 null）
			if (code !== 0 && code !== null) {
				dialog.showErrorBox(
					"Backend Server Exited",
					`The backend server exited unexpectedly.\n\n${exitMsg}\n\nCheck logs at: ${logger.getLogFilePath()}\n\nBackend path: ${this.backendPath}\nData directory: ${this.dataDir}`,
				);
			}
		});

		// 等待后端就绪
		logger.console(`Waiting for backend server at ${this.getUrl()} to be ready...`);
		await this.waitForReady(this.getUrl(), this.config.readyTimeout);
		logger.console(`Backend server is ready at ${this.getUrl()}!`);

		// 启动健康检查
		this.startHealthCheck();
	}
}
