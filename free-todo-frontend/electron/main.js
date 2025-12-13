const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let nextProcess;
const isDev = !app.isPackaged; // 使用可靠的方式判断是否为开发环境
const port = 3000;

function createWindow() {
	mainWindow = new BrowserWindow({
		width: 1400,
		height: 900,
		minWidth: 1000,
		minHeight: 600,
		title: "FreeTodo",
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			nodeIntegration: false,
			contextIsolation: true,
			webSecurity: true,
		},
		icon: path.join(__dirname, "icon.png"),
	});

	// 开发模式下打开开发者工具
	if (isDev) {
		mainWindow.webContents.openDevTools();
	}

	// 加载 Next.js 应用
	const startUrl = `http://localhost:${port}`;
	mainWindow.loadURL(startUrl);

	// 处理外部链接
	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith("http://") || url.startsWith("https://")) {
			require("electron").shell.openExternal(url);
			return { action: "deny" };
		}
		return { action: "allow" };
	});

	mainWindow.on("closed", () => {
		mainWindow = null;
	});

	// 创建菜单
	createMenu();
}

function createMenu() {
	const template = [
		{
			label: "FreeTodo",
			submenu: [
				{ role: "about", label: "关于 FreeTodo" },
				{ type: "separator" },
				{ role: "services", label: "服务" },
				{ type: "separator" },
				{ role: "hide", label: "隐藏 FreeTodo" },
				{ role: "hideOthers", label: "隐藏其他" },
				{ role: "unhide", label: "显示全部" },
				{ type: "separator" },
				{ role: "quit", label: "退出" },
			],
		},
		{
			label: "编辑",
			submenu: [
				{ role: "undo", label: "撤销" },
				{ role: "redo", label: "重做" },
				{ type: "separator" },
				{ role: "cut", label: "剪切" },
				{ role: "copy", label: "复制" },
				{ role: "paste", label: "粘贴" },
				{ role: "selectAll", label: "全选" },
			],
		},
		{
			label: "视图",
			submenu: [
				{ role: "reload", label: "重新加载" },
				{ role: "forceReload", label: "强制重新加载" },
				{ role: "toggleDevTools", label: "开发者工具" },
				{ type: "separator" },
				{ role: "resetZoom", label: "实际大小" },
				{ role: "zoomIn", label: "放大" },
				{ role: "zoomOut", label: "缩小" },
				{ type: "separator" },
				{ role: "togglefullscreen", label: "切换全屏" },
			],
		},
		{
			label: "窗口",
			submenu: [
				{ role: "minimize", label: "最小化" },
				{ role: "zoom", label: "缩放" },
				{ type: "separator" },
				{ role: "front", label: "全部置于顶层" },
			],
		},
	];

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}

function startNextServer() {
	return new Promise((resolve, reject) => {
		if (isDev) {
			// 开发模式：启动 Next.js 开发服务器
			console.log("正在启动 Next.js 开发服务器...");

			nextProcess = spawn("npm", ["run", "dev"], {
				cwd: path.join(__dirname, ".."),
				shell: true,
				stdio: "inherit",
				env: {
					...process.env,
					BROWSER: "none",
					PORT: port.toString(),
				},
			});

			nextProcess.on("error", (err) => {
				console.error("无法启动 Next.js 开发服务器:", err);
				reject(err);
			});

			// 等待服务器启动
			waitForServer(resolve, reject);
		} else {
			// 生产模式：使用 standalone 构建启动服务器
			console.log("正在启动 Next.js standalone 服务器...");

			try {
				const { startStandaloneServer } = require("./server");
				startStandaloneServer(port)
					.then(() => {
						console.log("Standalone 服务器已准备就绪");
						resolve();
					})
					.catch(reject);
			} catch (error) {
				console.error("启动 standalone 服务器失败:", error);
				reject(error);
			}
		}
	});
}

function waitForServer(resolve, reject) {
	let attempts = 0;
	const maxAttempts = 30;

	const checkServer = setInterval(() => {
		attempts++;
		const http = require("http");
		const req = http.get(`http://localhost:${port}`, (res) => {
			if (res.statusCode === 200 || res.statusCode === 404) {
				clearInterval(checkServer);
				console.log("Next.js 服务器已启动");
				resolve();
			}
		});
		req.on("error", () => {
			if (attempts >= maxAttempts) {
				clearInterval(checkServer);
				reject(new Error("Next.js 服务器启动超时"));
			}
		});
		req.end();
	}, 1000);
}

// 当 Electron 完成初始化时
app.whenReady().then(async () => {
	try {
		// 启动 Next.js 服务器
		await startNextServer();
		createWindow();
	} catch (error) {
		console.error("启动失败:", error);
		// 显示错误对话框
		const { dialog } = require("electron");
		dialog.showErrorBox(
			"启动失败",
			`应用启动失败: ${error.message}\n\n请查看控制台获取详细信息。`,
		);
		app.quit();
	}

	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) {
			createWindow();
		}
	});
});

// 所有窗口关闭时退出应用
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

// 退出前清理
app.on("before-quit", () => {
	if (nextProcess) {
		if (nextProcess.kill) {
			// 开发模式：终止进程
			nextProcess.kill();
		} else if (nextProcess.server) {
			// 生产模式：关闭服务器
			nextProcess.server.close();
		}
	}
});

// 处理未捕获的异常
process.on("uncaughtException", (error) => {
	console.error("未捕获的异常:", error);
});
