import { type ChildProcess, fork, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain, Notification } from "electron";

// 强制生产模式：如果应用已打包，必须使用生产模式
// 即使 NODE_ENV 被设置为 development，打包的应用也应该运行生产服务器
const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";
let nextProcess: ChildProcess | null = null;
let backendProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
let backendHealthCheckInterval: NodeJS.Timeout | null = null;

// 默认端口配置（从环境变量读取，如果未设置则使用默认值）
const DEFAULT_FRONTEND_PORT = Number.parseInt(process.env.PORT || "3001", 10);
const DEFAULT_BACKEND_PORT = Number.parseInt(
	process.env.BACKEND_PORT || "8000",
	10,
);

// 动态端口（运行时确定，支持端口被占用时自动切换）
let actualFrontendPort: number = DEFAULT_FRONTEND_PORT;
let actualBackendPort: number = DEFAULT_BACKEND_PORT;

// 动态 URL（基于实际端口）
function getServerUrl(): string {
	return `http://localhost:${actualFrontendPort}`;
}

function getBackendUrl(): string {
	return `http://localhost:${actualBackendPort}`;
}

/**
 * 检查端口是否可用
 */
function isPortAvailable(port: number): Promise<boolean> {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.once("error", () => resolve(false));
		server.once("listening", () => {
			server.close();
			resolve(true);
		});
		server.listen(port, "127.0.0.1");
	});
}

/**
 * 查找可用端口
 * 从 startPort 开始，依次尝试直到找到可用端口
 */
async function findAvailablePort(
	startPort: number,
	maxAttempts = 100,
): Promise<number> {
	for (let offset = 0; offset < maxAttempts; offset++) {
		const port = startPort + offset;
		if (await isPortAvailable(port)) {
			if (offset > 0) {
				logToFile(`Port ${startPort} was occupied, using port ${port} instead`);
			}
			return port;
		}
		logToFile(`Port ${port} is occupied, trying next...`);
	}
	throw new Error(
		`No available port found in range ${startPort}-${startPort + maxAttempts}`,
	);
}

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
			// 如果窗口不存在，等待应用 ready 后再创建窗口，避免在未 ready 状态下创建 BrowserWindow
			if (app.isReady()) {
				createWindow();
			} else {
				app.once("ready", () => {
					createWindow();
				});
			}
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
 * 等待后端服务器启动就绪
 */
function waitForBackend(url: string, timeout: number): Promise<void> {
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
 * 启动 Next.js 服务器（支持动态端口）
 * 在打包的应用中，总是启动内置的生产服务器
 */
async function startNextServer(): Promise<void> {
	// 如果应用已打包，必须启动内置服务器，不允许依赖外部 dev 服务器
	if (app.isPackaged) {
		logToFile("App is packaged - starting built-in production server");
	} else if (isDev) {
		// 开发模式下，尝试探测可用的前端端口（以防开发服务器未启动）
		try {
			actualFrontendPort = await findAvailablePort(DEFAULT_FRONTEND_PORT);
		} catch {
			actualFrontendPort = DEFAULT_FRONTEND_PORT;
		}
		const msg = `Development mode: expecting Next.js dev server at ${getServerUrl()}`;
		console.log(msg);
		logToFile(msg);
		return;
	} else {
		logToFile(
			"Running in production mode (not packaged) - starting built-in server",
		);
	}

	// 动态端口分配：查找可用的前端端口
	try {
		actualFrontendPort = await findAvailablePort(DEFAULT_FRONTEND_PORT);
		logToFile(`Frontend will use port: ${actualFrontendPort}`);
	} catch (error) {
		const errorMsg = `Failed to find available frontend port: ${error instanceof Error ? error.message : String(error)}`;
		logToFile(`ERROR: ${errorMsg}`);
		dialog.showErrorBox("Port Allocation Error", errorMsg);
		throw error;
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
	logToFile(`PORT: ${actualFrontendPort}, HOSTNAME: localhost`);
	logToFile(`NEXT_PUBLIC_API_URL: ${getBackendUrl()}`);

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

	// 强制设置生产模式环境变量，使用动态分配的端口
	serverEnv.PORT = String(actualFrontendPort);
	serverEnv.HOSTNAME = "localhost";
	serverEnv.NODE_ENV = "production"; // 强制生产模式
	// 注入后端 URL，让 Next.js 的 rewrite 和 API 调用使用正确的后端地址
	serverEnv.NEXT_PUBLIC_API_URL = getBackendUrl();

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
 * 获取 preload 脚本路径
 */
function getPreloadPath(): string {
	if (app.isPackaged) {
		// 打包环境：preload.js 和 main.js 在同一个目录（应用根目录）
		// 使用 app.getAppPath() 获取应用路径
		return path.join(app.getAppPath(), "preload.js");
	}
	// 开发环境：使用编译后的文件路径（dist-electron 目录）
	return path.join(__dirname, "preload.js");
}

/**
 * 创建主窗口（使用动态 URL）
 */
function createWindow(): void {
	const serverUrl = getServerUrl();
	const preloadPath = getPreloadPath();

	mainWindow = new BrowserWindow({
		width: 1200,
		height: 800,
		minWidth: 800,
		minHeight: 600,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: preloadPath,
		},
		show: false, // 等待内容加载完成再显示
		backgroundColor: "#1a1a1a",
	});

	logToFile(`Loading URL: ${serverUrl}`);
	mainWindow.loadURL(serverUrl);

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
					`Failed to connect to server at ${serverUrl}\n\nError: ${errorDescription}\n\nCheck logs at: ${logFile}`,
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
 * 检查服务器健康状态（使用动态 URL）
 */
function startHealthCheck(): void {
	if (healthCheckInterval) {
		clearInterval(healthCheckInterval);
	}

	const serverUrl = getServerUrl();

	healthCheckInterval = setInterval(() => {
		if (!nextProcess || nextProcess.killed) {
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
 * 启动后端服务器（支持动态端口）
 */
async function startBackendServer(): Promise<void> {
	if (backendProcess) {
		logToFile("Backend server is already running");
		return;
	}

	// 获取后端可执行文件路径
	let backendPath: string;
	let backendDir: string;
	// Windows 平台需要 .exe 扩展名，其他平台不需要
	const execName = process.platform === "win32" ? "lifetrace.exe" : "lifetrace";

	if (app.isPackaged) {
		// 打包环境：后端在 Resources/backend/lifetrace
		backendDir = path.join(process.resourcesPath, "backend");
		backendPath = path.join(backendDir, execName);
	} else {
		// 开发环境：使用 dist-backend
		const projectRoot = path.resolve(__dirname, "../..");
		backendDir = path.join(projectRoot, "..", "dist-backend");
		backendPath = path.join(backendDir, execName);
	}

	// 检查后端可执行文件是否存在
	if (!fs.existsSync(backendPath)) {
		const errorMsg = `The backend executable was not found at: ${backendPath}\n\nPlease rebuild the application.`;
		logToFile(`ERROR: ${errorMsg}`);
		if (mainWindow) {
			dialog.showErrorBox("Backend Not Found", errorMsg);
		}
		return;
	}

	// 获取数据目录
	const userDataDir = app.getPath("userData");
	const dataDir = path.join(userDataDir, "lifetrace-data");

	// 动态端口分配：查找可用的后端端口
	try {
		actualBackendPort = await findAvailablePort(DEFAULT_BACKEND_PORT);
		logToFile(`Backend will use port: ${actualBackendPort}`);
	} catch (error) {
		const errorMsg = `Failed to find available backend port: ${error instanceof Error ? error.message : String(error)}`;
		logToFile(`ERROR: ${errorMsg}`);
		if (mainWindow) {
			dialog.showErrorBox("Port Allocation Error", errorMsg);
		}
		throw error;
	}

	logToFile(`Starting backend server...`);
	logToFile(`Backend path: ${backendPath}`);
	logToFile(`Backend directory: ${backendDir}`);
	logToFile(`Data directory: ${dataDir}`);
	logToFile(`Backend port: ${actualBackendPort}`);

	// 启动后端进程，使用动态分配的端口
	backendProcess = spawn(
		backendPath,
		["--port", String(actualBackendPort), "--data-dir", dataDir],
		{
			cwd: backendDir,
			env: {
				...process.env,
				PYTHONUNBUFFERED: "1",
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);

	// 记录后端输出
	if (backendProcess.stdout) {
		backendProcess.stdout.setEncoding("utf8");
		backendProcess.stdout.on("data", (data) => {
			const output = String(data);
			logToFile(`[Backend STDOUT] ${output.trim()}`);
		});
	}

	if (backendProcess.stderr) {
		backendProcess.stderr.setEncoding("utf8");
		backendProcess.stderr.on("data", (data) => {
			const output = String(data);
			logToFile(`[Backend STDERR] ${output.trim()}`);
		});
	}

	backendProcess.on("error", (error) => {
		const errorMsg = `Failed to start backend server: ${error.message}`;
		logToFile(`ERROR: ${errorMsg}`);
		if (mainWindow) {
			dialog.showErrorBox(
				"Backend Start Error",
				`${errorMsg}\n\nCheck logs at: ${logFile}`,
			);
		}
		backendProcess = null;
	});

	backendProcess.on("exit", (code, signal) => {
		const exitMsg = `Backend server exited with code ${code}${signal ? `, signal ${signal}` : ""}`;
		logToFile(`ERROR: ${exitMsg}`);
		backendProcess = null;

		if (mainWindow && code !== 0) {
			dialog.showErrorBox(
				"Backend Server Exited",
				`The backend server exited unexpectedly.\n\n${exitMsg}\n\nCheck logs at: ${logFile}\n\nBackend path: ${backendPath}\nData directory: ${dataDir}`,
			);
		}
	});
}

/**
 * 停止后端服务器
 */
function stopBackendServer(): void {
	if (backendProcess) {
		logToFile("Stopping backend server...");
		backendProcess.kill("SIGTERM");
		backendProcess = null;
	}
	stopBackendHealthCheck();
}

/**
 * 启动后端健康检查（使用动态 URL）
 */
function startBackendHealthCheck(): void {
	if (backendHealthCheckInterval) {
		clearInterval(backendHealthCheckInterval);
	}

	const backendUrl = getBackendUrl();

	backendHealthCheckInterval = setInterval(() => {
		if (!backendProcess || backendProcess.killed) {
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
function stopBackendHealthCheck(): void {
	if (backendHealthCheckInterval) {
		clearInterval(backendHealthCheckInterval);
		backendHealthCheckInterval = null;
	}
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

/**
 * 请求通知权限（如果需要）
 * 注意：Electron 会在首次显示通知时自动请求权限，无需手动检查
 */
async function requestNotificationPermission(): Promise<void> {
	// Electron 的 Notification 类没有 permission 属性
	// 权限会在首次显示通知时自动请求
	// macOS 10.14+ 会弹出权限请求对话框
	// Windows 和 Linux 通常不需要显式权限请求
	logToFile(
		"Notification permission will be requested automatically on first notification",
	);
}

/**
 * 显示系统通知
 */
function showSystemNotification(
	title: string,
	body: string,
	notificationId: string,
): void {
	if (!mainWindow) {
		logToFile("WARNING: Cannot show notification - mainWindow is null");
		return;
	}

	try {
		const notification = new Notification({
			title,
			body,
			silent: false, // 允许通知声音
		});

		// 处理通知点击事件
		notification.on("click", () => {
			logToFile(`Notification ${notificationId} clicked - focusing window`);
			if (mainWindow) {
				if (mainWindow.isMinimized()) {
					mainWindow.restore();
				}
				mainWindow.focus();
			}
		});

		// 处理通知显示事件
		notification.on("show", () => {
			logToFile(`Notification ${notificationId} shown: ${title}`);
		});

		// 处理通知关闭事件
		notification.on("close", () => {
			logToFile(`Notification ${notificationId} closed`);
		});

		// 显示通知
		notification.show();
	} catch (error) {
		const errorMsg = `Failed to show notification: ${error instanceof Error ? error.message : String(error)}`;
		logToFile(`ERROR: ${errorMsg}`);
		// 静默失败，不影响应用运行
	}
}

/**
 * 设置 IPC 处理器
 */
function setupIpcHandlers(): void {
	// 处理来自渲染进程的通知请求
	ipcMain.handle(
		"show-notification",
		async (
			_event,
			data: { id: string; title: string; content: string; timestamp: string },
		) => {
			try {
				logToFile(`Received notification request: ${data.id} - ${data.title}`);
				showSystemNotification(data.title, data.content, data.id);
			} catch (error) {
				const errorMsg = `Failed to handle notification request: ${error instanceof Error ? error.message : String(error)}`;
				logToFile(`ERROR: ${errorMsg}`);
				throw error;
			}
		},
	);
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
		stopBackendServer();
		stopNextServer();
	});

	// 应用退出时确保清理
	app.on("quit", () => {
		stopBackendServer();
		stopNextServer();
	});

	app.whenReady().then(async () => {
		try {
			logToFile("Application starting...");
			logToFile(`App isPackaged: ${app.isPackaged}`);
			logToFile(`NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
			logToFile(`isDev: ${isDev}`);
			logToFile(`Will start built-in server: ${!isDev || app.isPackaged}`);
			logToFile(
				`Default ports: frontend=${DEFAULT_FRONTEND_PORT}, backend=${DEFAULT_BACKEND_PORT}`,
			);

			// 设置 IPC 处理器
			setupIpcHandlers();

			// 请求通知权限（如果需要）
			await requestNotificationPermission();

			// 1. 启动后端服务器（会自动探测可用端口）
			await startBackendServer();

			// 2. 等待后端就绪（最多等待 180 秒）
			const backendUrl = getBackendUrl();
			const waitBackendMsg = `Waiting for backend server at ${backendUrl} to be ready...`;
			console.log(waitBackendMsg);
			logToFile(waitBackendMsg);
			await waitForBackend(backendUrl, 180000); // 3 分钟超时
			const backendReadyMsg = `Backend server is ready at ${backendUrl}!`;
			console.log(backendReadyMsg);
			logToFile(backendReadyMsg);

			// 3. 启动后端健康检查
			startBackendHealthCheck();

			// 4. 启动 Next.js 服务器（会自动探测可用端口）
			await startNextServer();

			// 5. 等待 Next.js 服务器就绪（最多等待 30 秒）
			const serverUrl = getServerUrl();
			const waitMsg = `Waiting for Next.js server at ${serverUrl} to be ready...`;
			console.log(waitMsg);
			logToFile(waitMsg);
			await waitForServer(serverUrl, 30000);

			const readyMsg = `Next.js server is ready at ${serverUrl}!`;
			console.log(readyMsg);
			logToFile(readyMsg);

			// 6. 启动 Next.js 健康检查
			startHealthCheck();

			// 7. 创建窗口
			createWindow();
			logToFile(
				`Window created successfully. Frontend: ${serverUrl}, Backend: ${backendUrl}`,
			);
		} catch (error) {
			const errorMsg = `Failed to start application: ${error instanceof Error ? error.message : String(error)}`;
			console.error(errorMsg);
			logToFile(`FATAL ERROR: ${errorMsg}`);
			if (error instanceof Error && error.stack) {
				logToFile(`Stack trace: ${error.stack}`);
			}

			dialog.showErrorBox(
				"Startup Error",
				`Failed to start application:\n${errorMsg}\n\nCheck logs at: ${logFile}`,
			);

			setTimeout(() => {
				app.quit();
			}, 3000);
		}
	});
}
