/**
 * 信号触发式交互弹窗（动态内容版）
 * 由 signal-sensor HTTP API 启动，从 JSON 数据文件读取弹窗内容
 *
 * 支持两种渲染模式：
 *   1. 经典模式 — title + subtitle + links （向后兼容）
 *   2. 富文本模式 — title + bodyHtml （demo 场景）
 *
 * JSON 可选字段:
 *   width / height — 自定义窗口尺寸
 *   bodyHtml       — 替代 subtitle+links 的 HTML 片段
 *   buttons        — [{label, action, copyText, style}]
 *
 * 用法: electron signal-popup.js <data.json>
 */

const { app, BrowserWindow, screen, ipcMain, shell, clipboard } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const MARGIN = 16;
const DEFAULT_WIDTH = 380;
const MIN_HEIGHT = 120;
const MAX_HEIGHT = 800;
const HEADER_HEIGHT = 56;
const BUTTON_HEIGHT = 50;
const LINK_HEIGHT = 34;
const SUBTITLE_LINE_HEIGHT = 16;

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
		.replace(/'/g, "&#39;")
		.replace(/\n/g, "<br>");
}

function renderSimpleMarkdown(str) {
	return escapeHtml(str)
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/\*(.+?)\*/g, "<em>$1</em>")
		.replace(
			/`(.+?)`/g,
			'<code style="background:#f1f0fb;padding:1px 4px;border-radius:3px;font-size:10.5px">$1</code>',
		);
}

function estimateHeight(data) {
	if (data.height) return data.height;
	if (data.bodyHtml) return Math.min(data.height || 500, MAX_HEIGHT);
	const subtitle = data.subtitle || "";
	const linkCount = (data.links || []).length;
	const subtitleLines = subtitle
		? subtitle.split("\n").length + Math.floor(subtitle.length / 35)
		: 0;
	const subtitleHeight = Math.max(subtitleLines * SUBTITLE_LINE_HEIGHT, 0);
	const linksHeight = linkCount * LINK_HEIGHT;
	const raw = HEADER_HEIGHT + subtitleHeight + linksHeight + BUTTON_HEIGHT + 20;
	return Math.max(MIN_HEIGHT, Math.min(raw, MAX_HEIGHT));
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

function buildButtonsHtml(data) {
	const buttons = data.buttons;
	if (!buttons || buttons.length === 0) {
		return '<button class="btn btn-primary" data-action="close">确认</button>';
	}
	return buttons
		.map((b, i) => {
			const style = b.style === "secondary" ? "btn-secondary" : "btn-primary";
			const copyAttr = b.copyText
				? ` data-copy='${b.copyText.replace(/'/g, "&#39;")}'`
				: "";
			const action = b.action || "close";
			return `<button class="btn ${style}" data-action="${action}"${copyAttr}>${escapeHtml(b.label)}</button>`;
		})
		.join("");
}

function getPanelHtml(data) {
	const title = escapeHtml(data.title || "通知");
	const hasBodyHtml = !!data.bodyHtml;

	let bodyContent;
	if (hasBodyHtml) {
		bodyContent = data.bodyHtml;
	} else {
		const subtitle = data.subtitle || "";
		const subtitleHtml = subtitle ? renderSimpleMarkdown(subtitle) : "";
		const linksHtml = buildLinksHtml(data.links);
		bodyContent = `${subtitleHtml ? `<div class="subtitle">${subtitleHtml}</div>` : ""}${linksHtml}`;
	}

	const buttonsHtml = buildButtonsHtml(data);

	return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
	*{margin:0;padding:0;box-sizing:border-box}
	html,body{
		background:transparent!important;
		font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
		-webkit-font-smoothing:antialiased;
		height:100%;
		overflow:hidden;
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
	.header{
		display:flex;
		align-items:center;
		gap:10px;
		padding:14px 14px 8px;
		flex-shrink:0;
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
	.title-wrap{flex:1;min-width:0}
	.title{
		font-size:13px;
		font-weight:700;
		color:#1e1b4b;
		letter-spacing:-.01em;
		line-height:1.2;
	}
	.body{
		flex:1;
		min-height:0;
		overflow-y:auto;
		padding:0 14px 8px;
	}
	.body::-webkit-scrollbar{width:4px}
	.body::-webkit-scrollbar-track{background:transparent}
	.body::-webkit-scrollbar-thumb{background:#d4d4d8;border-radius:2px}
	.body::-webkit-scrollbar-thumb:hover{background:#a1a1aa}
	.subtitle{
		font-size:11.5px;
		color:#475569;
		line-height:1.55;
		white-space:pre-wrap;
		word-break:break-word;
	}
	.links{
		margin-top:8px;
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
		flex-shrink:0;
		padding:6px 14px 10px;
		display:flex;
		gap:6px;
	}
	.btn{
		flex:1;
		padding:7px 0;
		border:none;
		border-radius:8px;
		font-size:11.5px;
		font-weight:700;
		cursor:pointer;
		letter-spacing:.02em;
		transition:all .15s ease;
	}
	.btn-primary{
		background:linear-gradient(135deg,#818cf8,#a78bfa);
		color:#fff;
		box-shadow:0 2px 8px -2px rgba(129,140,248,.4);
	}
	.btn-primary:hover{
		transform:translateY(-1px);
		box-shadow:0 4px 12px -2px rgba(129,140,248,.5);
		background:linear-gradient(135deg,#7c83f5,#a07af7);
	}
	.btn-primary:active{
		transform:translateY(0);
		box-shadow:0 1px 4px -1px rgba(129,140,248,.35);
	}
	.btn-secondary{
		background:#f1f5f9;
		color:#64748b;
		border:1px solid #e2e8f0;
	}
	.btn-secondary:hover{
		background:#e2e8f0;
		color:#475569;
	}
	.btn-success{
		background:linear-gradient(135deg,#34d399,#10b981)!important;
		color:#fff!important;
		border:none!important;
	}

	/* ── Demo rich content styles ── */
	.d-section{margin-bottom:10px}
	.d-label{font-size:11px;font-weight:700;color:#1e1b4b;margin-bottom:5px}
	.d-text{font-size:11px;color:#475569;line-height:1.55}
	.d-divider{height:1px;background:#e5e7eb;margin:10px 0}
	.d-muted{font-size:10px;color:#94a3b8}
	.d-warn{background:#fef3c7;border-left:3px solid #f59e0b;padding:8px 10px;border-radius:0 6px 6px 0;font-size:11px;color:#92400e;margin:8px 0;line-height:1.5}
	.d-info{background:#eff6ff;border-left:3px solid #3b82f6;padding:8px 10px;border-radius:0 6px 6px 0;font-size:11px;color:#1e40af;margin:8px 0;line-height:1.5}
	.d-ok{background:#ecfdf5;border-left:3px solid #10b981;padding:8px 10px;border-radius:0 6px 6px 0;font-size:11px;color:#065f46;margin:8px 0;line-height:1.5}
	.d-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin:8px 0}
	.d-msg{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px;margin:8px 0;font-size:11.5px;color:#166534;white-space:pre-wrap;line-height:1.6}

	/* Timeline */
	.d-tl{padding-left:18px;margin:6px 0}
	.d-tl-item{position:relative;padding:0 0 10px 0;font-size:11px;color:#475569;line-height:1.5}
	.d-tl-item::before{content:'';position:absolute;left:-14px;top:5px;width:8px;height:8px;border-radius:50%;background:#818cf8;border:2px solid #e0e7ff}
	.d-tl-item::after{content:'';position:absolute;left:-11px;top:15px;width:2px;height:calc(100% - 10px);background:#e0e7ff}
	.d-tl-item:last-child::after{display:none}
	.d-tl-item:last-child{padding-bottom:0}
	.d-tl-time{font-weight:700;color:#1e1b4b}
	.d-tl-meta{font-size:10px;color:#94a3b8;margin-top:1px}
	.d-tl-item.conflict::before{background:#ef4444;border-color:#fee2e2}
	.d-tl-item.active::before{background:#10b981;border-color:#d1fae5}
	.d-tl-item.travel::before{background:#f59e0b;border-color:#fef3c7}

	/* Table */
	.d-table{width:100%;border-collapse:collapse;font-size:10.5px;margin:6px 0}
	.d-table th{text-align:left;padding:5px 6px;background:#f1f5f9;color:#64748b;font-weight:600;border-bottom:2px solid #e2e8f0}
	.d-table td{padding:5px 6px;border-bottom:1px solid #f1f5f9;color:#475569}
	.d-table tr.hl td{background:#fef9ee}
	.d-table tr.best td{background:#f0fdf4;font-weight:600}
	.d-table .star{color:#f59e0b}

	/* Plan cards */
	.d-plan{border:1px solid #e2e8f0;border-radius:8px;margin:8px 0;overflow:hidden}
	.d-plan-hd{padding:8px 10px;font-size:11.5px;font-weight:700;color:#1e1b4b;background:#f8fafc;border-bottom:1px solid #e2e8f0}
	.d-plan-bd{padding:8px 10px;font-size:11px;color:#475569;line-height:1.6}
	.d-plan .pro{color:#059669;font-size:10.5px;margin-top:4px}
	.d-plan .con{color:#dc2626;font-size:10.5px;margin-top:2px}
	.d-plan.selected{border-color:#818cf8;box-shadow:0 0 0 1px #818cf8}

	/* File card */
	.d-file{display:flex;gap:10px;align-items:flex-start;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin:8px 0}
	.d-file-icon{font-size:28px;flex-shrink:0}
	.d-file-body{flex:1;font-size:11px;color:#475569}
	.d-file-name{font-weight:700;color:#1e1b4b;font-size:12px;margin-bottom:4px}

	/* Source tree */
	.d-tree{font-size:10.5px;color:#475569;line-height:1.8;font-family:Consolas,Monaco,monospace;margin:6px 0}
	.d-tree .t-icon{margin-right:3px}
	.d-tree .t-indent{padding-left:16px}
	.d-tree .t-hl{color:#1e1b4b;font-weight:600}

	/* Tag / badge */
	.d-tag{display:inline-block;font-size:9.5px;padding:1px 6px;border-radius:4px;font-weight:600}
	.d-tag-purple{background:#ede9fe;color:#6d28d9}
	.d-tag-green{background:#d1fae5;color:#065f46}
	.d-tag-yellow{background:#fef3c7;color:#92400e}
	.d-tag-red{background:#fee2e2;color:#991b1b}
	.d-tag-blue{background:#dbeafe;color:#1e40af}

	/* Info rows */
	.d-row{display:flex;justify-content:space-between;font-size:11px;color:#475569;padding:3px 0;border-bottom:1px solid #f1f5f9}
	.d-row:last-child{border-bottom:none}
	.d-row-k{color:#94a3b8}
	.d-row-v{font-weight:600}

	/* Toast for copy feedback */
	.copy-toast{
		position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);
		background:rgba(16,185,129,.95);color:#fff;padding:10px 20px;border-radius:10px;
		font-size:13px;font-weight:700;pointer-events:none;z-index:9999;
		transition:transform .2s cubic-bezier(.34,1.56,.64,1);
	}
	.copy-toast.show{transform:translate(-50%,-50%) scale(1)}
</style>
</head>
<body>
<div class="panel">
	<div class="card">
		<div class="header">
			<div class="avatar">
				<img src="${avatarBase64}" alt="" />
			</div>
			<div class="title-wrap">
				<div class="title">${title}</div>
			</div>
		</div>
		<div class="body">
			${bodyContent}
		</div>
		<div class="bottom">
			${buttonsHtml}
		</div>
	</div>
</div>
<div class="copy-toast" id="copyToast">✅ 已复制到剪贴板</div>
<script>
	document.querySelectorAll('.btn').forEach(function(el){
		el.addEventListener('click', function(e){
			e.preventDefault();
			var action = el.getAttribute('data-action') || 'close';
			if(action === 'copy'){
				var text = el.getAttribute('data-copy') || '';
				if(text && window.__copyToClipboard){
					window.__copyToClipboard(text);
					var toast = document.getElementById('copyToast');
					toast.classList.add('show');
					el.classList.add('btn-success');
					el.textContent = '✅ 已复制';
					setTimeout(function(){
						toast.classList.remove('show');
						setTimeout(function(){ window.__electronConfirm && window.__electronConfirm(); }, 600);
					}, 800);
				}
			} else {
				window.__electronConfirm && window.__electronConfirm();
			}
		});
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

	const WIDTH = data.width || DEFAULT_WIDTH;
	const HEIGHT = data.height || estimateHeight(data);
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

	ipcMain.on("copy-to-clipboard", (_event, text) => {
		clipboard.writeText(text);
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
