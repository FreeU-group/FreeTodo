/**
 * 健康检查模块
 * 提供服务器健康检查和等待功能
 */

import http from "node:http";
import { getBackendUrl, getServerUrl } from "../core/config";
import { logToFile } from "../core/logger";

let healthCheckInterval: NodeJS.Timeout | null = null;
let backendHealthCheckInterval: NodeJS.Timeout | null = null;

// 进程引用（由外部模块设置）
let nextProcessRef: { killed: boolean } | null = null;
let backendProcessRef: { killed: boolean } | null = null;

/**
 * 设置 Next.js 进程引用（用于健康检查）
 */
export function setNextProcessRef(proc: { killed: boolean } | null): void {
	nextProcessRef = proc;
}

/**
 * 设置后端进程引用（用于健康检查）
 */
export function setBackendProcessRef(proc: { killed: boolean } | null): void {
	backendProcessRef = proc;
}

/**
 * 等待服务器启动就绪
 */
export function waitForServer(url: string, timeout: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const startTime = Date.now();

		const check = () => {
			http
				.get(url, (res) => {
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

/**
 * 等待后端服务器启动就绪
 */
export function waitForBackend(url: string, timeout: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const startTime = Date.now();

		const check = () => {
			http
				.get(`${url}/health`, (res) => {
					// 接受 2xx 或 3xx 状态码作为成功
					if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
						logToFile(`Backend health check passed: ${res.statusCode}`);
						resolve();
					} else {
						retry();
					}
				})
				.on("error", (err) => {
					const elapsed = Date.now() - startTime;
					if (elapsed % 10000 < 500) {
						// 每 10 秒记录一次
						logToFile(
							`Backend health check failed (${elapsed}ms elapsed): ${err.message}`,
						);
					}
					retry();
				})
				.setTimeout(5000, () => {
					retry();
				});
		};

		const retry = () => {
			if (Date.now() - startTime >= timeout) {
				reject(new Error(`Backend did not start within ${timeout}ms`));
			} else {
				setTimeout(check, 500);
			}
		};

		check();
	});
}

/**
 * 检查服务器健康状态（使用动态 URL）
 */
export function startHealthCheck(): void {
	if (healthCheckInterval) {
		clearInterval(healthCheckInterval);
	}

	const serverUrl = getServerUrl();

	healthCheckInterval = setInterval(() => {
		if (!nextProcessRef || nextProcessRef.killed) {
			logToFile("WARNING: Next.js process is not running");
			return;
		}

		// 检查服务器是否响应
		http
			.get(serverUrl, (res) => {
				if (res.statusCode !== 200 && res.statusCode !== 304) {
					logToFile(`WARNING: Server returned status ${res.statusCode}`);
				}
			})
			.on("error", (error) => {
				logToFile(`WARNING: Health check failed: ${error.message}`);
				// 如果服务器进程还在运行但无法连接，可能是服务器崩溃了
				if (nextProcessRef && !nextProcessRef.killed) {
					logToFile("Server process exists but not responding");
				}
			})
			.setTimeout(5000, () => {
				logToFile("WARNING: Health check timeout");
			});
	}, 10000); // 每10秒检查一次
}

/**
 * 停止健康检查
 */
export function stopHealthCheck(): void {
	if (healthCheckInterval) {
		clearInterval(healthCheckInterval);
		healthCheckInterval = null;
	}
}

/**
 * 启动后端健康检查（使用动态 URL）
 */
export function startBackendHealthCheck(): void {
	if (backendHealthCheckInterval) {
		clearInterval(backendHealthCheckInterval);
	}

	const backendUrl = getBackendUrl();

	backendHealthCheckInterval = setInterval(() => {
		if (!backendProcessRef || backendProcessRef.killed) {
			logToFile("WARNING: Backend process is not running");
			return;
		}

		http
			.get(`${backendUrl}/health`, (res) => {
				if (res.statusCode && res.statusCode >= 200 && res.statusCode < 400) {
					// 健康检查成功，不记录日志（避免日志过多）
				} else {
					logToFile(`WARNING: Backend returned status ${res.statusCode}`);
				}
			})
			.on("error", (error) => {
				logToFile(`WARNING: Backend health check failed: ${error.message}`);
			})
			.setTimeout(5000, () => {
				logToFile("WARNING: Backend health check timeout");
			});
	}, 30000); // 每 30 秒检查一次
}

/**
 * 停止后端健康检查
 */
export function stopBackendHealthCheck(): void {
	if (backendHealthCheckInterval) {
		clearInterval(backendHealthCheckInterval);
		backendHealthCheckInterval = null;
	}
}
