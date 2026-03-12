/**
 * 独立 Electron 系统级通知弹窗进程
 * 由 dev-with-auto-port.js 在 pnpm dev 启动时自动附带启动
 * 事件驱动：轮询后端检测新的 draft todo，发现新待办时弹出通知
 * 完全独立，不影响 Next.js 或主应用的任何逻辑
 */

const { app, BrowserWindow, screen, net } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

// ─── 默认配置 ────────────────────────────────────────
const POLL_INTERVAL_MS = 3_000; // 3 秒轮询一次后端
const DURATION_MS = 3_000; // 显示 3 秒
const WIDTH = 360;
const HEIGHT = 120;
const MARGIN = 16;
const BACKEND_PORT = process.env.LIFETRACE_BACKEND_PORT || 8001;
const BACKEND_URL = `http://127.0.0.1:${BACKEND_PORT}`;

// 配置文件路径（由前端 API 写入）
const CONFIG_PATH = path.join(__dirname, "..", ".notification-popup.json");

// 默认弹窗文案
const DEFAULT_TITLE = "待办提醒";
const DEFAULT_MESSAGE = "检测到新的待办事项";

/**
 * 安全转义字符串，用于嵌入到 JS 字符串字面量中
 */
function escapeForJs(str) {
	return str
		.replace(/\\/g, "\\\\")
		.replace(/'/g, "\\'")
		.replace(/"/g, '\\"')
		.replace(/\n/g, "\\n")
		.replace(/\r/g, "\\r");
}

// ─── 初始化 ─────────────────────────────────────────
// 减少资源占用：关闭 GPU 加速
app.disableHardwareAcceleration();
// macOS: 隐藏 Dock 图标
if (process.platform === "darwin") {
	app.dock.hide();
}

let popupWindow = null;
let avatarBase64 = "";
let hideTimeout = null;
let fadeTimeout = null;
let intervalHandle = null;
let lastSeenDraftTodoId = null; // 记录上次看到的 draft todo ID

// ─── 读取配置 ────────────────────────────────────────
function readConfig() {
	try {
		if (fs.existsSync(CONFIG_PATH)) {
			const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
			const cfg = JSON.parse(raw);
			return {
				enabled: typeof cfg.enabled === "boolean" ? cfg.enabled : true,
			};
		}
	} catch {
		// 配置文件不存在或解析失败，使用默认值
	}
	return { enabled: true };
}

// ─── 加载头像 ───────────────────────────────────────
function loadAvatar() {
	const avatarPath = path.join(
		__dirname,
		"..",
		"public",
		"hi_dog2.png",
	);
	try {
		if (fs.existsSync(avatarPath)) {
			const buffer = fs.readFileSync(avatarPath);
			avatarBase64 = `data:image/png;base64,${buffer.toString("base64")}`;
			console.log("[notification-popup] Avatar loaded");
		} else {
			console.warn(`[notification-popup] Avatar not found: ${avatarPath}`);
		}
	} catch (err) {
		console.warn(`[notification-popup] Failed to load avatar: ${err.message}`);
	}
}

// ─── 生成 HTML ──────────────────────────────────────
function getNotificationHtml() {
	const dur = DURATION_MS / 1000;
	return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
	*{margin:0;padding:0;box-sizing:border-box}
	html,body{
		background:transparent!important;
		overflow:hidden;
		font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
		-webkit-font-smoothing:antialiased;
	}
	.popup-wrapper{
		position:fixed;
		bottom:8px;left:8px;right:8px;
		opacity:0;
		transform:translateY(30px) scale(0.9);
	}
	.popup-wrapper.show{
		animation:slideIn .45s cubic-bezier(.16,1,.3,1) forwards;
	}
	.popup-wrapper.hide{
		animation:slideOut .3s cubic-bezier(.4,0,1,1) forwards;
	}
	@keyframes slideIn{
		to{opacity:1;transform:translateY(0) scale(1)}
	}
	@keyframes slideOut{
		from{opacity:1;transform:translateY(0) scale(1)}
		to{opacity:0;transform:translateY(10px) scale(.95)}
	}
	.card{
		position:relative;
		overflow:hidden;
		border-radius:18px;
		background:rgba(255,255,255,.96);
		backdrop-filter:blur(24px);
		-webkit-backdrop-filter:blur(24px);
		box-shadow:
			0 20px 44px -8px rgba(0,0,0,.14),
			0 8px 18px -4px rgba(0,0,0,.08),
			0 0 0 1px rgba(0,0,0,.04);
		padding:16px 18px;
	}
	.content{
		display:flex;
		align-items:center;
		gap:14px;
	}
	.avatar-ring{
		width:50px;height:50px;
		border-radius:50%;
		padding:2.5px;
		background:linear-gradient(135deg,#fbbf24,#f97316,#ef4444);
		flex-shrink:0;
	}
	.avatar-ring img{
		width:100%;height:100%;
		border-radius:50%;
		object-fit:cover;
		background:#fff;
		display:block;
	}
	.text{flex:1;min-width:0}
	.title{
		font-size:14.5px;
		font-weight:700;
		color:#0f172a;
		line-height:1.3;
		letter-spacing:-.01em;
	}
	.message{
		font-size:12.5px;
		color:#64748b;
		line-height:1.45;
		margin-top:3px;
	}
	.progress{
		position:absolute;
		bottom:0;left:0;
		height:2.5px;
		background:linear-gradient(90deg,#fbbf24,#f97316);
		border-radius:0 0 0 18px;
	}
	.progress.animate{
		width:100%;
		animation:shrink ${dur}s linear forwards;
	}
	@keyframes shrink{
		from{width:100%}
		to{width:0%}
	}
</style>
</head>
<body>
<div class="popup-wrapper" id="popup">
	<div class="card">
		<div class="content">
			<div class="avatar-ring">
				<img src="${avatarBase64}" alt="Avatar" />
			</div>
			<div class="text">
				<div class="title" id="notif-title">${DEFAULT_TITLE}</div>
				<div class="message" id="notif-message">${DEFAULT_MESSAGE}</div>
			</div>
		</div>
		<div class="progress" id="progress"></div>
	</div>
</div>
</body>
</html>`;
}

// ─── 创建窗口 ───────────────────────────────────────
function createWindow() {
	if (popupWindow && !popupWindow.isDestroyed()) return;

	const workArea = screen.getPrimaryDisplay().workArea;

	popupWindow = new BrowserWindow({
		width: WIDTH,
		height: HEIGHT,
		x: workArea.x + MARGIN,
		y: workArea.y + workArea.height - HEIGHT - MARGIN,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		skipTaskbar: true,
		resizable: false,
		movable: false,
		focusable: false,
		hasShadow: false,
		show: false,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
		},
	});

	popupWindow.setAlwaysOnTop(true, "screen-saver");
	popupWindow.setIgnoreMouseEvents(true, { forward: true });

	if (process.platform === "darwin") {
		popupWindow.setVisibleOnAllWorkspaces(true, {
			visibleOnFullScreen: true,
		});
	}

	const html = getNotificationHtml();
	popupWindow.loadURL(
		`data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
	);

	popupWindow.on("closed", () => {
		popupWindow = null;
	});
}

// ─── 显示通知 ───────────────────────────────────────
/**
 * @param {Object} [data] 可选的弹窗内容
 * @param {string} [data.title] 标题
 * @param {string} [data.message] 消息内容
 */
function showNotification(data) {
	if (!popupWindow || popupWindow.isDestroyed()) {
		createWindow();
	}
	if (!popupWindow) return;

	// 适应屏幕变化，重新定位
	const workArea = screen.getPrimaryDisplay().workArea;
	popupWindow.setPosition(
		workArea.x + MARGIN,
		workArea.y + workArea.height - HEIGHT - MARGIN,
	);

	const title = escapeForJs((data && data.title) || DEFAULT_TITLE);
	const message = escapeForJs((data && data.message) || DEFAULT_MESSAGE);

	// 更新文本内容、重置动画并播放
	popupWindow.webContents
		.executeJavaScript(
			`(function(){
			var p=document.getElementById('popup');
			var b=document.getElementById('progress');
			var t=document.getElementById('notif-title');
			var m=document.getElementById('notif-message');
			if(t) t.textContent='${title}';
			if(m) m.textContent='${message}';
			p.className='popup-wrapper';
			b.className='progress';
			void p.offsetHeight;
			p.classList.add('show');
			b.classList.add('animate');
		})();`,
		)
		.catch(() => {});

	popupWindow.showInactive();

	// 清除旧定时器
	if (fadeTimeout) clearTimeout(fadeTimeout);
	if (hideTimeout) clearTimeout(hideTimeout);

	// 退出动画（结束前 300ms）
	fadeTimeout = setTimeout(() => {
		if (popupWindow && !popupWindow.isDestroyed()) {
			popupWindow.webContents
				.executeJavaScript(
					`(function(){
					var p=document.getElementById('popup');
					p.classList.remove('show');
					p.classList.add('hide');
				})();`,
				)
				.catch(() => {});
		}
	}, DURATION_MS - 300);

	// 隐藏窗口
	hideTimeout = setTimeout(() => {
		if (popupWindow && !popupWindow.isDestroyed()) {
			popupWindow.hide();
		}
	}, DURATION_MS);
}

// ─── 轮询后端检测新 draft todo ─────────────────────────
function pollDraftTodos() {
	const cfg = readConfig();
	if (!cfg.enabled) return;

	const url = `${BACKEND_URL}/api/todos?status=draft&limit=1`;

	try {
		const request = net.request(url);
		request.on("response", (response) => {
			let body = "";
			response.on("data", (chunk) => {
				body += chunk.toString();
			});
			response.on("end", () => {
				try {
					const data = JSON.parse(body);
					const todos = data?.todos ?? [];
					if (todos.length > 0) {
						const latestId = todos[0].id;
						const todoName = todos[0].name || "";
						// 仅在检测到新的 draft todo 时弹窗
						if (latestId !== lastSeenDraftTodoId) {
							lastSeenDraftTodoId = latestId;
							showNotification({
								title: "待办提醒",
								message: `检测到：${todoName || "新的待办事项"}`,
							});
							console.log(
								`[notification-popup] New draft todo detected: ${todoName || latestId}`,
							);
						}
					}
				} catch {
					// 解析失败，静默忽略
				}
			});
		});
		request.on("error", () => {
			// 后端不可用，静默忽略
		});
		request.end();
	} catch {
		// 请求失败，静默忽略
	}
}

// ─── 启动 ───────────────────────────────────────────
app.whenReady().then(() => {
	loadAvatar();
	createWindow();

	const cfg = readConfig();
	intervalHandle = setInterval(pollDraftTodos, POLL_INTERVAL_MS);
	console.log(
		`[notification-popup] Started (event-driven, poll: ${POLL_INTERVAL_MS}ms, duration: ${DURATION_MS}ms, enabled: ${cfg.enabled})`,
	);
});

// 不要因为没有窗口可见就退出
app.on("window-all-closed", (e) => {
	e.preventDefault();
});

// 父进程断开连接时退出
process.on("disconnect", () => {
	app.quit();
});

// 处理退出信号
process.on("SIGINT", () => app.quit());
process.on("SIGTERM", () => app.quit());
