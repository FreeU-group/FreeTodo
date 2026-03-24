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
		return '<button class="btn btn-primary" data-action="close">确认</button>';
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
		border-radius:10px;
		background:rgba(255,255,255,.98);
		backdrop-filter:blur(20px);
		-webkit-backdrop-filter:blur(20px);
		box-shadow:
			0 8px 24px -4px rgba(0,0,0,.12),
			0 3px 8px -2px rgba(0,0,0,.06),
			0 0 0 1px rgba(0,0,0,.05);
		overflow:hidden;
	}
	.header{
		display:flex;
		align-items:center;
		gap:10px;
		padding:16px 16px 10px;
		flex-shrink:0;
	}
	.avatar{
		width:32px;height:32px;
		border-radius:10px;
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
		font-size:14px;
		font-weight:700;
		color:#1e1b4b;
		letter-spacing:-.01em;
		line-height:1.2;
	}
	.body{
		flex:1;
		min-height:0;
		overflow-y:auto;
		padding:0 16px 10px;
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
		padding:10px 16px 14px;
		display:flex;
		gap:8px;
	}
	.btn{
		flex:1;
		padding:8px 0;
		border:none;
		border-radius:10px;
		font-size:12px;
		font-weight:600;
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
		background:#f8fafc;
		color:#64748b;
		border:1px solid #e2e8f0;
	}
	.btn-secondary:hover{
		background:#f1f5f9;
		color:#475569;
	}
	.btn-success{
		background:linear-gradient(135deg,#34d399,#10b981)!important;
		color:#fff!important;
		border:none!important;
	}

	/* ── Demo rich content styles (Upgraded Modern UI) ── */
	.d-section{margin-bottom:12px}
	.d-label{font-size:12px;font-weight:700;color:#1e1b4b;margin-bottom:8px;display:flex;align-items:center;gap:4px}
	.d-text{font-size:12px;color:#475569;line-height:1.6}
	.d-divider{height:1px;background:linear-gradient(90deg, transparent, rgba(226,232,240,0.8), transparent);margin:14px 0}
	.d-muted{font-size:11px;color:#94a3b8}

	/* Alerts */
	.d-alert{display:flex;gap:10px;padding:12px 14px;border-radius:12px;margin:10px 0;font-size:11.5px;line-height:1.5;border:1px solid transparent}
	.d-alert-warn{background:#fffbeb;border-color:#fef3c7;color:#92400e}
	.d-alert-info{background:#f0f9ff;border-color:#e0f2fe;color:#1e40af}
	.d-alert-ok{background:#f0fdf4;border-color:#dcfce3;color:#166534}
	.d-alert-icon{font-size:16px;flex-shrink:0}
	.d-alert-content{flex:1}

	/* Cards & Messages */
	.d-card{background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin:10px 0;box-shadow:0 4px 12px -4px rgba(0,0,0,0.03)}
	.d-msg{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:14px;margin:10px 0;font-size:12px;color:#334155;white-space:pre-wrap;line-height:1.6;position:relative;overflow:hidden}
	.d-msg::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:linear-gradient(to bottom,#818cf8,#a78bfa)}

	/* Modern Timeline */
	.d-tl{padding-left:22px;margin:10px 0}
	.d-tl-item{position:relative;padding:0 0 16px 0;font-size:11.5px;color:#475569;line-height:1.5}
	.d-tl-item::before{content:'';position:absolute;left:-19px;top:5px;width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid #cbd5e1;box-shadow:0 0 0 2px #fff;z-index:2}
	.d-tl-item::after{content:'';position:absolute;left:-14px;top:17px;width:2px;height:calc(100% - 12px);background:#e2e8f0;z-index:1}
	.d-tl-item:last-child::after{display:none}
	.d-tl-item:last-child{padding-bottom:0}
	.d-tl-time{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-weight:600;color:#1e1b4b;font-size:11px;letter-spacing:-0.3px}
	.d-tl-meta{font-size:10.5px;color:#94a3b8;margin-top:4px;display:flex;align-items:center;gap:4px}
	.d-tl-item.conflict::before{border-color:#ef4444;background:#fee2e2}
	.d-tl-item.active::before{border-color:#8b5cf6;background:#e0e7ff}
	.d-tl-item.travel::before{border-color:#f59e0b;background:#fef3c7}

	/* Modern List Items (Replaces Tables) */
	.d-list{display:flex;flex-direction:column;gap:8px;margin:10px 0}
	.d-list-item{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;transition:all 0.2s}
	.d-list-item:hover{background:#f1f5f9;border-color:#cbd5e1}
	.d-list-item.best{background:linear-gradient(to right, #fefce8, #fffbeb);border-color:#fde68a;box-shadow:0 4px 12px -4px rgba(245,158,11,0.15)}
	.d-list-main{flex:1;min-width:0}
	.d-list-title{font-size:12px;font-weight:600;color:#1e1b4b;display:flex;align-items:center;gap:6px;margin-bottom:3px}
	.d-list-desc{font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
	.d-list-right{font-size:11.5px;font-weight:500;color:#475569;text-align:right;flex-shrink:0;margin-left:12px}

	/* Plan cards */
	.d-plan{border:1px solid #e2e8f0;border-radius:14px;margin:12px 0;overflow:hidden;background:#fff;transition:all 0.2s;box-shadow:0 2px 8px -2px rgba(0,0,0,0.02)}
	.d-plan:hover{border-color:#cbd5e1;box-shadow:0 6px 16px -4px rgba(0,0,0,0.08);transform:translateY(-1px)}
	.d-plan-hd{padding:12px 14px;font-size:12px;font-weight:700;color:#1e1b4b;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;gap:6px}
	.d-plan-bd{padding:14px}
	.d-plan .pro{color:#059669;font-size:11px;margin-top:10px;display:flex;align-items:flex-start;gap:6px;background:#ecfdf5;padding:8px 10px;border-radius:8px;border:1px solid #d1fae5}
	.d-plan .con{color:#dc2626;font-size:11px;margin-top:6px;display:flex;align-items:flex-start;gap:6px;background:#fef2f2;padding:8px 10px;border-radius:8px;border:1px solid #fee2e2}

	/* File card */
	.d-file{display:flex;gap:14px;align-items:center;background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:14px;margin:10px 0;box-shadow:0 4px 12px -4px rgba(0,0,0,0.04)}
	.d-file-icon{font-size:36px;flex-shrink:0;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.08))}
	.d-file-body{flex:1;font-size:11.5px;color:#475569}
	.d-file-name{font-weight:700;color:#1e1b4b;font-size:13px;margin-bottom:6px;word-break:break-all}

	/* Source tree */
	.d-tree{font-size:11.5px;color:#475569;line-height:1.8;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;margin:10px 0;background:#f8fafc;padding:14px;border-radius:12px;border:1px solid #e2e8f0}
	.d-tree .t-icon{margin-right:6px;font-size:13px}
	.d-tree .t-indent{padding-left:20px;position:relative}
	.d-tree .t-indent::before{content:'';position:absolute;left:7px;top:0;bottom:0;width:1.5px;background:#cbd5e1}
	.d-tree .t-hl{color:#1e1b4b;font-weight:600}

	/* Tag / badge */
	.d-tag{display:inline-flex;align-items:center;font-size:10px;padding:3px 8px;border-radius:8px;font-weight:600;line-height:1.2}
	.d-tag-purple{background:#ede9fe;color:#6d28d9;border:1px solid #ddd6fe}
	.d-tag-green{background:#dcfce3;color:#166534;border:1px solid #bbf7d0}
	.d-tag-yellow{background:#fef3c7;color:#92400e;border:1px solid #fde68a}
	.d-tag-red{background:#fee2e2;color:#991b1b;border:1px solid #fecaca}
	.d-tag-blue{background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe}

	/* Info rows */
	.d-row{display:flex;justify-content:space-between;align-items:center;font-size:11.5px;color:#475569;padding:6px 0;border-bottom:1px dashed #cbd5e1}
	.d-row:last-child{border-bottom:none}
	.d-row-k{color:#64748b}
	.d-row-v{font-weight:600;color:#1e1b4b}

	/* Hide empty icon containers after emoji stripping */
	.t-icon:empty,.d-alert-icon:empty,.d-file-icon:empty{display:none}

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
