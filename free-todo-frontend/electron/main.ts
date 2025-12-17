import { type ChildProcess, fork } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { app, BrowserWindow, dialog } from "electron";

// 强制生产模式：如果应用已打包，必须使用生产模式
// 即使 NODE_ENV 被设置为 development，打包的应用也应该运行生产服务器
const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";
let nextProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;

const PORT = process.env.PORT || "3000";
const SERVER_URL = `http://localhost:${PORT}`;

// 日志文件路径
const logFile = path.join(app.getPath("logs"), "freetodo.log");

/**
 * 安全地写入日志文件
 */
function logToFile(message: string): void {
	try {
		const logDir = path.dirname(logFile);
		if (!fs.existsSync(logDir)) {
			fs.mkdirSync(logDir, { recursive: true });
		}
		const timestamp = new Date().toISOString();
		fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
	} catch (_error) {
		// 如果无法写入日志文件，忽略错误
	}
}

// 确保只有一个应用实例运行
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	// 如果已经有实例在运行，退出当前实例
	app.quit();
} else {
	// 当另一个实例尝试启动时，聚焦到当前窗口
	app.on("second-instance", () => {
		if (mainWindow) {
			if (mainWindow.isMinimized()) mainWindow.restore();
			mainWindow.focus();
		} else {
			// 如果窗口不存在，创建新窗口
			createWindow();
		}
	});
}

/**
 * 等待服务器启动就绪
 */
function waitForServer(url: string, timeout: number): Promise<void> {
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
 * 启动 Next.js 服务器
 * 在打包的应用中，总是启动内置的生产服务器
 */
async function startNextServer(): Promise<void> {
	// 如果应用已打包，必须启动内置服务器，不允许依赖外部 dev 服务器
	if (app.isPackaged) {
		logToFile("App is packaged - starting built-in production server");
	} else if (isDev) {
		const msg = `Development mode: expecting Next.js dev server at ${SERVER_URL}`;
		console.log(msg);
		logToFile(msg);
		return;
	} else {
		logToFile(
			"Running in production mode (not packaged) - starting built-in server",
		);
	}

	const serverPath = path.join(
		process.resourcesPath,
		"standalone",
		"server.js",
	);

	const msg = `Starting Next.js server from: ${serverPath}`;
	console.log(msg);
	logToFile(msg);

	// 检查服务器文件是否存在
	if (!fs.existsSync(serverPath)) {
		const errorMsg = `Server file not found: ${serverPath}`;
		logToFile(`ERROR: ${errorMsg}`);
		dialog.showErrorBox(
			"Server Not Found",
			`The Next.js server file was not found at:\n${serverPath}\n\nPlease rebuild the application.`,
		);
		throw new Error(errorMsg);
	}

	// 设置工作目录为 standalone 目录，这样相对路径可以正确解析
	const serverDir = path.dirname(serverPath);

	logToFile(`Server directory: ${serverDir}`);
	logToFile(`Server path: ${serverPath}`);
	logToFile(`PORT: ${PORT}, HOSTNAME: localhost`);

	// 检查关键文件是否存在
	const nextServerDir = path.join(serverDir, ".next", "server");
	if (!fs.existsSync(nextServerDir)) {
		const errorMsg = `Required directory not found: ${nextServerDir}`;
		logToFile(`ERROR: ${errorMsg}`);
		throw new Error(errorMsg);
	}
	logToFile(`Verified .next/server directory exists`);

	// 强制设置生产环境变量，确保服务器以生产模式运行
	// 创建新的环境对象，避免直接修改 process.env
	const serverEnv: Record<string, string | undefined> = {};

	// 复制所有环境变量，但排除 dev 相关变量
	for (const key in process.env) {
		if (!key.startsWith("NEXT_DEV") && !key.startsWith("TURBOPACK")) {
			serverEnv[key] = process.env[key];
		}
	}

	// 强制设置生产模式环境变量
	serverEnv.PORT = PORT;
	serverEnv.HOSTNAME = "localhost";
	serverEnv.NODE_ENV = "production"; // 强制生产模式

	// 使用 fork 启动 Node.js 服务器进程
	// fork 是 spawn 的特殊情况，专门用于 Node.js 脚本，提供更好的 IPC 支持
	// 注意：fork 会自动设置 execPath，所以我们只需要传递脚本路径
	nextProcess = fork(serverPath, [], {
		cwd: serverDir, // 设置工作目录
		env: serverEnv as NodeJS.ProcessEnv,
		stdio: ["ignore", "pipe", "pipe", "ipc"], // stdin: ignore, stdout/stderr: pipe, ipc channel
		silent: false, // 不静默，允许输出
	});

	logToFile(`Spawned process with PID: ${nextProcess.pid}`);

	// 确保进程引用被保持
	if (!nextProcess.pid) {
		const errorMsg = "Failed to spawn process - no PID assigned";
		logToFile(`ERROR: ${errorMsg}`);
		throw new Error(errorMsg);
	}

	// 监听进程的 spawn 事件
	nextProcess.on("spawn", () => {
		logToFile(`Process spawned successfully with PID: ${nextProcess?.pid}`);
	});

	// 收集所有输出用于日志
	let stdoutBuffer = "";
	let stderrBuffer = "";

	// 立即设置数据监听器，避免丢失早期输出
	if (nextProcess.stdout) {
		nextProcess.stdout.setEncoding("utf8");
		nextProcess.stdout.on("data", (data) => {
			const output = String(data);
			stdoutBuffer += output;
			// 立即记录到日志文件
			logToFile(`[Next.js STDOUT] ${output.trim()}`);
		});
		nextProcess.stdout.on("end", () => {
			logToFile("[Next.js STDOUT] stream ended");
		});
		nextProcess.stdout.on("error", (err) => {
			logToFile(`[Next.js STDOUT] stream error: ${err.message}`);
		});
	}

	if (nextProcess.stderr) {
		nextProcess.stderr.setEncoding("utf8");
		nextProcess.stderr.on("data", (data) => {
			const output = String(data);
			stderrBuffer += output;
			// 立即记录到日志文件
			logToFile(`[Next.js STDERR] ${output.trim()}`);
		});
		nextProcess.stderr.on("end", () => {
			logToFile("[Next.js STDERR] stream ended");
		});
		nextProcess.stderr.on("error", (err) => {
			logToFile(`[Next.js STDERR] stream error: ${err.message}`);
		});
	}

	nextProcess.on("error", (error) => {
		const errorMsg = `Failed to start Next.js server: ${error.message}`;
		logToFile(`ERROR: ${errorMsg}`);
		logToFile(`Error stack: ${error.stack || "No stack trace"}`);

		// 显示错误对话框
		if (mainWindow) {
			dialog.showErrorBox(
				"Server Start Error",
				`Failed to start Next.js server:\n${error.message}\n\nCheck logs at: ${logFile}`,
			);
		}

		try {
			console.error(errorMsg, error);
		} catch (_err) {
			// 忽略 EPIPE 错误
		}
	});

	// 监听未捕获的异常（可能在子进程中）
	process.on("uncaughtException", (error) => {
		logToFile(`UNCAUGHT EXCEPTION: ${error.message}`);
		logToFile(`Stack: ${error.stack || "No stack"}`);
	});

	process.on("unhandledRejection", (reason) => {
		logToFile(`UNHANDLED REJECTION: ${reason}`);
	});

	nextProcess.on("exit", (code, signal) => {
		const exitMsg = `Next.js server exited with code ${code}, signal ${signal}`;
		logToFile(exitMsg);
		logToFile(`STDOUT buffer (last 2000 chars): ${stdoutBuffer.slice(-2000)}`);
		logToFile(`STDERR buffer (last 2000 chars): ${stderrBuffer.slice(-2000)}`);

		// 检查 node_modules 是否存在
		const nodeModulesPath = path.join(serverDir, "node_modules");
		const nextModulePath = path.join(nodeModulesPath, "next");
		logToFile(`Checking node_modules: ${nodeModulesPath}`);
		logToFile(`node_modules exists: ${fs.existsSync(nodeModulesPath)}`);
		logToFile(`next module exists: ${fs.existsSync(nextModulePath)}`);

		// 检查关键依赖
		const styledJsxPath = path.join(nodeModulesPath, "styled-jsx");
		const swcHelpersPath = path.join(nodeModulesPath, "@swc", "helpers");
		logToFile(`styled-jsx exists: ${fs.existsSync(styledJsxPath)}`);
		logToFile(`@swc/helpers exists: ${fs.existsSync(swcHelpersPath)}`);

		// 如果服务器在启动后很快退出（无论是 code 0 还是其他），都认为是错误
		// 因为服务器应该持续运行
		const errorMsg = `Server exited unexpectedly with code ${code}${signal ? `, signal ${signal}` : ""}. Check logs at: ${logFile}`;
		logToFile(`ERROR: ${errorMsg}`);

		if (mainWindow) {
			dialog.showErrorBox(
				"Server Exited Unexpectedly",
				`The Next.js server exited unexpectedly.\n\n${errorMsg}\n\nSTDOUT:\n${stdoutBuffer.slice(-1000) || "(empty)"}\n\nSTDERR:\n${stderrBuffer.slice(-1000) || "(empty)"}\n\nCheck logs at: ${logFile}`,
			);
		}

		// 延迟退出，让用户看到错误消息
		setTimeout(() => {
			app.quit();
		}, 3000);
	});
}

/**
 * 创建主窗口
 */
function createWindow(): void {
	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
		},
		show: false, // 等待内容加载完成再显示
		backgroundColor: "#1a1a1a",
	});

	mainWindow.loadURL(SERVER_URL);

	mainWindow.once("ready-to-show", () => {
		mainWindow?.show();
		logToFile("Window is ready to show");
	});

	mainWindow.on("closed", () => {
		logToFile("Window closed");
		mainWindow = null;
	});

	// 处理窗口加载失败
	mainWindow.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription) => {
			const errorMsg = `Window failed to load: ${errorCode} - ${errorDescription}`;
			logToFile(`ERROR: ${errorMsg}`);
			console.error(errorMsg);

			// 如果服务器未就绪，显示错误
			if (errorCode === -106 || errorCode === -105) {
				// ERR_CONNECTION_REFUSED or ERR_NAME_NOT_RESOLVED
				dialog.showErrorBox(
					"Connection Error",
					`Failed to connect to server at ${SERVER_URL}\n\nError: ${errorDescription}\n\nCheck logs at: ${logFile}`,
				);
			}
		},
	);

	// 处理渲染进程崩溃
	mainWindow.webContents.on("render-process-gone", (_event, details) => {
		const errorMsg = `Render process crashed: ${details.reason} (exit code: ${details.exitCode})`;
		logToFile(`FATAL ERROR: ${errorMsg}`);
		console.error(errorMsg);

		dialog.showErrorBox(
			"Application Crashed",
			`The application window crashed:\n${details.reason}\n\nCheck logs at: ${logFile}`,
		);

		// 不立即退出，让用户看到错误
	});

	// 处理未捕获的异常
	mainWindow.webContents.on("unresponsive", () => {
		logToFile("WARNING: Window became unresponsive");
	});

	mainWindow.webContents.on("responsive", () => {
		logToFile("Window became responsive again");
	});

	// 开发模式下打开开发者工具
	if (isDev) {
		mainWindow.webContents.openDevTools();
	}
}

/**
 * 检查服务器健康状态
 */
function startHealthCheck(): void {
	if (healthCheckInterval) {
		clearInterval(healthCheckInterval);
	}

	healthCheckInterval = setInterval(() => {
		if (!nextProcess || nextProcess.killed) {
			logToFile("WARNING: Next.js process is not running");
			return;
		}

		// 检查服务器是否响应
		http
			.get(SERVER_URL, (res) => {
				if (res.statusCode !== 200 && res.statusCode !== 304) {
					logToFile(`WARNING: Server returned status ${res.statusCode}`);
				}
			})
			.on("error", (error) => {
				logToFile(`WARNING: Health check failed: ${error.message}`);
				// 如果服务器进程还在运行但无法连接，可能是服务器崩溃了
				if (nextProcess && !nextProcess.killed) {
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
function stopHealthCheck(): void {
	if (healthCheckInterval) {
		clearInterval(healthCheckInterval);
		healthCheckInterval = null;
	}
}

/**
 * 关闭 Next.js 服务器
 */
function stopNextServer(): void {
	stopHealthCheck();
	if (nextProcess) {
		logToFile("Stopping Next.js server...");
		nextProcess.kill("SIGTERM");
		nextProcess = null;
	}
}

// 应用准备就绪（只在获得锁的情况下执行）
if (gotTheLock) {
	// macOS: 点击 dock 图标时重新创建窗口
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});

	// 所有窗口关闭时退出应用（macOS 除外）
	app.on("window-all-closed", () => {
		if (process.platform !== "darwin") {
			app.quit();
		}
	});

	// 应用退出前清理
	app.on("before-quit", () => {
		stopNextServer();
	});

	// 应用退出时确保清理
	app.on("quit", () => {
		stopNextServer();
	});

	app.whenReady().then(async () => {
		try {
			logToFile("Application starting...");
			logToFile(`App isPackaged: ${app.isPackaged}`);
			logToFile(`NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
			logToFile(`isDev: ${isDev}`);
			logToFile(`Will start built-in server: ${!isDev || app.isPackaged}`);
			await startNextServer();

			// 等待服务器就绪（最多等待 30 秒）
			const waitMsg = "Waiting for server to be ready...";
			console.log(waitMsg);
			logToFile(waitMsg);

			await waitForServer(SERVER_URL, 30000);

			const readyMsg = "Server is ready!";
			console.log(readyMsg);
			logToFile(readyMsg);

			// 启动健康检查
			startHealthCheck();

			createWindow();
			logToFile("Window created successfully");
		} catch (error) {
			const errorMsg = `Failed to start application: ${error instanceof Error ? error.message : String(error)}`;
			console.error(errorMsg);
			logToFile(`FATAL ERROR: ${errorMsg}`);
			if (error instanceof Error && error.stack) {
				logToFile(`Stack trace: ${error.stack}`);
			}

			if (mainWindow) {
				dialog.showErrorBox(
					"Startup Error",
					`Failed to start application:\n${errorMsg}\n\nCheck logs at: ${logFile}`,
				);
			}

			setTimeout(() => {
				app.quit();
			}, 3000);
		}
	});
}
