import { type ChildProcess, fork, spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { app, BrowserWindow, dialog, desktopCapturer, ipcMain, screen, Menu } from "electron";

// 强制生产模式：如果应用已打包，必须使用生产模式
// 即使 NODE_ENV 被设置为 development，打包的应用也应该运行生产服务器
const isDev = !app.isPackaged && process.env.NODE_ENV !== "production";
let nextProcess: ChildProcess | null = null;
let backendProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let healthCheckInterval: NodeJS.Timeout | null = null;
let backendHealthCheckInterval: NodeJS.Timeout | null = null;
// 保存窗口的原始位置和尺寸（用于从全屏模式恢复）
let originalBounds: { x: number; y: number; width: number; height: number } | null = null;

// 检查是否启用灵动岛模式（透明窗口）
// 默认启用灵动岛模式，可以通过环境变量 ENABLE_DYNAMIC_ISLAND=false 禁用
const enableDynamicIsland = process.env.ENABLE_DYNAMIC_ISLAND !== 'false';

const PORT = process.env.PORT || "3000";
const SERVER_URL = `http://localhost:${PORT}`;
const BACKEND_PORT = process.env.BACKEND_PORT || "8000";
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;

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
 * 启动 Next.js 服务器
 * 在打包的应用中，总是启动内置的生产服务器
 */
async function startNextServer(): Promise<void> {
	// 如果应用已打包，必须启动内置服务器，不允许依赖外部 dev 服务器
	if (app.isPackaged) {
		logToFile("App is packaged - starting built-in production server");
	} else if (isDev) {
		// 开发模式：自动启动 Next.js dev 服务器
		const msg = `Development mode: starting Next.js dev server at ${SERVER_URL}`;
		console.log(msg);
		logToFile(msg);
		
		// 检查是否已经有 Next.js 服务器在运行
		try {
			await waitForServer(SERVER_URL, 2000);
			logToFile("Next.js dev server is already running");
			return;
		} catch {
			// 没有运行，需要启动
		}
		
		// 启动 Next.js dev 服务器
		// 在 Windows 上，需要使用 shell: true 来运行 .cmd 文件
		const devCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
		const devArgs = ["dev"];
		
		logToFile(`Starting Next.js dev server: ${devCommand} ${devArgs.join(" ")}`);
		logToFile(`Working directory: ${path.join(__dirname, "..")}`);
		
		nextProcess = spawn(devCommand, devArgs, {
			cwd: path.join(__dirname, ".."),
			env: {
				...process.env,
				PORT: PORT,
				NODE_ENV: "development",
			},
			stdio: ["ignore", "pipe", "pipe"],
			shell: process.platform === "win32", // Windows 上需要 shell
		});
		
		// 监听输出
		if (nextProcess.stdout) {
			nextProcess.stdout.on("data", (data) => {
				logToFile(`[Next.js Dev] ${data.toString().trim()}`);
			});
		}
		
		if (nextProcess.stderr) {
			nextProcess.stderr.on("data", (data) => {
				logToFile(`[Next.js Dev Error] ${data.toString().trim()}`);
			});
		}
		
		nextProcess.on("error", (error) => {
			logToFile(`Failed to start Next.js dev server: ${error.message}`);
		});
		
		nextProcess.on("exit", (code) => {
			logToFile(`Next.js dev server exited with code ${code}`);
		});
		
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
	// 确定 preload 脚本路径
	let preloadPath: string;
	if (app.isPackaged) {
		// 生产环境：preload.js 在资源目录
		preloadPath = path.join(process.resourcesPath, 'electron', 'preload.js');
	} else {
		// 开发环境：使用 dist-electron/preload.js（构建脚本会编译）
		preloadPath = path.join(__dirname, 'preload.js');
		
		logToFile(`Looking for preload script at: ${preloadPath}`);
		logToFile(`__dirname: ${__dirname}`);
		logToFile(`Preload exists: ${fs.existsSync(preloadPath)}`);
		
		// 如果不存在，尝试其他路径
		if (!fs.existsSync(preloadPath)) {
			const possiblePaths = [
				path.join(__dirname, 'preload.js'),
				path.resolve(__dirname, '../electron/preload.js'),
				path.resolve(__dirname, '../electron/preload.ts'),
				path.resolve(__dirname, '../../dist-electron/preload.js'),
			];
			
			logToFile(`Trying alternative paths...`);
			for (const altPath of possiblePaths) {
				logToFile(`  Checking: ${altPath} (exists: ${fs.existsSync(altPath)})`);
			}
			
			preloadPath = possiblePaths.find(p => fs.existsSync(p)) || possiblePaths[0];
		}
		
		if (!fs.existsSync(preloadPath)) {
			const errorMsg = `Preload script not found at ${preloadPath}. Please run 'pnpm electron:build-main' first.`;
			logToFile(`ERROR: ${errorMsg}`);
			console.error(errorMsg);
		} else {
			logToFile(`✅ Using preload script: ${preloadPath}`);
			logToFile(`Preload file size: ${fs.statSync(preloadPath).size} bytes`);
		}
	}
	
	// 验证 preload 脚本是否存在
	if (!fs.existsSync(preloadPath)) {
		const errorMsg = `Preload script not found at ${preloadPath}. Please run 'pnpm electron:build-main' first.`;
		logToFile(`ERROR: ${errorMsg}`);
		console.error(errorMsg);
		dialog.showErrorBox("Preload Script Error", errorMsg);
	}
	
	// 获取主显示器尺寸（用于全屏模式）
	const { screen } = require('electron');
	const primaryDisplay = screen.getPrimaryDisplay();
	const { width: screenWidth, height: screenHeight } = primaryDisplay.workAreaSize;
	
	// 灵动岛模式：参考 island 的实现，窗口始终是全屏大小
	// 然后通过 CSS 控制灵动岛的位置和大小（right: 32, bottom: 32, width: 180, height: 48）
	// 保存原始位置和尺寸（用于从全屏模式恢复）
	if (enableDynamicIsland && !originalBounds) {
		// 窗口初始位置在右下角，但大小是全屏（这样灵动岛可以通过 CSS 定位）
		originalBounds = {
			x: 0,
			y: 0,
			width: screenWidth,
			height: screenHeight,
		};
	} else if (!enableDynamicIsland && !originalBounds) {
		originalBounds = {
			x: 0,
			y: 0,
			width: 1200,
			height: 800,
		};
	}
	
		mainWindow = new BrowserWindow({
			width: enableDynamicIsland ? screenWidth : 1200, // 灵动岛模式使用全屏宽度（初始）
			height: enableDynamicIsland ? screenHeight : 800, // 灵动岛模式使用全屏高度（初始）
			x: 0,
			y: 0,
			minWidth: enableDynamicIsland ? undefined : 800,
			minHeight: enableDynamicIsland ? undefined : 600,
			frame: enableDynamicIsland ? false : true, // 灵动岛模式无边框
			transparent: enableDynamicIsland ? true : false, // 灵动岛模式透明
			alwaysOnTop: enableDynamicIsland ? true : false, // 灵动岛模式置顶
			hasShadow: enableDynamicIsland ? false : true, // 灵动岛模式无阴影
			resizable: enableDynamicIsland ? false : true, // 灵动岛模式初始不可调整（expand-window 时会设置为可调整）
			movable: enableDynamicIsland ? false : true, // 灵动岛模式初始不可移动（expand-window 时会设置为可移动）
			skipTaskbar: enableDynamicIsland ? true : false, // 灵动岛模式不显示在任务栏
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: preloadPath, // 添加 preload 脚本
		},
		show: false, // 等待内容加载完成再显示
		backgroundColor: enableDynamicIsland ? "#00000000" : "#1a1a1a", // 使用透明色值
	});

	// 方案 1: 使用 insertCSS 在页面加载前注入透明背景 CSS（最有效）
	// 这个方法会在页面加载前就应用 CSS，避免 SSR 导致的窗口显示问题
	// 参考 electron-with-nextjs，始终注入透明背景 CSS
	if (enableDynamicIsland && mainWindow) {
		// 在页面加载前注入 CSS（参考 electron-with-nextjs 的 globals.css）
		mainWindow.webContents.insertCSS(`
			html, body, #__next, #__next > div, #__next > div > div {
				background-color: transparent !important;
				background: transparent !important;
			}
		`);
		logToFile("Transparent background CSS injected via insertCSS");
		
		// 监听页面导航，确保每次页面加载都应用透明背景
		mainWindow.webContents.on('did-navigate', () => {
			if (mainWindow) {
				mainWindow.webContents.insertCSS(`
					html, body, #__next, #__next > div, #__next > div > div {
						background-color: transparent !important;
						background: transparent !important;
					}
				`).catch(() => {});
			}
		});
		
		// 方案 2: 拦截并修改 HTML 响应（备用方案）
		// 如果 insertCSS 不够，可以取消注释下面的代码
		/*
		mainWindow.webContents.session.webRequest.onBeforeRequest({
			urls: ['http://localhost:3000/*']
		}, (details, callback) => {
			// 这里可以拦截并修改响应
			callback({});
		});
		*/
	}

	// 在加载 URL 前，注入透明背景脚本（在 did-start-loading 时执行）
	// 这个脚本会在页面加载的早期执行，尽可能早地设置透明背景
	mainWindow.webContents.once('did-start-loading', () => {
		if (!mainWindow) return;
		// 注入脚本设置透明背景，尽可能早地执行
		mainWindow.webContents.executeJavaScript(`
			(function() {
				const isElectron = navigator.userAgent.includes('Electron') || 
					(typeof window.electronAPI !== 'undefined') || 
					(typeof window.require !== 'undefined');
				
				if (isElectron) {
					// 立即设置透明背景
					const html = document.documentElement;
					if (html) {
						html.setAttribute('data-electron', 'true');
						html.style.setProperty('background-color', 'transparent', 'important');
						html.style.setProperty('background', 'transparent', 'important');
					}
					
					// 监听 DOMContentLoaded 和 body 创建
					const setBodyTransparent = () => {
						const body = document.body;
						if (body) {
							body.style.setProperty('background-color', 'transparent', 'important');
							body.style.setProperty('background', 'transparent', 'important');
						}
					};
					
					if (document.body) {
						setBodyTransparent();
					} else {
						document.addEventListener('DOMContentLoaded', setBodyTransparent);
						// 也监听 body 的创建
						if (document.documentElement) {
							const observer = new MutationObserver(() => {
								if (document.body) {
									setBodyTransparent();
									observer.disconnect();
								}
							});
							observer.observe(document.documentElement, { childList: true, subtree: true });
						}
					}
					
					// 设置 #__next 透明
					const setNextTransparent = () => {
						const next = document.getElementById('__next');
						if (next) {
							next.style.setProperty('background-color', 'transparent', 'important');
							next.style.setProperty('background', 'transparent', 'important');
						}
					};
					
					// 延迟执行，确保 #__next 已创建
					setTimeout(setNextTransparent, 100);
					setTimeout(setNextTransparent, 500);
					setTimeout(setNextTransparent, 1000);
				}
			})();
		`).catch(() => {
			// 忽略错误
		});
	});

	// 确保服务器已经启动后再加载 URL
	// 在 createWindow 被调用时，服务器应该已经就绪
	// 但为了安全，我们再次检查
	const loadWindow = async () => {
		try {
			// 确保服务器就绪
			await waitForServer(SERVER_URL, 5000);
			logToFile(`Loading URL: ${SERVER_URL}`);
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.loadURL(SERVER_URL);
			}
		} catch (error) {
			logToFile(`Failed to verify server, loading URL anyway: ${error instanceof Error ? error.message : String(error)}`);
			// 即使检查失败，也尝试加载（可能服务器刚启动）
			if (mainWindow && !mainWindow.isDestroyed()) {
				mainWindow.loadURL(SERVER_URL);
			}
		}
	};
	
	// 延迟一点加载，确保窗口完全创建
	setTimeout(() => {
		loadWindow();
	}, 100);

	// 监听页面加载完成，检查 preload 脚本是否正确加载
	mainWindow.webContents.once("did-finish-load", () => {
		logToFile("Page finished loading, checking preload script...");
		// 注入调试代码检查 electronAPI
		mainWindow?.webContents.executeJavaScript(`
			(function() {
				const hasElectronAPI = typeof window.electronAPI !== 'undefined';
				const hasGetSystemAudioStream = hasElectronAPI && typeof window.electronAPI.getSystemAudioStream === 'function';
				const result = {
					hasElectronAPI,
					hasGetSystemAudioStream,
					electronAPIKeys: hasElectronAPI ? Object.keys(window.electronAPI) : [],
					userAgent: navigator.userAgent,
					hasProcess: typeof window.process !== 'undefined',
					processType: typeof window.process !== 'undefined' ? window.process.type : undefined
				};
				console.log('[Electron Main] Preload script check:', result);
				return result;
			})();
		`).then((result) => {
			logToFile(`Preload script check result: ${JSON.stringify(result, null, 2)}`);
			if (!result.hasElectronAPI) {
				logToFile("WARNING: electronAPI is not available in renderer process!");
				console.warn("⚠️ electronAPI is not available. Check preload script loading.");
				if (mainWindow) {
					dialog.showMessageBox(mainWindow, {
						type: "warning",
						title: "Preload Script Warning",
						message: "electronAPI is not available",
						detail: `This may affect system audio capture.\n\nCheck logs at: ${logFile}\n\nResult: ${JSON.stringify(result, null, 2)}`,
					});
				}
			} else {
				logToFile("✅ electronAPI is available in renderer process");
				logToFile(`Available methods: ${result.electronAPIKeys.join(", ")}`);
			}
		}).catch((err) => {
			logToFile(`Error checking preload script: ${err.message}`);
			console.error("Error checking preload script:", err);
		});
	});

	// 监听透明背景设置完成事件
	let transparentBackgroundReady = false;
	ipcMain.on('transparent-background-ready', () => {
		transparentBackgroundReady = true;
		logToFile("Transparent background ready signal received");
	});

	mainWindow.once("ready-to-show", () => {
		// 如果启用灵动岛模式，窗口始终显示但是透明和点击穿透
		// 这样只有悬浮按钮可见，不影响其他工作
		if (enableDynamicIsland && mainWindow) {
			// 等待透明背景设置完成后再显示窗口
			// 这样可以避免 Next.js SSR 导致的窗口显示问题
			const showWindow = () => {
				if (mainWindow) {
					mainWindow.show();
					// 默认设置点击穿透，直到鼠标悬停在灵动岛上
					mainWindow.setIgnoreMouseEvents(true, { forward: true });
					logToFile("Dynamic Island mode enabled: window shown, click-through active");
				}
			};

			// 等待透明背景设置完成后再显示窗口
			// 优先等待 IPC 信号，如果没有收到信号则延迟显示
			const showWindowDelayed = () => {
				if (!mainWindow) return;
				
				// 如果已经收到透明背景就绪信号，直接显示
				if (transparentBackgroundReady) {
					showWindow();
					return;
				}

				// 等待页面加载完成
				if (mainWindow.webContents.isLoading()) {
					mainWindow.webContents.once("did-finish-load", () => {
						// 等待透明背景设置完成（preload 脚本会发送信号）
						// 增加延迟时间，确保 Next.js 的客户端脚本完全执行
						// 在显示窗口前，再次注入脚本强制设置透明背景
						if (!mainWindow) return;
						mainWindow.webContents.executeJavaScript(`
							(function() {
								const html = document.documentElement;
								const body = document.body;
								const next = document.getElementById('__next');
								
								if (html) {
									html.setAttribute('data-electron', 'true');
									html.style.setProperty('background-color', 'transparent', 'important');
									html.style.setProperty('background', 'transparent', 'important');
								}
								
								if (body) {
									body.style.setProperty('background-color', 'transparent', 'important');
									body.style.setProperty('background', 'transparent', 'important');
								}
								
								if (next) {
									next.style.setProperty('background-color', 'transparent', 'important');
									next.style.setProperty('background', 'transparent', 'important');
								}
							})();
						`).catch(() => {
							// 忽略错误
						});
						
						setTimeout(() => {
							const checkTransparent = () => {
								if (transparentBackgroundReady) {
									showWindow();
								} else {
									// 如果 2 秒后还没收到信号，也显示窗口（避免无限等待）
									setTimeout(() => {
										if (!transparentBackgroundReady) {
											logToFile("Warning: Transparent background ready signal not received, showing window anyway");
											showWindow();
										}
									}, 2000);
									// 继续等待信号
									setTimeout(checkTransparent, 100);
								}
							};
							checkTransparent();
						}, 1000); // 延迟 1 秒，确保 Next.js 客户端脚本完全执行
					});
				} else {
					// 页面已加载，等待透明背景设置完成
					// 增加延迟时间，确保 Next.js 的客户端脚本完全执行
					setTimeout(() => {
						const checkTransparent = () => {
							if (transparentBackgroundReady) {
								showWindow();
							} else {
								setTimeout(() => {
									if (!transparentBackgroundReady) {
										logToFile("Warning: Transparent background ready signal not received, showing window anyway");
										showWindow();
									}
								}, 2000);
								setTimeout(checkTransparent, 100);
							}
						};
						checkTransparent();
					}, 500); // 额外延迟 500ms，确保 Next.js 客户端脚本执行
				}
			};

			showWindowDelayed();
		} else {
			mainWindow?.show();
			logToFile("Window is ready to show");
		}
	});

	// 拦截导航，防止加载到错误的 URL（如 DevTools URL）
	mainWindow.webContents.on("will-navigate", (event, navigationUrl) => {
		const parsedUrl = new URL(navigationUrl);
		// 只允许加载 localhost:PORT 的 URL
		if (parsedUrl.hostname !== "localhost" && parsedUrl.hostname !== "127.0.0.1") {
			event.preventDefault();
			logToFile(`Navigation blocked to: ${navigationUrl}`);
		}
		// 阻止加载 DevTools URL
		if (navigationUrl.startsWith("devtools://")) {
			event.preventDefault();
			logToFile(`DevTools URL blocked: ${navigationUrl}`);
		}
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

	// 开发模式下可选打开开发者工具（默认关闭，避免干扰）
	// 如果需要调试，可以手动按 F12 或通过菜单打开
	// if (isDev) {
	// 	mainWindow.webContents.openDevTools();
	// }

	// 创建右键菜单（完全照搬 island 实现）
	if (enableDynamicIsland && mainWindow) {
		mainWindow.webContents.on('context-menu', (e, params) => {
			// Only show context menu if we are interacting with the UI
			const contextMenu = Menu.buildFromTemplate([
				{ label: '退出应用', click: () => app.quit() }
			]);
			contextMenu.popup();
		});
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
 * 启动后端服务器
 */
function startBackendServer(): void {
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

	logToFile(`Starting backend server...`);
	logToFile(`Backend path: ${backendPath}`);
	logToFile(`Backend directory: ${backendDir}`);
	logToFile(`Data directory: ${dataDir}`);

	// 启动后端进程
	backendProcess = spawn(
		backendPath,
		["--port", BACKEND_PORT, "--data-dir", dataDir],
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
 * 启动后端健康检查
 */
function startBackendHealthCheck(): void {
	if (backendHealthCheckInterval) {
		clearInterval(backendHealthCheckInterval);
	}

	backendHealthCheckInterval = setInterval(() => {
		if (!backendProcess || backendProcess.killed) {
			logToFile("WARNING: Backend process is not running");
			return;
		}

		http
			.get(`${BACKEND_URL}/health`, (res) => {
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

	// 注册 IPC 处理器：设置窗口是否忽略鼠标事件（用于透明窗口点击穿透）
	ipcMain.on('set-ignore-mouse-events', (event, ignore: boolean, options?: { forward?: boolean }) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win) {
			win.setIgnoreMouseEvents(ignore, options || {});
		}
	});

	// 注册 IPC 处理器：显示窗口（用于全屏模式）
	ipcMain.on('show-window', (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win) {
			win.show();
			// 全屏模式下，取消点击穿透，确保可以交互
			win.setIgnoreMouseEvents(false);
			// 确保窗口在最前面
			win.focus();
			logToFile("Window shown (fullscreen mode)");
		}
	});

	// 注册 IPC 处理器：隐藏窗口（用于退出全屏模式）
	ipcMain.on('hide-window', (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win) {
			// 隐藏窗口前，重新启用点击穿透（如果启用灵动岛模式）
			if (enableDynamicIsland) {
				win.setIgnoreMouseEvents(true, { forward: true });
			}
			win.hide();
			logToFile("Window hidden (exit fullscreen mode)");
		}
	});

	// 注册 IPC 处理器：移动窗口到指定位置（用于拖拽）
	ipcMain.on('move-window', (event, x: number, y: number) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win && enableDynamicIsland) {
			win.setPosition(Math.round(x), Math.round(y));
		}
	});

	// 注册 IPC 处理器：获取窗口当前位置
	ipcMain.handle('get-window-position', (event) => {
		const win = BrowserWindow.fromWebContents(event.sender);
		if (win) {
			const [x, y] = win.getPosition();
			return { x, y };
		}
		return { x: 0, y: 0 };
	});

	// IPC: 展开窗口到全屏（完全照抄 electron-with-nextjs）
	ipcMain.handle("expand-window-full", () => {
		if (!mainWindow || !enableDynamicIsland) return;

		const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
		const margin = 24;

		// 必须设置可调整和可移动（因为创建时是 false）
		mainWindow.setResizable(true);
		mainWindow.setMovable(true);

		mainWindow.setBounds({
			x: margin,
			y: margin,
			width: screenWidth - margin * 2,
			height: screenHeight - margin * 2,
		});
	});

	// IPC: 展开窗口到窗口化模式（完全照抄 electron-with-nextjs）
	ipcMain.handle("expand-window", () => {
		if (!mainWindow || !enableDynamicIsland) return;

		const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
		const expandedWidth = 500;
		const margin = 24;

		// 必须设置可调整和可移动（因为创建时是 false）
		mainWindow.setResizable(true);
		mainWindow.setMovable(true);

		mainWindow.setBounds({
			x: screenWidth - expandedWidth - margin,
			y: margin,
			width: expandedWidth,
			height: screenHeight - margin * 2,
		});
	});

	// IPC: 在指定位置展开窗口（完全照抄 electron-with-nextjs 的方式，但使用传入的位置）
	ipcMain.handle("expand-window-at-position", (_event, x: number, y: number, width: number, height: number) => {
		if (!mainWindow || !enableDynamicIsland) return;

		// 必须设置可调整和可移动（因为创建时是 false）
		mainWindow.setResizable(true);
		mainWindow.setMovable(true);

		// 直接使用传入的位置和尺寸，不做任何限制
		mainWindow.setBounds({
			x,
			y,
			width,
			height,
		});
	});

	// IPC: 恢复窗口到原始大小
	ipcMain.handle("collapse-window", () => {
		if (!mainWindow || !enableDynamicIsland || !originalBounds) return;
		
		// 恢复为不可调整大小和不可移动
		mainWindow.setResizable(false);
		mainWindow.setMovable(false);
		
		mainWindow.setBounds(originalBounds);
	});

	// IPC: 获取屏幕信息（完全照抄 electron-with-nextjs）
	ipcMain.handle("get-screen-info", () => {
		const { width, height } = screen.getPrimaryDisplay().workAreaSize;
		return { screenWidth: width, screenHeight: height };
	});

	// IPC: 退出应用
	ipcMain.on('app-quit', () => {
		console.log('[main] 收到退出应用请求');
		app.quit();
	});

	// 注册 IPC 处理器：获取系统音频源
	ipcMain.handle('get-system-audio-sources', async () => {
		try {
			const sources = await desktopCapturer.getSources({
				types: ['screen', 'window'],
				thumbnailSize: { width: 0, height: 0 }, // 不需要缩略图
			});
			
			// 返回所有源（让前端尝试）
			return sources.map(source => ({
				id: source.id,
				name: source.name,
				display_id: source.display_id,
			}));
		} catch (error) {
			console.error('获取系统音频源失败:', error);
			return [];
		}
	});

	// 注册 IPC 处理器：检查虚拟音频设备
	ipcMain.handle('check-virtual-audio-device', async () => {
		try {
			const { spawn } = require('child_process');
			const platform = process.platform;
			
			let scriptPath: string;
			let command: string[];
			
			if (platform === 'win32') {
				// Windows: 使用 PowerShell 脚本
				scriptPath = path.join(__dirname, '../../scripts/audio/setup_virtual_audio_windows.ps1');
				command = ['powershell', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-CheckOnly'];
			} else if (platform === 'darwin') {
				// macOS: 使用 shell 脚本
				scriptPath = path.join(__dirname, '../../scripts/audio/setup_virtual_audio_macos.sh');
				command = ['bash', scriptPath, '--check-only'];
			} else if (platform === 'linux') {
				// Linux: 使用 shell 脚本
				scriptPath = path.join(__dirname, '../../scripts/audio/setup_virtual_audio_linux.sh');
				command = ['bash', scriptPath, '--check-only'];
			} else {
				return { available: false, message: `不支持的操作系统: ${platform}` };
			}
			
			return new Promise((resolve) => {
				const proc = spawn(command[0], command.slice(1), {
					cwd: path.dirname(scriptPath),
					timeout: 10000,
				});
				
				let stdout = '';
				let stderr = '';
				
				proc.stdout.on('data', (data: Buffer) => {
					stdout += data.toString();
				});
				
				proc.stderr.on('data', (data: Buffer) => {
					stderr += data.toString();
				});
				
				proc.on('close', (code: number) => {
					const available = code === 0;
					resolve({
						available,
						message: available ? '虚拟音频设备已配置' : '虚拟音频设备未配置',
						details: stdout || stderr,
						platform,
					});
				});
				
				proc.on('error', (error: Error) => {
					resolve({
						available: false,
						message: `检查失败: ${error.message}`,
						platform,
					});
				});
			});
		} catch (error: any) {
			console.error('检查虚拟音频设备失败:', error);
			return {
				available: false,
				message: `检查失败: ${error.message}`,
				platform: process.platform,
			};
		}
	});

	// 注册 IPC 处理器：设置虚拟音频设备
	ipcMain.handle('setup-virtual-audio-device', async () => {
		try {
			const { spawn } = require('child_process');
			const platform = process.platform;
			
			let scriptPath: string;
			let command: string[];
			
			if (platform === 'win32') {
				scriptPath = path.join(__dirname, '../../scripts/audio/setup_virtual_audio_windows.ps1');
				command = ['powershell', '-ExecutionPolicy', 'Bypass', '-File', scriptPath];
			} else if (platform === 'darwin') {
				scriptPath = path.join(__dirname, '../../scripts/audio/setup_virtual_audio_macos.sh');
				command = ['bash', scriptPath];
			} else if (platform === 'linux') {
				scriptPath = path.join(__dirname, '../../scripts/audio/setup_virtual_audio_linux.sh');
				command = ['bash', scriptPath, '--load-module'];
			} else {
				return { success: false, message: `不支持的操作系统: ${platform}` };
			}
			
			return new Promise((resolve) => {
				const proc = spawn(command[0], command.slice(1), {
					cwd: path.dirname(scriptPath),
					timeout: 30000,
				});
				
				let stdout = '';
				let stderr = '';
				
				proc.stdout.on('data', (data: Buffer) => {
					stdout += data.toString();
				});
				
				proc.stderr.on('data', (data: Buffer) => {
					stderr += data.toString();
				});
				
				proc.on('close', (code: number) => {
					const success = code === 0;
					resolve({
						success,
						message: success ? '虚拟音频设备配置成功' : '配置失败，请查看详细信息',
						details: stdout || stderr,
						platform,
					});
				});
				
				proc.on('error', (error: Error) => {
					resolve({
						success: false,
						message: `配置失败: ${error.message}`,
						platform,
					});
				});
			});
		} catch (error: any) {
			console.error('设置虚拟音频设备失败:', error);
			return {
				success: false,
				message: `设置失败: ${error.message}`,
				platform: process.platform,
			};
		}
	});

	// 注册 IPC 处理器：获取系统音频流
	// 注意：Electron 中无法在主进程直接创建 MediaStream，需要在渲染进程中使用 getUserMedia
	// 这里返回源信息，让渲染进程使用 getUserMedia 配合 sourceId 获取流
	ipcMain.handle('get-system-audio-stream', async (_event, sourceId?: string) => {
		try {
			// 获取所有可用的桌面源（包括屏幕和窗口）
			const sources = await desktopCapturer.getSources({
				types: ['screen', 'window'],
				thumbnailSize: { width: 0, height: 0 }, // 不需要缩略图，提高性能
			});
			
			if (sources.length === 0) {
				throw new Error('未找到可用的系统音频源');
			}
			
			// 如果没有指定源ID，优先选择屏幕源（通常包含系统音频）
			if (!sourceId) {
				const screenSource = sources.find(s => s.id.startsWith('screen:'));
				sourceId = screenSource?.id || sources[0].id;
			} else {
				// 验证指定的源ID是否存在
				const sourceExists = sources.some(s => s.id === sourceId);
				if (!sourceExists) {
					throw new Error(`指定的音频源不存在: ${sourceId}`);
				}
			}
			
			// 返回源信息，渲染进程将使用 getUserMedia 配合 sourceId 获取流
			const selectedSource = sources.find(s => s.id === sourceId);
			return {
				sourceId,
				name: selectedSource?.name || '系统音频',
				success: true,
			};
		} catch (error) {
			console.error('获取系统音频流失败:', error);
			throw error;
		}
	});

	// 自动检测和配置虚拟音频设备（在应用启动时）
	async function autoSetupVirtualAudio() {
		try {
			// 使用 IPC 处理器检查设备状态
			const checkHandler = ipcMain.listeners('check-virtual-audio-device');
			if (checkHandler.length > 0) {
				// 模拟调用 IPC 处理器
				const mockEvent = { sender: { send: () => {} } } as any;
				const status: any = await new Promise((resolve) => {
					// 直接调用处理器逻辑
					const { spawn } = require('child_process');
					const platform = process.platform;
					
					let scriptPath: string;
					let command: string[];
					
					if (platform === 'win32') {
						scriptPath = path.join(__dirname, '../../scripts/audio/setup_virtual_audio_windows.ps1');
						command = ['powershell', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, '-CheckOnly'];
					} else if (platform === 'darwin') {
						scriptPath = path.join(__dirname, '../../scripts/audio/setup_virtual_audio_macos.sh');
						command = ['bash', scriptPath, '--check-only'];
					} else if (platform === 'linux') {
						scriptPath = path.join(__dirname, '../../scripts/audio/setup_virtual_audio_linux.sh');
						command = ['bash', scriptPath, '--check-only'];
					} else {
						resolve({ available: false, message: `不支持的操作系统: ${platform}` });
						return;
					}
					
					const proc = spawn(command[0], command.slice(1), {
						cwd: path.dirname(scriptPath),
						timeout: 10000,
					});
					
					let stdout = '';
					let stderr = '';
					
					proc.stdout.on('data', (data: Buffer) => {
						stdout += data.toString();
					});
					
					proc.stderr.on('data', (data: Buffer) => {
						stderr += data.toString();
					});
					
					proc.on('close', (code: number) => {
						const available = code === 0;
						resolve({
							available,
							message: available ? '虚拟音频设备已配置' : '虚拟音频设备未配置',
							details: stdout || stderr,
							platform,
						});
					});
					
					proc.on('error', (error: Error) => {
						resolve({
							available: false,
							message: `检查失败: ${error.message}`,
							platform,
						});
					});
				});
				
				if (!status.available) {
					logToFile("虚拟音频设备未配置，尝试自动配置...");
					// 尝试自动配置（Linux 可以自动加载模块）
					if (process.platform === 'linux') {
						const setupResult: any = await new Promise((resolve) => {
							const { spawn } = require('child_process');
							const scriptPath = path.join(__dirname, '../../scripts/audio/setup_virtual_audio_linux.sh');
							const proc = spawn('bash', [scriptPath, '--load-module'], {
								cwd: path.dirname(scriptPath),
								timeout: 30000,
							});
							
							let stdout = '';
							let stderr = '';
							
							proc.stdout.on('data', (data: Buffer) => {
								stdout += data.toString();
							});
							
							proc.stderr.on('data', (data: Buffer) => {
								stderr += data.toString();
							});
							
							proc.on('close', (code: number) => {
								resolve({
									success: code === 0,
									message: code === 0 ? '虚拟音频设备配置成功' : '配置失败',
									details: stdout || stderr,
								});
							});
							
							proc.on('error', (error: Error) => {
								resolve({
									success: false,
									message: `配置失败: ${error.message}`,
								});
							});
						});
						
						if (setupResult.success) {
							logToFile("✅ 虚拟音频设备自动配置成功");
						} else {
							logToFile(`⚠️  虚拟音频设备自动配置失败: ${setupResult.message}`);
						}
					} else {
						logToFile("⚠️  Windows/macOS 需要手动安装虚拟音频设备驱动");
						logToFile("    Windows: 请安装 VB-CABLE (https://vb-audio.com/Cable/)");
						logToFile("    macOS: 请安装 BlackHole (brew install blackhole-2ch)");
					}
				} else {
					logToFile("✅ 虚拟音频设备已配置");
				}
			}
		} catch (error: any) {
			logToFile(`检查虚拟音频设备时出错: ${error.message}`);
		}
	}

	app.whenReady().then(async () => {
		try {
			logToFile("Application starting...");
			
			// 自动检测虚拟音频设备（异步，不阻塞启动）
			autoSetupVirtualAudio().catch(err => {
				logToFile(`自动配置虚拟音频设备失败: ${err.message}`);
			});
			logToFile(`App isPackaged: ${app.isPackaged}`);
			logToFile(`NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
			logToFile(`isDev: ${isDev}`);
			logToFile(`Will start built-in server: ${!isDev || app.isPackaged}`);

		// 1. 启动后端服务器（仅在非开发模式或已打包时）
		// 开发模式下，后端服务器可能单独启动，不阻塞窗口显示
		if (!isDev || app.isPackaged) {
			startBackendServer();

			// 2. 等待后端就绪（最多等待 180 秒）
			const waitBackendMsg = "Waiting for backend server to be ready...";
			console.log(waitBackendMsg);
			logToFile(waitBackendMsg);
			try {
				await waitForBackend(BACKEND_URL, 180000); // 3 分钟超时
				const backendReadyMsg = "Backend server is ready!";
				console.log(backendReadyMsg);
				logToFile(backendReadyMsg);

				// 3. 启动后端健康检查
				startBackendHealthCheck();
			} catch (error) {
				const errorMsg = `Backend server not available: ${error instanceof Error ? error.message : String(error)}`;
				logToFile(`WARNING: ${errorMsg}`);
				console.warn(`⚠️  ${errorMsg}`);
				// 开发模式下，后端服务器不可用时不阻塞，继续启动窗口
				if (!isDev) {
					throw error; // 生产模式下必须要有后端
				}
			}
		} else {
			// 开发模式：尝试连接后端，但不阻塞
			logToFile("Development mode: Backend server check skipped (may be started separately)");
			// 异步检查后端是否可用，但不阻塞启动
			waitForBackend(BACKEND_URL, 5000).then(() => {
				logToFile("Backend server is available");
				startBackendHealthCheck();
			}).catch(() => {
				logToFile("Backend server not available (will continue without it)");
			});
		}

			// 4. 启动 Next.js 服务器
			await startNextServer();

			// 5. 等待 Next.js 服务器就绪（最多等待 30 秒）
			const waitMsg = "Waiting for Next.js server to be ready...";
			console.log(waitMsg);
			logToFile(waitMsg);
			await waitForServer(SERVER_URL, 30000);

			const readyMsg = "Next.js server is ready!";
			console.log(readyMsg);
			logToFile(readyMsg);

			// 6. 启动 Next.js 健康检查
			startHealthCheck();

			// 7. 创建窗口
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

