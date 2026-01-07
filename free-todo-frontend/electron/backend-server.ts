/**
 * 后端服务器管理
 * 继承 ProcessManager 实现后端服务器的启动和管理
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
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
	 * 检查指定端口是否运行着 LifeTrace 后端
	 * 通过调用 /health 端点并验证 app 标识来确认是 LifeTrace 后端
	 * @param port 要检测的端口
	 * @returns 如果是 LifeTrace 后端则返回 true
	 */
	private async isLifeTraceBackend(port: number): Promise<boolean> {
		return new Promise((resolve) => {
			const req = http.get(
				{
					hostname: "127.0.0.1",
					port,
					path: this.config.healthEndpoint,
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
	 * @returns 检测到的后端端口，如果没有检测到则返回 null
	 */
	async detectRunningBackendPort(): Promise<number | null> {
		// 先检查优先级端口（开发版和 Build 版默认端口）
		const priorityPorts = [
			PORT_CONFIG.backend.default,
			PORT_CONFIG.backend.default + 1,
		];
		for (const port of priorityPorts) {
			if (await this.isLifeTraceBackend(port)) {
				logger.info(`Detected backend running on port: ${port}`);
				return port;
			}
		}

		// 再检查其他可能的端口（跳过已检查的）
		const startPort = PORT_CONFIG.backend.default + 2;
		const endPort = PORT_CONFIG.backend.default + 100;
		for (let port = startPort; port < endPort; port++) {
			if (await this.isLifeTraceBackend(port)) {
				logger.info(`Detected backend running on port: ${port}`);
				return port;
			}
		}

		return null;
	}

	/**
	 * 设置后端端口（用于检测到的已运行后端）
	 * @param port 后端端口
	 */
	setPort(port: number): void {
		this.port = port;
	}

	/**
	 * 等待后端服务器就绪（公共方法）
	 * @param url 后端 URL
	 * @param timeout 超时时间（毫秒）
	 */
	async waitForReadyPublic(url: string, timeout: number): Promise<void> {
		await this.waitForReady(url, timeout);
	}

	/**
	 * 确保健康检查已启动（公共方法）
	 */
	ensureHealthCheck(): void {
		if (!this.healthCheckTimer) {
			this.startHealthCheck();
		}
	}

	/**
	 * 启动后端服务器
	 */
	async start(): Promise<void> {
		if (this.process) {
			logger.info("Backend server is already running");
			return;
		}

		// 如果端口已设置（通过 detectRunningBackendPort 检测到的），直接使用
		if (this.port !== PORT_CONFIG.backend.default) {
			// 端口已被设置，说明是检测到的已运行后端
			logger.info(`Using existing backend server at port ${this.port}`);
			// 启动健康检查（但不管理进程）
			this.startHealthCheck();
			return;
		}

		// 解析路径
		this.resolveBackendPaths();

		// 检查可执行文件
		if (!this.checkBackendExists()) {
			// 在开发模式下，如果可执行文件不存在，尝试使用默认端口
			// 可能后端是通过其他方式启动的
			if (!app.isPackaged) {
				logger.warn(
					"Backend executable not found, but will try to connect to default port",
				);
				this.port = PORT_CONFIG.backend.default;
				// 等待后端就绪
				logger.console(
					`Waiting for backend server at ${this.getUrl()} to be ready...`,
				);
				try {
					await this.waitForReady(
						this.getUrl(),
						this.config.readyTimeout,
					);
					logger.console(
						`Backend server is ready at ${this.getUrl()}!`,
					);
					// 启动健康检查
					this.startHealthCheck();
					return;
				} catch (error) {
					const errorMsg = `Failed to connect to backend: ${error instanceof Error ? error.message : String(error)}`;
					logger.error(errorMsg);
					dialog.showErrorBox("Backend Connection Error", errorMsg);
					throw error;
				}
			}
			// 打包模式下必须找到可执行文件
			throw new Error("Backend executable not found");
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
			logger.error(exitMsg);
			this.process = null;

			if (code !== 0) {
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
