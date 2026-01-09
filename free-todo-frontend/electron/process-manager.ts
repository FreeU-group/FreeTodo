/**
 * 进程管理基类
 * 抽象前端/后端服务器的共同逻辑
 */

import type { ChildProcess } from "node:child_process";
import http from "node:http";
import { TIMEOUT_CONFIG } from "./config";
import { logger } from "./logger";

/**
 * 服务器配置接口
 */
export interface ServerConfig {
	/** 服务器名称（用于日志） */
	name: string;
	/** 健康检查端点路径（如 "/" 或 "/health"） */
	healthEndpoint: string;
	/** 健康检查间隔（毫秒） */
	healthCheckInterval: number;
	/** 等待服务就绪的超时时间（毫秒） */
	readyTimeout: number;
	/** 健康检查接受的状态码范围 */
	acceptedStatusCodes?: { min: number; max: number };
}

/**
 * 进程管理器抽象基类
 * 提供子进程生命周期管理、健康检查等通用功能
 */
export abstract class ProcessManager {
	/** 子进程实例 */
	protected process: ChildProcess | null = null;
	/** 健康检查定时器 */
	protected healthCheckTimer: NodeJS.Timeout | null = null;
	/** 实际使用的端口 */
	protected port: number;
	/** 服务器配置 */
	protected readonly config: ServerConfig;
	/** 标准输出缓冲区 */
	protected stdoutBuffer = "";
	/** 标准错误输出缓冲区 */
	protected stderrBuffer = "";
	/** 标记是否正在主动停止（用于区分正常关闭和意外退出） */
	protected isStopping = false;

	constructor(config: ServerConfig, defaultPort: number) {
		this.config = config;
		this.port = defaultPort;
	}

	/**
	 * 启动服务器（由子类实现）
	 */
	abstract start(): Promise<void>;

	/**
	 * 获取服务器 URL
	 */
	getUrl(): string {
		return `http://localhost:${this.port}`;
	}

	/**
	 * 获取当前端口
	 */
	getPort(): number {
		return this.port;
	}

	/**
	 * 检查进程是否正在运行
	 */
	isRunning(): boolean {
		return this.process !== null && !this.process.killed;
	}

	/**
	 * 停止服务器
	 */
	stop(): void {
		this.isStopping = true;
		this.stopHealthCheck();
		if (this.process) {
			logger.info(`Stopping ${this.config.name}...`);
			this.process.kill("SIGTERM");
			this.process = null;
		}
	}

	/**
	 * 检查是否正在主动停止
	 */
	isIntentionallyStopping(): boolean {
		return this.isStopping;
	}

	/**
	 * 等待服务器就绪
	 * @param url 服务器 URL
	 * @param timeout 超时时间（毫秒）
	 */
	protected waitForReady(url: string, timeout: number): Promise<void> {
		return new Promise((resolve, reject) => {
			const startTime = Date.now();
			const { acceptedStatusCodes } = this.config;
			const minStatus = acceptedStatusCodes?.min ?? 200;
			const maxStatus = acceptedStatusCodes?.max ?? 400;

			const check = () => {
				const checkUrl = this.config.healthEndpoint
					? `${url}${this.config.healthEndpoint}`
					: url;

				http
					.get(checkUrl, (res) => {
						const statusCode = res.statusCode ?? 0;
						if (statusCode >= minStatus && statusCode < maxStatus) {
							logger.info(
								`${this.config.name} health check passed: ${statusCode}`,
							);
							resolve();
						} else {
							retry();
						}
					})
					.on("error", (err) => {
						const elapsed = Date.now() - startTime;
						// 每 10 秒记录一次
						if (elapsed % 10000 < TIMEOUT_CONFIG.healthCheckRetry) {
							logger.info(
								`${this.config.name} health check failed (${elapsed}ms elapsed): ${err.message}`,
							);
						}
						retry();
					})
					.setTimeout(TIMEOUT_CONFIG.healthCheck, () => {
						retry();
					});
			};

			const retry = () => {
				if (Date.now() - startTime >= timeout) {
					reject(
						new Error(
							`${this.config.name} did not start within ${timeout}ms`,
						),
					);
				} else {
					setTimeout(check, TIMEOUT_CONFIG.healthCheckRetry);
				}
			};

			check();
		});
	}

	/**
	 * 启动定期健康检查
	 */
	protected startHealthCheck(): void {
		if (this.healthCheckTimer) {
			clearInterval(this.healthCheckTimer);
		}

		const url = this.getUrl();
		const { acceptedStatusCodes } = this.config;
		const minStatus = acceptedStatusCodes?.min ?? 200;
		const maxStatus = acceptedStatusCodes?.max ?? 400;

		this.healthCheckTimer = setInterval(() => {
			if (!this.isRunning()) {
				logger.warn(`${this.config.name} process is not running`);
				return;
			}

			const checkUrl = this.config.healthEndpoint
				? `${url}${this.config.healthEndpoint}`
				: url;

			http
				.get(checkUrl, (res) => {
					const statusCode = res.statusCode ?? 0;
					if (statusCode < minStatus || statusCode >= maxStatus) {
						logger.warn(
							`${this.config.name} returned status ${statusCode}`,
						);
					}
				})
				.on("error", (error) => {
					logger.warn(
						`${this.config.name} health check failed: ${error.message}`,
					);
					if (this.isRunning()) {
						logger.warn(
							`${this.config.name} process exists but not responding`,
						);
					}
				})
				.setTimeout(TIMEOUT_CONFIG.healthCheck, () => {
					logger.warn(`${this.config.name} health check timeout`);
				});
		}, this.config.healthCheckInterval);
	}

	/**
	 * 停止健康检查
	 */
	protected stopHealthCheck(): void {
		if (this.healthCheckTimer) {
			clearInterval(this.healthCheckTimer);
			this.healthCheckTimer = null;
		}
	}

	/**
	 * 设置子进程的输出监听器
	 * @param proc 子进程实例
	 */
	protected setupProcessOutputListeners(proc: ChildProcess): void {
		if (proc.stdout) {
			proc.stdout.setEncoding("utf8");
			proc.stdout.on("data", (data) => {
				const output = String(data);
				this.stdoutBuffer += output;
				logger.stdout(this.config.name, output);
			});
			proc.stdout.on("end", () => {
				logger.info(`${this.config.name} stdout stream ended`);
			});
			proc.stdout.on("error", (err) => {
				logger.error(`${this.config.name} stdout stream error: ${err.message}`);
			});
		}

		if (proc.stderr) {
			proc.stderr.setEncoding("utf8");
			proc.stderr.on("data", (data) => {
				const output = String(data);
				this.stderrBuffer += output;
				logger.stderr(this.config.name, output);
			});
			proc.stderr.on("end", () => {
				logger.info(`${this.config.name} stderr stream ended`);
			});
			proc.stderr.on("error", (err) => {
				logger.error(`${this.config.name} stderr stream error: ${err.message}`);
			});
		}
	}

	/**
	 * 获取输出缓冲区内容（用于错误报告）
	 */
	getOutputBuffers(): { stdout: string; stderr: string } {
		return {
			stdout: this.stdoutBuffer,
			stderr: this.stderrBuffer,
		};
	}

	/**
	 * 清空输出缓冲区
	 */
	clearOutputBuffers(): void {
		this.stdoutBuffer = "";
		this.stderrBuffer = "";
	}
}
