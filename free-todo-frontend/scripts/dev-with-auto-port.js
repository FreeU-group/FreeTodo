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

		// 处理进程信号
		process.on("SIGINT", () => {
			nextProcess.kill("SIGINT");
			process.exit(0);
		});

		process.on("SIGTERM", () => {
			nextProcess.kill("SIGTERM");
			process.exit(0);
		});

		nextProcess.on("exit", (code) => {
			process.exit(code || 0);
		});
	} catch (error) {
		console.error(`❌ 启动失败: ${error.message}`);
		process.exit(1);
	}
}

main();
