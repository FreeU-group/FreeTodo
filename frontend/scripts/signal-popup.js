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
const MIN_HEIGHT = 220;
const MAX_HEIGHT = 600;
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

function stripEmoji(html) {
	return html
		.replace(/\p{Extended_Pictographic}/gu, "")
		.replace(/\uFE0F/g, "");
}

function applyInlineMarkdown(str) {
	return str
		.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
		.replace(/\*(.+?)\*/g, "<em>$1</em>")
		.replace(
			/`(.+?)`/g,
			'<code style="background:#f1f0fb;padding:1px 4px;border-radius:3px;font-size:10.5px">$1</code>',
		);
}

function renderSimpleMarkdown(str) {
	return applyInlineMarkdown(escapeHtml(stripEmoji(str)));
}

function estimateHeight(data) {
	if (data.height) return data.height;
	if (data.bodyHtml) return Math.min(data.height || 420, MAX_HEIGHT);
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
		return '<button class="btn btn-secondary" data-action="close">忽略</button><button class="btn btn-primary" data-action="close">确认</button>';
	}
	return buttons
		.map((b, _i) => {
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
		bodyContent = applyInlineMarkdown(stripEmoji(data.bodyHtml));
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
	@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
	*{margin:0;padding:0;box-sizing:border-box}
	html,body{
		background:transparent!important;
		font-family:'Inter','Segoe UI',-apple-system,BlinkMacSystemFont,sans-serif;
		-webkit-font-smoothing:antialiased;
		height:100%;
		overflow:hidden;
	}
	.panel{
		position:fixed;
		bottom:0;right:0;left:0;top:0;
		opacity:0;
		transform:translateX(80px) scale(0.95);
		animation:slideIn .4s cubic-bezier(.16,1,.3,1) .05s forwards;
	}
	@keyframes slideIn{
		0%{opacity:0;transform:translateX(80px) scale(0.95)}
		100%{opacity:1;transform:translateX(0) scale(1)}
	}
	.card{
		height:100%;
		display:flex;
		flex-direction:column;
		border-radius:16px;
		background:rgba(24,24,27,.98);
		backdrop-filter:blur(20px);
		-webkit-backdrop-filter:blur(20px);
		box-shadow:0 8px 32px rgba(0,0,0,.5);
		border:1px solid rgba(255,255,255,.1);
		overflow:hidden;
		color:#e2e8f0;
	}
	.header{
		display:flex;
		align-items:center;
		gap:10px;
		padding:14px 16px 10px;
		flex-shrink:0;
		border-bottom:1px solid rgba(255,255,255,.05);
		background:rgba(255,255,255,.02);
	}
	.avatar{
		width:30px;height:30px;
		border-radius:10px;
		overflow:hidden;
		flex-shrink:0;
		padding:5px;
		background:rgba(96,165,250,.15);
		border:1px solid rgba(96,165,250,.2);
		box-shadow:inset 0 1px 2px rgba(0,0,0,.1);
	}
	.avatar img{
		width:100%;height:100%;
		object-fit:cover;
		display:block;
		filter:brightness(1.1);
	}
	.title-wrap{flex:1;min-width:0}
	.title{
		font-size:12px;
		font-weight:600;
		color:#94a3b8;
		letter-spacing:.05em;
		text-transform:uppercase;
		line-height:1.2;
	}
	.close-btn{
		padding:6px;
		border:none;
		background:transparent;
		cursor:pointer;
		border-radius:8px;
		color:#64748b;
		transition:all .15s;
		display:flex;align-items:center;justify-content:center;
	}
	.close-btn:hover{background:rgba(255,255,255,.1);color:#fff}
	.close-btn svg{width:14px;height:14px}
	.body{
		flex:1;
		min-height:0;
		overflow-y:auto;
		padding:16px 20px;
	}
	.body::-webkit-scrollbar{width:4px}
	.body::-webkit-scrollbar-track{background:transparent}
	.body::-webkit-scrollbar-thumb{background:rgba(255,255,255,.15);border-radius:10px}
	.body::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.3)}
	.subtitle{
		font-size:12px;
		color:#94a3b8;
		line-height:1.6;
		white-space:pre-wrap;
		word-break:break-word;
	}
	.links{
		margin-top:10px;
		display:flex;
		flex-direction:column;
		gap:6px;
	}
	.kol-link{
		display:flex;
		align-items:center;
		gap:8px;
		padding:8px 10px;
		border-radius:10px;
		background:rgba(255,255,255,.05);
		border:1px solid rgba(255,255,255,.08);
		cursor:pointer;
		transition:all .15s ease;
		text-decoration:none;
	}
	.kol-link:hover{
		background:rgba(255,255,255,.1);
		border-color:rgba(255,255,255,.15);
		transform:translateX(2px);
	}
	.kol-icon{
		width:20px;height:20px;
		border-radius:6px;
		display:flex;align-items:center;justify-content:center;
		font-size:10px;
		flex-shrink:0;
		color:#fff;
		font-weight:700;
		background:linear-gradient(135deg,#6366f1,#8b5cf6);
	}
	.kol-name{
		font-size:12px;
		font-weight:600;
		color:#e2e8f0;
	}
	.kol-plat{
		margin-left:auto;
		font-size:9px;
		color:#64748b;
		font-weight:500;
	}
	.bottom{
		flex-shrink:0;
		padding:12px 16px 14px;
		display:flex;
		justify-content:flex-end;
		gap:8px;
		border-top:1px solid rgba(255,255,255,.05);
		background:rgba(0,0,0,.2);
	}
	.btn{
		padding:9px 16px;
		border:none;
		border-radius:12px;
		font-size:13px;
		font-weight:500;
		cursor:pointer;
		transition:all .15s ease;
	}
	.btn-primary{
		background:#2563eb;
		color:#fff;
		box-shadow:0 0 15px rgba(37,99,235,.3);
	}
	.btn-primary:hover{
		background:#3b82f6;
		box-shadow:0 0 20px rgba(37,99,235,.5);
		transform:scale(1.02);
	}
	.btn-primary:active{
		transform:scale(0.98);
	}
	.btn-secondary{
		background:rgba(255,255,255,.06);
		color:#cbd5e1;
		border:1px solid rgba(255,255,255,.08);
	}
	.btn-secondary:hover{
		background:rgba(255,255,255,.12);
		color:#fff;
	}
	.btn-success{
		background:linear-gradient(135deg,#059669,#10b981)!important;
		color:#fff!important;
		border:none!important;
	}

	/* ── Demo rich content styles (Dark Glassmorphism) ── */
	.d-section{margin-bottom:12px}
	.d-label{font-size:12px;font-weight:600;color:#e2e8f0;margin-bottom:8px;display:flex;align-items:center;gap:4px}
	.d-text{font-size:12px;color:#94a3b8;line-height:1.6}
	.d-divider{height:1px;background:linear-gradient(90deg, transparent, rgba(255,255,255,.08), transparent);margin:14px 0}
	.d-muted{font-size:11px;color:#64748b}

	/* Alerts */
	.d-alert{display:flex;gap:10px;padding:12px 14px;border-radius:12px;margin:10px 0;font-size:11.5px;line-height:1.5;border:1px solid transparent}
	.d-alert-warn{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.2);color:#fbbf24}
	.d-alert-info{background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.2);color:#60a5fa}
	.d-alert-ok{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.2);color:#34d399}
	.d-alert-icon{font-size:16px;flex-shrink:0}
	.d-alert-content{flex:1}

	/* Cards & Messages */
	.d-card{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;margin:10px 0}
	.d-msg{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px;margin:10px 0;font-size:12px;color:#cbd5e1;white-space:pre-wrap;line-height:1.6;position:relative;overflow:hidden}
	.d-msg::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(to bottom,#6366f1,#8b5cf6)}

	/* Modern Timeline */
	.d-tl{padding-left:22px;margin:10px 0}
	.d-tl-item{position:relative;padding:0 0 16px 0;font-size:11.5px;color:#94a3b8;line-height:1.5}
	.d-tl-item::before{content:'';position:absolute;left:-19px;top:5px;width:12px;height:12px;border-radius:50%;background:rgba(28,28,28,.8);border:2.5px solid #475569;z-index:2}
	.d-tl-item::after{content:'';position:absolute;left:-14px;top:17px;width:2px;height:calc(100% - 12px);background:rgba(255,255,255,.06);z-index:1}
	.d-tl-item:last-child::after{display:none}
	.d-tl-item:last-child{padding-bottom:0}
	.d-tl-time{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-weight:600;color:#e2e8f0;font-size:11px;letter-spacing:-0.3px}
	.d-tl-meta{font-size:10.5px;color:#64748b;margin-top:4px;display:flex;align-items:center;gap:4px}
	.d-tl-item.conflict::before{border-color:#ef4444;background:rgba(239,68,68,.2)}
	.d-tl-item.active::before{border-color:#818cf8;background:rgba(129,140,248,.2)}
	.d-tl-item.travel::before{border-color:#f59e0b;background:rgba(245,158,11,.2)}

	/* Modern List Items */
	.d-list{display:flex;flex-direction:column;gap:8px;margin:10px 0}
	.d-list-item{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;transition:all 0.2s}
	.d-list-item:hover{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.12)}
	.d-list-item.best{background:rgba(245,158,11,.08);border-color:rgba(245,158,11,.2)}
	.d-list-main{flex:1;min-width:0}
	.d-list-title{font-size:12px;font-weight:600;color:#e2e8f0;display:flex;align-items:center;gap:6px;margin-bottom:3px}
	.d-list-desc{font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.d-list-right{font-size:11.5px;font-weight:500;color:#94a3b8;text-align:right;flex-shrink:0;margin-left:12px}

	/* Plan cards */
	.d-plan{border:1px solid rgba(255,255,255,.08);border-radius:14px;margin:12px 0;overflow:hidden;background:rgba(255,255,255,.02);transition:all 0.2s}
	.d-plan:hover{border-color:rgba(255,255,255,.15);background:rgba(255,255,255,.04)}
	.d-plan-hd{padding:12px 14px;font-size:12px;font-weight:700;color:#e2e8f0;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;gap:6px}
	.d-plan-bd{padding:14px}
	.d-plan .pro{color:#34d399;font-size:11px;margin-top:10px;display:flex;align-items:flex-start;gap:6px;background:rgba(16,185,129,.08);padding:8px 10px;border-radius:8px;border:1px solid rgba(16,185,129,.15)}
	.d-plan .con{color:#f87171;font-size:11px;margin-top:6px;display:flex;align-items:flex-start;gap:6px;background:rgba(239,68,68,.08);padding:8px 10px;border-radius:8px;border:1px solid rgba(239,68,68,.15)}

	/* File card */
	.d-file{display:flex;gap:14px;align-items:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:14px;margin:10px 0}
	.d-file-icon{font-size:36px;flex-shrink:0}
	.d-file-body{flex:1;font-size:11.5px;color:#94a3b8}
	.d-file-name{font-weight:700;color:#e2e8f0;font-size:13px;margin-bottom:6px;word-break:break-all}

	/* Source tree */
	.d-tree{font-size:11.5px;color:#94a3b8;line-height:1.8;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;margin:10px 0;background:rgba(255,255,255,.04);padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.06)}
	.d-tree .t-icon{margin-right:6px;font-size:13px}
	.d-tree .t-indent{padding-left:20px;position:relative}
	.d-tree .t-indent::before{content:'';position:absolute;left:7px;top:0;bottom:0;width:1.5px;background:rgba(255,255,255,.08)}
	.d-tree .t-hl{color:#e2e8f0;font-weight:600}

	/* Tag / badge */
	.d-tag{display:inline-flex;align-items:center;font-size:10px;padding:3px 8px;border-radius:8px;font-weight:600;line-height:1.2}
	.d-tag-purple{background:rgba(139,92,246,.15);color:#a78bfa;border:1px solid rgba(139,92,246,.25)}
	.d-tag-green{background:rgba(16,185,129,.12);color:#34d399;border:1px solid rgba(16,185,129,.2)}
	.d-tag-yellow{background:rgba(245,158,11,.12);color:#fbbf24;border:1px solid rgba(245,158,11,.2)}
	.d-tag-red{background:rgba(239,68,68,.12);color:#f87171;border:1px solid rgba(239,68,68,.2)}
	.d-tag-blue{background:rgba(59,130,246,.12);color:#60a5fa;border:1px solid rgba(59,130,246,.2)}

	/* Info rows */
	.d-row{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:#94a3b8;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.05)}
	.d-row:last-child{border-bottom:none}
	.d-row-k{color:#64748b}
	.d-row-v{font-weight:600;color:#e2e8f0}

	/* Hide empty icon containers after emoji stripping */
	.t-icon:empty,.d-alert-icon:empty,.d-file-icon:empty{display:none}

	/* Toast for copy feedback */
	.copy-toast{
		position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) scale(0);
		background:rgba(16,185,129,.9);color:#fff;padding:10px 20px;border-radius:12px;
		font-size:13px;font-weight:600;pointer-events:none;z-index:9999;
		backdrop-filter:blur(20px);box-shadow:0 0 20px rgba(16,185,129,.3);
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
			<button class="close-btn" id="closeBtn" title="关闭">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
			</button>
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
	document.getElementById('closeBtn').addEventListener('click', function(){
		window.__electronConfirm && window.__electronConfirm();
	});
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
		backgroundColor: "#00000000",
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
	const tmpHtml = path.join(require("os").tmpdir(), `signal_popup_${Date.now()}.html`);
	fs.writeFileSync(tmpHtml, html, "utf-8");
	win.loadFile(tmpHtml);
	win.webContents.once("did-finish-load", () => {
		try { fs.unlinkSync(tmpHtml); } catch {}
	});

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
