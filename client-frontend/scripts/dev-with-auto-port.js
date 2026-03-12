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

const { execSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

// 默认端口配置（开发版使用不同的默认端口，避免与 Build 版冲突）
const DEFAULT_FRONTEND_PORT = 3001;
const _DEFAULT_BACKEND_PORT = 8001;
const MAX_PORT_ATTEMPTS = 100;
const BACKEND_DETECT_INTERVAL_MS = Number.parseInt(
	process.env.FREETODO_BACKEND_DETECT_INTERVAL_MS || "2000",
	10,
);
const BACKEND_DETECT_LOG_EVERY_MS = Number.parseInt(
	process.env.FREETODO_BACKEND_DETECT_LOG_EVERY_MS || "5000",
	10,
);
const BACKEND_DETECT_TIMEOUT_MS = Number.parseInt(
	process.env.FREETODO_BACKEND_DETECT_TIMEOUT_MS || "0",
	10,
);

function normalizePath(value) {
	const resolved = path.resolve(value);
	return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isSymlinkedNodeModules() {
	const nodeModulesPath = path.join(process.cwd(), "node_modules");
	try {
		if (!fs.existsSync(nodeModulesPath)) {
			return false;
		}
		const stat = fs.lstatSync(nodeModulesPath);
		if (stat.isSymbolicLink()) {
			return true;
		}
		const realPath = fs.realpathSync(nodeModulesPath);
		return normalizePath(realPath) !== normalizePath(nodeModulesPath);
	} catch {
		return false;
	}
}

function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

function stopProcess(proc, timeoutMs = 5000) {
	return new Promise((resolve) => {
		if (!proc || proc.killed) {
			resolve();
			return;
		}
		let resolved = false;
		const done = () => {
			if (resolved) return;
			resolved = true;
			resolve();
		};

		proc.once("exit", done);

		if (process.platform === "win32") {
			// Windows: SIGINT/SIGTERM 无法可靠杀死 shell: true 的子进程树
			// 使用 taskkill /F /T 强制杀死整个进程树
			try {
				execSync(`taskkill /F /T /PID ${proc.pid}`, {
					stdio: "ignore",
				});
			} catch {
				// taskkill 失败时回退到默认方式
				try {
					proc.kill();
				} catch {
					/* ignore */
				}
			}
		} else {
			try {
				proc.kill("SIGINT");
			} catch {
				proc.kill();
			}

			setTimeout(() => {
				if (!proc.killed) {
					try {
						proc.kill("SIGTERM");
					} catch {
						proc.kill();
					}
				}
			}, 1200);
		}

		setTimeout(done, timeoutMs);
	});
}

/**
 * 获取当前 Git Commit
 * @returns {string|null} - 完整 Commit Hash，获取失败则返回 null
 */
function getGitCommit() {
	const envCommit = process.env.FREETODO_GIT_COMMIT || process.env.GIT_COMMIT;
	if (envCommit) {
		return envCommit;
	}
	try {
		return execSync("git rev-parse HEAD", {
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
	} catch {
		return null;
	}
}

const FRONTEND_GIT_COMMIT = getGitCommit();

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
				console.log(`Port ${startPort} is in use, using port ${port}`);
			}
			return port;
		}
	}
	throw new Error(
		`Cannot find available port in range ${startPort}-${startPort + maxAttempts}`,
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
						if (json.app !== "lifetrace") {
							resolve(false);
							return;
						}

						const backendCommit =
							typeof json.git_commit === "string" ? json.git_commit : null;
						if (FRONTEND_GIT_COMMIT) {
							if (!backendCommit || backendCommit === "unknown") {
								resolve(false);
								return;
							}
							if (backendCommit !== FRONTEND_GIT_COMMIT) {
								console.log(
									`Skip backend at ${port}: git commit mismatch (${backendCommit})`,
								);
								resolve(false);
								return;
							}
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

async function waitForBackendPort() {
	const startTime = Date.now();
	let lastLogTime = 0;
	const hint = "Start backend first - python -m lifetrace.server";
	const suffix = FRONTEND_GIT_COMMIT ? ` (git commit: ${FRONTEND_GIT_COMMIT})` : "";

	for (;;) {
		const backendPort = await findRunningBackendPort();
		if (backendPort) {
			return backendPort;
		}

		const now = Date.now();
		if (!lastLogTime || now - lastLogTime >= BACKEND_DETECT_LOG_EVERY_MS) {
			console.log(`FreeTodo backend not ready${suffix}. ${hint}`);
			lastLogTime = now;
		}

		if (BACKEND_DETECT_TIMEOUT_MS > 0 && now - startTime >= BACKEND_DETECT_TIMEOUT_MS) {
			throw new Error(
				`FreeTodo backend not detected within ${BACKEND_DETECT_TIMEOUT_MS}ms${suffix}. ${hint}`,
			);
		}

		await sleep(BACKEND_DETECT_INTERVAL_MS);
	}
}

function startNextDev(frontendPort, backendUrl, disableTurbopack, onExit) {
	const nextEnv = {
		...process.env,
		PORT: String(frontendPort),
		NEXT_PUBLIC_API_URL: backendUrl,
	};

	if (disableTurbopack && !("NEXT_DISABLE_TURBOPACK" in nextEnv)) {
		nextEnv.NEXT_DISABLE_TURBOPACK = "1";
	}

	const nextArgs = ["next", "dev", "--port", String(frontendPort)];
	if (disableTurbopack) {
		nextArgs.push("--webpack");
	}

	const nextProcess = spawn("pnpm", nextArgs, {
		stdio: "inherit",
		env: {
			...nextEnv,
		},
		shell: true,
	});

	nextProcess.on("exit", (code) => onExit(nextProcess, code));
	return nextProcess;
}

async function main() {
	console.log("Starting development server...\n");

	try {
		// 1. Find available frontend port
		// If PORT env var is set, use it (Electron main process may have allocated a port)
		let frontendPort;
		if (process.env.PORT) {
			frontendPort = Number.parseInt(process.env.PORT, 10);
			console.log(`Using frontend port from env: ${frontendPort}`);
		} else {
			frontendPort = await findAvailablePort(DEFAULT_FRONTEND_PORT);
			console.log(`Frontend port: ${frontendPort}`);
		}

		const disableTurbopack = isSymlinkedNodeModules();
		if (disableTurbopack && !process.env.NEXT_DISABLE_TURBOPACK) {
			console.log(
				"Detected symlinked node_modules, disabling Turbopack for compatibility.",
			);
		}

		const initialBackendUrl =
			process.env.NEXT_PUBLIC_API_URL ||
			`http://127.0.0.1:${_DEFAULT_BACKEND_PORT}`;

		let popupProcess = null;
		const killPopup = () => {
			if (popupProcess && !popupProcess.killed) {
				popupProcess.kill();
			}
		};

		/**
		 * 启动（或重启）系统级通知弹窗 Electron 进程
		 * @param {number} backendPort 后端端口号
		 */
		const startPopup = (backendPort) => {
			killPopup();
			try {
				const electronBinary = require("electron");
				const popupScript = path.join(__dirname, "notification-popup.js");
				popupProcess = spawn(String(electronBinary), [popupScript], {
					stdio: "ignore",
					env: {
						...process.env,
						ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
						LIFETRACE_BACKEND_PORT: String(backendPort),
					},
				});
				popupProcess.on("error", (err) => {
					console.warn(
						`[notification-popup] Failed to start: ${err.message}`,
					);
				});
				console.log(
					`[notification-popup] System-level popup started (backend port: ${backendPort})`,
				);
			} catch (err) {
				console.warn(
					`[notification-popup] Could not start (electron not available): ${err.message}`,
				);
			}
		};

		const handleNextExit = (proc, code) => {
			if (proc !== nextProcess) return;
			killPopup();
			process.exit(code || 0);
		};

		let nextProcess = startNextDev(
			frontendPort,
			initialBackendUrl,
			disableTurbopack,
			handleNextExit,
		);

		console.log(`Frontend URL: http://localhost:${frontendPort}`);
		console.log(`Frontend API (initial): ${initialBackendUrl}\n`);

		// 2. 先用初始端口启动系统级通知弹窗（后续发现正确端口后会重启）
		startPopup(_DEFAULT_BACKEND_PORT);

		// 处理进程信号
		process.on("SIGINT", () => {
			killPopup();
			stopProcess(nextProcess).finally(() => process.exit(0));
		});

		process.on("SIGTERM", () => {
			killPopup();
			stopProcess(nextProcess).finally(() => process.exit(0));
		});

		// 3. Find running FreeTodo backend port (verify via /health endpoint)
		console.log(`Searching for FreeTodo backend...`);
		if (FRONTEND_GIT_COMMIT) {
			console.log(`Frontend git commit: ${FRONTEND_GIT_COMMIT}`);
		}
		const backendPort = await waitForBackendPort();
		console.log(`Detected FreeTodo backend running on port: ${backendPort}`);

		const backendUrl = `http://127.0.0.1:${backendPort}`;
		console.log(`Backend API: ${backendUrl}`);

		if (backendUrl !== initialBackendUrl) {
			console.log(
				"Restarting frontend dev server to update backend API URL...",
			);

			// 同时重启通知弹窗进程，使用正确的后端端口
			console.log(
				`[notification-popup] Restarting with correct backend port: ${backendPort}`,
			);
			startPopup(backendPort);

			if (nextProcess) {
				nextProcess.removeAllListeners("exit");
				await stopProcess(nextProcess);
			}

			// 等待端口真正释放后再重启，避免 EADDRINUSE
			const portWaitStart = Date.now();
			const portWaitTimeoutMs = 30000;
			let portFreed = false;
			for (let attempt = 0; attempt < 60; attempt++) {
				if (await isPortAvailable(frontendPort)) {
					portFreed = true;
					break;
				}
				if (Date.now() - portWaitStart > portWaitTimeoutMs) {
					break;
				}
				await sleep(500);
			}
			if (!portFreed) {
				console.error(
					`Port ${frontendPort} is still in use after ${Math.round((Date.now() - portWaitStart) / 1000)}s. ` +
						"Please manually kill the process occupying the port and try again.",
				);
				process.exit(1);
			}

			nextProcess = startNextDev(
				frontendPort,
				backendUrl,
				disableTurbopack,
				handleNextExit,
			);
		}
	} catch (error) {
		console.error(`Failed to start: ${error.message}`);
		process.exit(1);
	}
}

main();
