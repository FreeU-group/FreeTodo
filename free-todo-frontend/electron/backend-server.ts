/**
 * 后端服务器管理
 * 继承 ProcessManager 实现后端服务器的启动和管理
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { app, dialog } from "electron";
import {
	getServerMode,
	HEALTH_CHECK_INTERVAL,
	PORT_CONFIG,
	PROCESS_CONFIG,
	type ServerMode,
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
	/** 服务器模式（dev 或 build） */
	private serverMode: ServerMode;

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
		this.serverMode = getServerMode();
	}

	/**
	 * 获取当前服务器模式
	 */
	getServerMode(): ServerMode {
		return this.serverMode;
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

		// 启动后端进程，传递模式参数
		this.process = spawn(
			this.backendPath,
			[
				"--port",
				String(this.port),
				"--data-dir",
				this.dataDir,
				"--mode",
				this.serverMode,
			],
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

		// 验证后端模式是否匹配
		await this.verifyBackendMode();

		// 启动健康检查
		this.startHealthCheck();
	}

	/**
	 * 验证后端服务器模式是否与前端期望一致
	 * 防止 DEV 前端连接到 Build 后端，或反之
	 */
	private async verifyBackendMode(): Promise<void> {
		try {
			const healthUrl = `${this.getUrl()}/health`;
			const response = await fetch(healthUrl);

			if (!response.ok) {
				logger.warn(`Cannot verify backend mode: health check returned ${response.status}`);
				return;
			}

			const data = (await response.json()) as {
				app?: string;
				server_mode?: string;
			};

			// 检查应用标识
			if (data.app !== "lifetrace") {
				const errorMsg = `Backend at ${this.getUrl()} is not a LifeTrace server (app: ${data.app})`;
				logger.error(errorMsg);
				throw new Error(errorMsg);
			}

			// 检查服务器模式
			const backendMode = data.server_mode;
			if (backendMode && backendMode !== this.serverMode) {
				const errorMsg = `Backend mode mismatch: expected "${this.serverMode}", got "${backendMode}". This may indicate another version of LifeTrace is running.`;
				logger.error(errorMsg);
				dialog.showErrorBox(
					"Backend Mode Mismatch",
					`The backend server is running in "${backendMode}" mode, but this application is running in "${this.serverMode}" mode.\n\nThis usually happens when both DEV and Build versions are running simultaneously.\n\nPlease close the other version and restart this application.`,
				);
				throw new Error(errorMsg);
			}

			logger.info(`Backend mode verified: ${backendMode || "unknown"}`);
		} catch (error) {
			if (error instanceof Error && error.message.includes("mode mismatch")) {
				throw error;
			}
			// 其他错误（网络问题等）只记录警告，不阻止启动
			logger.warn(`Cannot verify backend mode: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
