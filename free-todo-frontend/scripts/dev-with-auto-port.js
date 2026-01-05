#!/usr/bin/env node
/**
 * 开发服务器启动脚本（支持动态端口探测）
 *
 * 功能：
 * 1. 自动探测可用的前端端口（默认从 3001 开始，避免与 Build 版冲突）
 * 2. 自动探测 FreeTodo 后端端口（通过 /health 端点验证是否是 FreeTodo 后端）
 * 3. 设置正确的环境变量并启动 Next.js 开发服务器
 *
 * 使用方法：
 *   pnpm dev          - 自动探测端口启动
 *   pnpm dev:backend  - 同时启动后端和前端（需要后端可执行文件）
 */

const { spawn } = require("node:child_process");
const net = require("node:net");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// 默认端口配置（开发版使用不同的默认端口，避免与 Build 版冲突）
const DEFAULT_FRONTEND_PORT = 3001;
const DEFAULT_BACKEND_PORT = 8001;
const MAX_PORT_ATTEMPTS = 100;

/**
 * 检查端口是否可用（同时检查 IPv4 和 IPv6）
 * @param {number} port - 要检查的端口
 * @returns {Promise<boolean>} - 端口是否可用
 */
function isPortAvailable(port) {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.once("error", () => resolve(false));
		server.once("listening", () => {
			server.close();
			resolve(true);
		});
		// 使用 '::' 检查 IPv6（包含 IPv4），与 Next.js 默认行为一致
		// 如果系统不支持 IPv6，会自动回退到 IPv4
		server.listen(port, "::");
	});
}

/**
 * 查找可用端口
 * @param {number} startPort - 起始端口
 * @param {number} maxAttempts - 最大尝试次数
 * @returns {Promise<number>} - 可用的端口
 */
async function findAvailablePort(startPort, maxAttempts = MAX_PORT_ATTEMPTS) {
	for (let offset = 0; offset < maxAttempts; offset++) {
		const port = startPort + offset;
		if (await isPortAvailable(port)) {
			if (offset > 0) {
				console.log(`📌 端口 ${startPort} 已被占用，使用端口 ${port}`);
			}
			return port;
		}
	}
	throw new Error(
		`无法在 ${startPort}-${startPort + maxAttempts} 范围内找到可用端口`,
	);
}

/**
 * 检查指定端口是否运行着 FreeTodo 后端
 * 通过调用 /health 端点并验证 app 标识来确认是 FreeTodo 后端
 * @param {number} port - 后端端口
 * @returns {Promise<boolean>} - 是否是 FreeTodo 后端
 */
async function isFreeTodoBackend(port) {
	return new Promise((resolve) => {
		const req = http.get(
			{
				hostname: "127.0.0.1",
				port,
				path: "/health",
				timeout: 2000,
			},
			(res) => {
				let data = "";
				res.on("data", (chunk) => {
					data += chunk;
				});
				res.on("end", () => {
					try {
						const json = JSON.parse(data);
						// 验证是否是 FreeTodo/LifeTrace 后端
						// 只检查固定的应用标识字段
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
 * 清理 Next.js 开发服务器的锁文件
 * 解决 "Unable to acquire lock" 错误
 */
function cleanupNextLockFile() {
	const lockFilePath = path.join(__dirname, "..", ".next", "dev", "lock");
	try {
		if (fs.existsSync(lockFilePath)) {
			fs.unlinkSync(lockFilePath);
			console.log("🧹 已清理 Next.js 锁文件");
		}
	} catch (error) {
		// 忽略删除失败的错误（可能文件不存在或无权限）
		if (error.code !== "ENOENT") {
			console.log(`⚠️  清理锁文件失败: ${error.message}`);
		}
	}
}

/**
 * 查找运行中的 FreeTodo 后端端口
 * @returns {Promise<number|null>} - 运行中的 FreeTodo 后端端口，或 null
 */
async function findRunningBackendPort() {
	// 先检查开发版默认端口，然后是 Build 版默认端口
	const priorityPorts = [8001, 8000];
	for (const port of priorityPorts) {
		if (await isFreeTodoBackend(port)) {
			return port;
		}
	}
	// 再检查其他可能的端口（跳过已检查的）
	for (let port = 8002; port < 8100; port++) {
		if (await isFreeTodoBackend(port)) {
			return port;
		}
	}
	return null;
}

async function main() {
	console.log("🚀 启动开发服务器...\n");

	try {
		// 0. 清理可能残留的锁文件（解决 "Unable to acquire lock" 错误）
		cleanupNextLockFile();

		// 1. 查找可用的前端端口
		const frontendPort = await findAvailablePort(DEFAULT_FRONTEND_PORT);
		console.log(`✅ 前端端口: ${frontendPort}`);

		// 2. 查找运行中的 FreeTodo 后端端口（通过 /health 端点验证）
		console.log(`🔍 正在查找 FreeTodo 后端...`);
		let backendPort = await findRunningBackendPort();
		if (backendPort) {
			console.log(`✅ 检测到 FreeTodo 后端运行在端口: ${backendPort}`);
		} else {
			// 如果后端未运行，假设会使用开发版默认端口
			backendPort = DEFAULT_BACKEND_PORT;
			console.log(`⚠️  未检测到 FreeTodo 后端（通过 /health 端点验证）`);
			console.log(`   假设后端将运行在: ${backendPort}`);
			console.log(`   提示: 请先启动后端 - python -m lifetrace.server`);
		}

		const backendUrl = `http://localhost:${backendPort}`;
		console.log(`\n📡 后端 API: ${backendUrl}`);
		console.log(`🌐 前端地址: http://localhost:${frontendPort}\n`);

		// 3. 启动 Next.js 开发服务器
		const nextProcess = spawn(
			"pnpm",
			["next", "dev", "--port", String(frontendPort)],
			{
				stdio: "inherit",
				env: {
					...process.env,
					PORT: String(frontendPort),
					NEXT_PUBLIC_API_URL: backendUrl,
				},
				shell: true,
			},
		);

		// 清理函数：确保子进程完全关闭
		// 参考后端：等待子进程优雅退出，而不是立即强制终止
		let isCleaningUp = false;
		const cleanup = () => {
			if (isCleaningUp) {
				return; // 防止重复调用
			}
			isCleaningUp = true;
			console.log("\n🛑 正在关闭开发服务器...");

			if (nextProcess && !nextProcess.killed) {
				// 先尝试优雅关闭（发送 SIGTERM）
				nextProcess.kill("SIGTERM");

				// 等待子进程退出
				nextProcess.once("exit", (code, signal) => {
					console.log(
						`✅ 开发服务器已关闭 (code: ${code}, signal: ${signal || "none"})`,
					);
					process.exit(0);
				});

				// 设置超时，如果 5 秒内没有关闭，强制终止
				const forceKillTimeout = setTimeout(() => {
					if (nextProcess && !nextProcess.killed) {
						console.log("⚠️  子进程未响应，强制终止...");
						try {
							nextProcess.kill("SIGKILL");
						} catch (error) {
							console.error(`强制终止失败: ${error.message}`);
						}
						// 即使强制终止失败，也退出主进程
						setTimeout(() => process.exit(0), 500);
					} else {
						// 进程已经退出，但 exit 事件可能还没触发，直接退出
						process.exit(0);
					}
				}, 5000);

				// 如果子进程正常退出，清除超时
				nextProcess.once("exit", () => {
					clearTimeout(forceKillTimeout);
				});
			} else {
				// 没有子进程，直接退出
				process.exit(0);
			}
		};

		// 处理进程信号
		process.on("SIGINT", () => {
			cleanup();
		});

		process.on("SIGTERM", () => {
			cleanup();
		});

		// 如果子进程意外退出，也清理并退出
		nextProcess.on("exit", (code) => {
			if (!isCleaningUp) {
				// 只有在非清理状态下才退出（清理状态下由 cleanup 处理）
				process.exit(code || 0);
			}
		});
	} catch (error) {
		console.error(`❌ 启动失败: ${error.message}`);
		process.exit(1);
	}
}

main();
