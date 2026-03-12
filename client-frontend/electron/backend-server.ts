/**
 * 后端服务器管理
 * 继承 ProcessManager 实现后端服务器的启动和管理
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { app, dialog } from "electron";
import { isCancelled } from "./bootstrap-control";
import { emitLog, emitStatus } from "./bootstrap-status";
import {
	getBackendRuntime,
	getServerMode,
	HEALTH_CHECK_INTERVAL,
	PORT_CONFIG,
	PROCESS_CONFIG,
	type ServerMode,
	TIMEOUT_CONFIG,
} from "./config";
import { getGitCommit } from "./git-info";
import { logger } from "./logger";
import { portManager } from "./port-manager";
import { ProcessManager } from "./process-manager";
import { ensurePythonRuntime } from "./python-runtime";
import { resolveRuntimeRoot } from "./runtime-paths";

/**
 * 后端服务器管理类
 * 负责启动、监控和停止 Python 后端服务器
 */
export class BackendServer extends ProcessManager {
	/** 后端源码根目录（包含 lifetrace/ 和 requirements 文件） */
	private backendSourceDir: string | null = null;
	/** 后端入口脚本路径 */
	private backendEntryScript: string | null = null;
	/** 后端依赖 requirements 路径 */
	private backendRequirementsPath: string | null = null;
	/** 后端虚拟环境目录 */
	private venvDir: string | null = null;
	/** 虚拟环境 Python 路径 */
	private venvPythonPath: string | null = null;
	/** 数据目录路径 */
	private dataDir: string | null = null;
	/** 服务器模式（dev 或 build） */
	private serverMode: ServerMode;
	/** 后端运行时（script 或 pyinstaller） */
	private backendRuntime: ReturnType<typeof getBackendRuntime>;
	/** 当前前端 Git Commit（用于匹配后端实例） */
	private gitCommit: string | null;

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
		this.backendRuntime = getBackendRuntime();
		const commit = getGitCommit();
		this.gitCommit = commit && commit !== "unknown" ? commit : null;
	}

	/**
	 * 获取当前服务器模式
	 */
	getServerMode(): ServerMode {
		return this.serverMode;
	}

	/**
	 * 解析后端源码与运行时路径
	 * 根据打包状态和平台确定正确的路径
	 */
	private resolveBackendPaths(): void {
		if (app.isPackaged) {
			this.backendSourceDir = path.join(process.resourcesPath, "backend");
		} else {
			const projectRoot = path.resolve(__dirname, "../..");
			this.backendSourceDir =
				this.backendRuntime === "pyinstaller"
					? path.join(projectRoot, "dist-backend")
					: projectRoot;
		}

		if (this.backendSourceDir) {
			if (this.backendRuntime === "pyinstaller") {
				this.backendEntryScript = path.join(
					this.backendSourceDir,
					PROCESS_CONFIG.backendExecutable,
				);
				this.backendRequirementsPath = null;
			} else {
				this.backendEntryScript = path.join(
					this.backendSourceDir,
					PROCESS_CONFIG.backendEntryScript,
				);
				this.backendRequirementsPath = path.join(
					this.backendSourceDir,
					PROCESS_CONFIG.backendRequirementsFile,
				);
			}
		}

		// 数据目录
		const userDataDir = app.getPath("userData");
		this.dataDir = path.join(userDataDir, PROCESS_CONFIG.backendDataDir);
		const runtimeRoot = resolveRuntimeRoot();
		this.venvDir = path.join(runtimeRoot, PROCESS_CONFIG.backendVenvDir);
		emitStatus({ venvPath: this.venvDir });
	}

	/**
	 * 检查后端脚本与依赖文件是否存在
	 */
	private checkBackendExists(): boolean {
		const entryMissing =
			!this.backendEntryScript || !fs.existsSync(this.backendEntryScript);
		const requirementsMissing =
			this.backendRuntime === "script" &&
			(!this.backendRequirementsPath ||
				!fs.existsSync(this.backendRequirementsPath));

		if (entryMissing || requirementsMissing) {
			const errorMsg =
				`The backend source files were not found.\n\n` +
				`Runtime: ${this.backendRuntime}\n` +
				`Entry: ${this.backendEntryScript ?? "unknown"}\n` +
				`Requirements: ${this.backendRequirementsPath ?? "n/a"}\n\n` +
				"Please reinstall or rebuild the application.";
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
							if (json.app !== "lifetrace") {
								resolve(false);
								return;
							}
							const backendCommit =
								typeof json.git_commit === "string"
									? json.git_commit
									: null;
							if (this.gitCommit && backendCommit !== this.gitCommit) {
								resolve(false);
								return;
							}
							resolve(true);
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
	 * 等待后端服务器就绪并完成必要校验
	 * @param timeout 超时时间（毫秒）
	 */
	async waitForReadyAndVerify(timeout: number): Promise<void> {
		const backendUrl = this.getUrl();
		await this.waitForReady(backendUrl, timeout);
		emitStatus({ message: "后端服务已就绪", progress: 78 });
		await this.verifyBackendMode();
		this.startHealthCheck();
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
	async start(options?: { waitForReady?: boolean }): Promise<void> {
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

		// 检查后端脚本与依赖文件
		if (!this.checkBackendExists()) {
			// 在开发模式下，如果文件不存在，尝试使用默认端口
			// 可能后端是通过其他方式启动的
			if (!app.isPackaged) {
				logger.warn(
					"Backend source not found, but will try to connect to default port",
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
			// 打包模式下必须找到运行时文件
			throw new Error("Backend runtime files not found");
		}

		// 确保路径已解析（用于类型收窄）
		if (!this.backendEntryScript || !this.backendSourceDir || !this.dataDir) {
			throw new Error("Backend paths not resolved");
		}

		if (this.backendRuntime === "script") {
			// 确保 Python 运行时与依赖已安装
			if (!this.backendRequirementsPath || !this.venvDir) {
				throw new Error("Backend requirements not resolved");
			}
			try {
				emitStatus({ message: "准备后端运行时", progress: 30 });
				this.venvPythonPath = await ensurePythonRuntime(
					this.venvDir,
					this.backendRequirementsPath,
				);
			} catch (error) {
				const errorMsg = `Failed to prepare Python runtime: ${error instanceof Error ? error.message : String(error)}`;
				logger.error(errorMsg);
				if (!isCancelled()) {
					dialog.showErrorBox(
						"Python Runtime Error",
						`${errorMsg}\n\nCheck logs at: ${logger.getLogFilePath()}`,
					);
				}
				throw error;
			}
			if (!this.venvPythonPath) {
				throw new Error("Python runtime not available");
			}
		}
		emitStatus({ message: "启动后端服务", progress: 75 });

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

		logger.info("Starting backend server...");
		emitLog(`Backend entry: ${this.backendEntryScript}`);
		emitLog(`Backend venv: ${this.venvDir}`);
		logger.info(`Backend entry: ${this.backendEntryScript}`);
		logger.info(`Backend source dir: ${this.backendSourceDir}`);
		logger.info(`Backend runtime: ${this.backendRuntime}`);
		logger.info(`Backend requirements: ${this.backendRequirementsPath ?? "n/a"}`);
		logger.info(`Backend venv: ${this.venvDir}`);
		logger.info(`Data directory: ${this.dataDir}`);
		logger.info(`Backend port: ${this.port}`);

		// 启动后端进程，传递模式参数
		const backendArgs = [
			"--port",
			String(this.port),
			"--data-dir",
			this.dataDir,
			"--mode",
			this.serverMode,
		];
		const spawnCommand =
			this.backendRuntime === "pyinstaller"
				? this.backendEntryScript
				: this.venvPythonPath;
		const spawnArgs =
			this.backendRuntime === "pyinstaller"
				? backendArgs
				: [this.backendEntryScript, ...backendArgs];

		if (!spawnCommand) {
			throw new Error("Backend executable not resolved");
		}
		if (this.backendRuntime === "script" && !this.backendEntryScript) {
			throw new Error("Backend entry script not resolved");
		}

		this.process = spawn(spawnCommand, spawnArgs, {
			cwd: this.backendSourceDir,
			env: {
				...process.env,
				PYTHONUNBUFFERED: "1",
				PYTHONUTF8: "1",
				...(this.gitCommit && {
					LIFETRACE_GIT_COMMIT: this.gitCommit,
				}),
				...(this.serverMode === "build" && {
					LIFETRACE__OBSERVABILITY__ENABLED: "false",
					LIFETRACE__SERVER__DEBUG: "false",
				}),
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

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
					`The backend server exited unexpectedly.\n\n${exitMsg}\n\nCheck logs at: ${logger.getLogFilePath()}\n\nBackend entry: ${this.backendEntryScript}\nData directory: ${this.dataDir}`,
				);
			}
		});

		if (options?.waitForReady !== false) {
			// 等待后端就绪
			logger.console(`Waiting for backend server at ${this.getUrl()} to be ready...`);
			await this.waitForReady(this.getUrl(), this.config.readyTimeout);
			logger.console(`Backend server is ready at ${this.getUrl()}!`);
			emitStatus({ message: "后端服务已就绪", progress: 78 });

			// 验证后端模式是否匹配
			await this.verifyBackendMode();

			// 启动健康检查
			this.startHealthCheck();
		} else {
			logger.info("Backend server started (waiting for readiness in background)");
		}
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
				git_commit?: string;
			};

			// 检查应用标识
			if (data.app !== "lifetrace") {
				const errorMsg = `Backend at ${this.getUrl()} is not a FreeTodo server (app: ${data.app})`;
				logger.error(errorMsg);
				throw new Error(errorMsg);
			}

			// 检查服务器模式
			const backendMode = data.server_mode;
			if (backendMode && backendMode !== this.serverMode) {
				const errorMsg = `Backend mode mismatch: expected "${this.serverMode}", got "${backendMode}". This may indicate another version of FreeTodo is running.`;
				logger.error(errorMsg);
				dialog.showErrorBox(
					"Backend Mode Mismatch",
					`The backend server is running in "${backendMode}" mode, but this application is running in "${this.serverMode}" mode.\n\nThis usually happens when both DEV and Build versions are running simultaneously.\n\nPlease close the other version and restart this application.`,
				);
				throw new Error(errorMsg);
			}

			// 检查 Git Commit
			if (this.gitCommit && data.git_commit && data.git_commit !== this.gitCommit) {
				const errorMsg = `Backend commit mismatch: expected "${this.gitCommit}", got "${data.git_commit}".`;
				logger.error(errorMsg);
				dialog.showErrorBox(
					"Backend Commit Mismatch",
					`The backend server is running with a different git commit.\n\nExpected: ${this.gitCommit}\nDetected: ${data.git_commit}\n\nPlease close the other version and restart this application.`,
				);
				throw new Error(errorMsg);
			}

			logger.info(`Backend mode verified: ${backendMode || "unknown"}`);
		} catch (error) {
			if (
				error instanceof Error &&
				(error.message.includes("mode mismatch") ||
					error.message.includes("commit mismatch"))
			) {
				throw error;
			}
			// 其他错误（网络问题等）只记录警告，不阻止启动
			logger.warn(`Cannot verify backend mode: ${error instanceof Error ? error.message : String(error)}`);
		}
	}
}
