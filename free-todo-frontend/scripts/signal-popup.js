/**
 * 信号触发式交互弹窗（动态内容版）
 * 由 signal-sensor HTTP API 启动，从 JSON 数据文件读取弹窗内容
 *
 * 用法: electron signal-popup.js <data.json>
 */

const { app, BrowserWindow, screen, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const MARGIN = 16;
const BASE_HEIGHT = 110;
const LINK_HEIGHT = 34;

app.disableHardwareAcceleration();

if (process.platform === "darwin") {
	app.dock.hide();
}

let avatarBase64 = "";

function loadAvatar() {
	const avatarPath = path.join(__dirname, "..", "public", "hi_dog2.png");
	try {
		if (fs.existsSync(avatarPath)) {
			const buffer = fs.readFileSync(avatarPath);
			avatarBase64 = `data:image/png;base64,${buffer.toString("base64")}`;
		}
	} catch {
		// ignore
	}
}

function loadData() {
	const dataFile = process.argv.find((a) => a.endsWith(".json"));
	if (!dataFile) return { title: "通知", links: [] };
	try {
		return JSON.parse(fs.readFileSync(dataFile, "utf-8"));
	} catch {
		return { title: "通知", links: [] };
	}
}

function escapeHtml(str) {
	return String(str)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function buildLinksHtml(links) {
	if (!links || links.length === 0) return "";
	const items = links
		.map((lk) => {
			const name = escapeHtml(lk.name || "");
			const url = escapeHtml(lk.url || "");
			const plat = escapeHtml(lk.platform || "");
			const initial = escapeHtml(
				plat ? plat.charAt(0).toUpperCase() : name.charAt(0).toUpperCase(),
			);
			return `<a class="kol-link" data-url="${url}">
				<span class="kol-icon">${initial}</span>
				<span class="kol-name">${name}</span>
				${plat ? `<span class="kol-plat">${plat}</span>` : ""}
			</a>`;
		})
		.join("");
	return `<div class="links">${items}</div>`;
}

function getPanelHtml(data) {
	const title = escapeHtml(data.title || "通知");
	const subtitle = escapeHtml(data.subtitle || "");
	const linksHtml = buildLinksHtml(data.links);

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
		height:100%;
	}
	.panel{
		position:fixed;
		bottom:6px;right:6px;left:6px;top:6px;
		opacity:0;
		transform:translateY(40px) scale(0.88);
		animation:popIn .45s cubic-bezier(.34,1.56,.64,1) .08s forwards;
	}
	@keyframes popIn{
		0%{opacity:0;transform:translateY(40px) scale(0.88)}
		60%{opacity:1;transform:translateY(-3px) scale(1.01)}
		100%{opacity:1;transform:translateY(0) scale(1)}
	}
	.card{
		height:100%;
		display:flex;
		flex-direction:column;
		border-radius:13px;
		background:rgba(255,255,255,.98);
		backdrop-filter:blur(20px);
		-webkit-backdrop-filter:blur(20px);
		box-shadow:
			0 8px 24px -4px rgba(0,0,0,.12),
			0 3px 8px -2px rgba(0,0,0,.06),
			0 0 0 .5px rgba(0,0,0,.05);
		overflow:hidden;
	}
	.content{
		display:flex;
		align-items:center;
		gap:10px;
		padding:14px 14px 8px;
	}
	.avatar{
		width:30px;height:30px;
		border-radius:8px;
		overflow:hidden;
		flex-shrink:0;
		box-shadow:0 1px 4px -1px rgba(99,102,241,.25);
	}
	.avatar img{
		width:100%;height:100%;
		object-fit:cover;
		display:block;
	}
	.info{flex:1;min-width:0}
	.title{
		font-size:13px;
		font-weight:700;
		color:#1e1b4b;
		letter-spacing:-.01em;
		margin-top:2px;
		line-height:1.2;
	}
	.subtitle{
		font-size:10.5px;
		color:#94a3b8;
		margin-top:2px;
		line-height:1.3;
	}
	.links{
		padding:0 14px 8px;
		display:flex;
		flex-direction:column;
		gap:5px;
	}
	.kol-link{
		display:flex;
		align-items:center;
		gap:8px;
		padding:6px 10px;
		border-radius:8px;
		background:#f8f7ff;
		border:.5px solid #e9e5fd;
		cursor:pointer;
		transition:all .15s ease;
		text-decoration:none;
	}
	.kol-link:hover{
		background:#eee9fd;
		border-color:#c4b5fd;
		transform:translateX(2px);
	}
	.kol-icon{
		width:18px;height:18px;
		border-radius:5px;
		display:flex;align-items:center;justify-content:center;
		font-size:10px;
		flex-shrink:0;
		color:#fff;
		font-weight:700;
		background:linear-gradient(135deg,#818cf8,#a78bfa);
	}
	.kol-name{
		font-size:12px;
		font-weight:600;
		color:#4c1d95;
	}
	.kol-plat{
		margin-left:auto;
		font-size:9px;
		color:#a78bfa;
		font-weight:500;
	}
	.bottom{
		margin-top:auto;
		padding:0 14px 10px;
	}
	.btn{
		width:100%;
		padding:7px 0;
		border:none;
		border-radius:8px;
		background:linear-gradient(135deg,#818cf8,#a78bfa);
		color:#fff;
		font-size:11.5px;
		font-weight:700;
		cursor:pointer;
		letter-spacing:.02em;
		transition:all .15s ease;
		box-shadow:0 2px 8px -2px rgba(129,140,248,.4);
	}
	.btn:hover{
		transform:translateY(-1px);
		box-shadow:0 4px 12px -2px rgba(129,140,248,.5);
		background:linear-gradient(135deg,#7c83f5,#a07af7);
	}
	.btn:active{
		transform:translateY(0);
		box-shadow:0 1px 4px -1px rgba(129,140,248,.35);
	}
</style>
</head>
<body>
<div class="panel">
	<div class="card">
		<div class="content">
			<div class="avatar">
				<img src="${avatarBase64}" alt="" />
			</div>
			<div class="info">
				<div class="title">${title}</div>
				${subtitle ? `<div class="subtitle">${subtitle}</div>` : ""}
			</div>
		</div>
		${linksHtml}
		<div class="bottom">
			<button class="btn" id="confirmBtn">确认</button>
		</div>
	</div>
</div>
<script>
	document.getElementById('confirmBtn').addEventListener('click', function(){
		window.__electronConfirm && window.__electronConfirm();
	});
	document.querySelectorAll('.kol-link').forEach(function(el){
		el.addEventListener('click', function(e){
			e.preventDefault();
			var url = el.getAttribute('data-url');
			if(url && window.__openExternal) window.__openExternal(url);
		});
	});
</script>
</body>
</html>`;
}

app.whenReady().then(() => {
	loadAvatar();
	const data = loadData();

	const linkCount = (data.links || []).length;
	const hasSubtitle = !!(data.subtitle);
	const WIDTH = 340;
	const HEIGHT = BASE_HEIGHT + linkCount * LINK_HEIGHT + (hasSubtitle ? 16 : 0);

	const workArea = screen.getPrimaryDisplay().workArea;
	const x = workArea.x + workArea.width - WIDTH - MARGIN;
	const y = workArea.y + workArea.height - HEIGHT - MARGIN;

	const win = new BrowserWindow({
		width: WIDTH,
		height: HEIGHT,
		x,
		y,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		skipTaskbar: false,
		resizable: false,
		movable: true,
		focusable: true,
		hasShadow: false,
		show: false,
		webPreferences: {
			nodeIntegration: false,
			contextIsolation: true,
			preload: path.join(__dirname, "signal-popup-preload.js"),
		},
	});

	win.setAlwaysOnTop(true, "screen-saver");

	if (process.platform === "darwin") {
		win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	}

	const html = getPanelHtml(data);
	win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

	win.once("ready-to-show", () => {
		win.show();
		win.focus();
	});

	ipcMain.on("open-external", (_event, url) => {
		shell.openExternal(url);
	});

	ipcMain.once("confirm-clicked", () => {
		win.close();
	});

	win.on("closed", () => {
		app.quit();
	});
});

app.on("window-all-closed", () => {
	app.quit();
});
