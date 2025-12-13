import { type ChildProcess, spawn } from "child_process";
import { app, BrowserWindow } from "electron";
import http from "http";
import path from "path";

const isDev = !app.isPackaged;
let nextProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;

const PORT = process.env.PORT || "3000";
const SERVER_URL = `http://localhost:${PORT}`;

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
 * 启动 Next.js 服务器（仅生产模式）
 */
async function startNextServer(): Promise<void> {
	if (isDev) {
		console.log(
			"Development mode: expecting Next.js dev server at",
			SERVER_URL,
		);
		return;
	}

	const serverPath = path.join(
		process.resourcesPath,
		"standalone",
		"server.js",
	);
	console.log("Starting Next.js server from:", serverPath);

	nextProcess = spawn(process.execPath, [serverPath], {
		env: {
			...process.env,
			PORT: PORT,
			HOSTNAME: "localhost",
		},
		stdio: "pipe",
	});

	nextProcess.stdout?.on("data", (data) => {
		console.log(`[Next.js] ${data}`);
	});

	nextProcess.stderr?.on("data", (data) => {
		console.error(`[Next.js Error] ${data}`);
	});

	nextProcess.on("error", (error) => {
		console.error("Failed to start Next.js server:", error);
	});

	nextProcess.on("exit", (code) => {
		console.log(`Next.js server exited with code ${code}`);
		if (code !== 0 && code !== null) {
			app.quit();
		}
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
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	// 开发模式下打开开发者工具
	if (isDev) {
		mainWindow.webContents.openDevTools();
	}
}

/**
 * 关闭 Next.js 服务器
 */
function stopNextServer(): void {
	if (nextProcess) {
		console.log("Stopping Next.js server...");
		nextProcess.kill("SIGTERM");
		nextProcess = null;
	}
}

// 应用准备就绪
app.whenReady().then(async () => {
	try {
		await startNextServer();

		// 等待服务器就绪（最多等待 30 秒）
		console.log("Waiting for server to be ready...");
		await waitForServer(SERVER_URL, 30000);
		console.log("Server is ready!");

		createWindow();
	} catch (error) {
		console.error("Failed to start application:", error);
		app.quit();
	}
});

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
