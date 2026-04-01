/**
 * 交互式通知弹窗管理器 (v3)
 *
 * 支持三种模式：
 * 1. 简易通知 — 3秒自动消失（向后兼容旧行为）
 * 2. 待办确认 — 展示"确认添加"/"忽略"按钮
 * 3. 任务执行 — 展示"执行"/"仅添加待办"/"忽略"，执行后展示步骤进度
 *
 * v3 改进：
 * - 所有 interactive 弹窗走统一队列，串行弹出
 * - 按 actionId 去重，同一个 action 不会弹两次
 * - 状态机管理（idle / showing / transitioning），杜绝定时器冲突
 */

import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain, screen } from "electron";
import { logger } from "./logger";
import { getBackendUrl } from "./next-server";

const TOAST_DURATION_MS = 3_000;
const POPUP_WIDTH = 400;
const POPUP_HEIGHT_TOAST = 120;
const POPUP_HEIGHT_INTERACTIVE = 220;
const POPUP_HEIGHT_PROGRESS = 320;
const MARGIN = 16;
interface PopupConfig {
	enabled: boolean;
}

/** Legacy toast data (backward compatible) */
export interface PopupData {
	title?: string;
	message?: string;
}

/** Interactive pending-action popup data */
export interface InteractivePopupData {
	actionId: string;
	actionType: "todo" | "executable";
	title: string;
	description: string;
	executionPlan?: string[];
	todoData?: Record<string, unknown>;
}

type QueueState = "idle" | "showing" | "transitioning" | "progress";

export class NotificationPopupManager {
	private popupWindow: BrowserWindow | null = null;
	private hideTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private fadeTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private avatarBase64 = "";
	private progressPollTimer: ReturnType<typeof setInterval> | null = null;

	// ── Queue state machine ──
	private queueState: QueueState = "idle";
	private queue: InteractivePopupData[] = [];
	private seenActionIds: Set<string> = new Set();
	private readonly MAX_SEEN = 200;

	// ── Config ──

	private readConfig(): PopupConfig {
		try {
			const configPath = path.join(__dirname, "..", ".notification-popup.json");
			if (fs.existsSync(configPath)) {
				const raw = fs.readFileSync(configPath, "utf-8");
				const cfg = JSON.parse(raw) as Partial<PopupConfig>;
				return { enabled: typeof cfg.enabled === "boolean" ? cfg.enabled : true };
			}
		} catch { /* use default */ }
		return { enabled: true };
	}

	private loadAvatar(): void {
		try {
			const possiblePaths = [
				path.join(__dirname, "..", "public", "hi_dog2.png"),
				app.isPackaged ? path.join(process.resourcesPath, "hi_dog2.png") : "",
			].filter(Boolean);
			for (const avatarPath of possiblePaths) {
				if (fs.existsSync(avatarPath)) {
					const buffer = fs.readFileSync(avatarPath);
					this.avatarBase64 = `data:image/png;base64,${buffer.toString("base64")}`;
					return;
				}
			}
		} catch (error) {
			logger.error(`Failed to load avatar: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	// ── HTML template ──

	private getPopupHtml(): string {
		return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent!important;overflow:hidden;
  font-family:'Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',sans-serif;
  -webkit-font-smoothing:antialiased;}
.popup-wrapper{position:fixed;bottom:8px;left:8px;right:8px;opacity:0;transform:translateY(30px) scale(.9)}
.popup-wrapper.show{animation:slideIn .45s cubic-bezier(.16,1,.3,1) forwards}
.popup-wrapper.hide{animation:slideOut .3s cubic-bezier(.4,0,1,1) forwards}
@keyframes slideIn{to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes slideOut{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(10px) scale(.95)}}
.card{position:relative;overflow:hidden;border-radius:18px;
  background:rgba(255,255,255,.97);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
  box-shadow:0 20px 44px -8px rgba(0,0,0,.14),0 8px 18px -4px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.04);
  padding:16px 18px}
@media(prefers-color-scheme:dark){
  .card{background:rgba(30,30,30,.95)}
  .title{color:#f1f5f9!important}
  .desc{color:#94a3b8!important}
  .btn-secondary{background:#334155!important;color:#cbd5e1!important}
  .btn-secondary:hover{background:#475569!important}
  .btn-ghost{color:#64748b!important}
  .result-area{background:#1e293b!important;color:#cbd5e1!important}
}
.content{display:flex;align-items:flex-start;gap:14px}
.avatar-ring{width:44px;height:44px;border-radius:50%;padding:2px;
  background:linear-gradient(135deg,#fbbf24,#f97316,#ef4444);flex-shrink:0;margin-top:2px}
.avatar-ring img{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#fff;display:block}
.text-area{flex:1;min-width:0}
.title{font-size:14px;font-weight:700;color:#0f172a;line-height:1.3}
.desc{font-size:12px;color:#64748b;line-height:1.45;margin-top:3px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.actions{display:flex;gap:8px;margin-top:12px;justify-content:flex-end}
.actions button{border:none;border-radius:10px;padding:7px 16px;font-size:12px;font-weight:600;
  cursor:pointer;transition:all .2s}
.btn-primary{background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff}
.btn-primary:hover{filter:brightness(1.1);transform:translateY(-1px)}
.btn-secondary{background:#f1f5f9;color:#475569}
.btn-secondary:hover{background:#e2e8f0}
.btn-execute{background:linear-gradient(135deg,#10b981,#059669);color:#fff}
.btn-execute:hover{filter:brightness(1.1);transform:translateY(-1px)}
.btn-ghost{background:transparent;color:#94a3b8;padding:7px 10px}
.btn-ghost:hover{color:#64748b}
.progress-area{margin-top:12px;display:none}
.progress-area.visible{display:block}
.step{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;color:#64748b}
.step-icon{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  font-size:10px;flex-shrink:0}
.step-pending .step-icon{background:#f1f5f9;color:#94a3b8}
.step-running .step-icon{background:#dbeafe;color:#3b82f6;animation:pulse 1.5s infinite}
.step-done .step-icon{background:#d1fae5;color:#059669}
.step-failed .step-icon{background:#fee2e2;color:#ef4444}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.step-label{flex:1}
.result-area{margin-top:10px;padding:10px;border-radius:10px;background:#f8fafc;
  font-size:12px;color:#334155;line-height:1.5;display:none;max-height:80px;overflow-y:auto}
.result-area.visible{display:block}
.progress-bar{position:absolute;bottom:0;left:0;height:2.5px;background:linear-gradient(90deg,#fbbf24,#f97316);
  border-radius:0 0 0 18px;width:0}
.progress-bar.animate{width:100%;animation:shrink ${TOAST_DURATION_MS / 1000}s linear forwards}
@keyframes shrink{from{width:100%}to{width:0}}
</style></head><body>
<div class="popup-wrapper" id="popup">
  <div class="card">
    <div class="content">
      <div class="avatar-ring"><img src="${this.avatarBase64}" alt="" /></div>
      <div class="text-area">
        <div class="title" id="notif-title"></div>
        <div class="desc" id="notif-desc"></div>
      </div>
    </div>
    <div class="actions" id="actions"></div>
    <div class="progress-area" id="progress-area"></div>
    <div class="result-area" id="result-area"></div>
    <div class="progress-bar" id="progress-bar"></div>
  </div>
</div>
<script>
const { ipcRenderer } = require('electron');
function doAction(action, actionId) {
  ipcRenderer.send('popup-action', { action, actionId });
}
ipcRenderer.on('update-progress', (_e, data) => {
  const area = document.getElementById('progress-area');
  if (!data.steps || !data.steps.length) return;
  area.className = 'progress-area visible';
  area.innerHTML = data.steps.map(s => {
    const icons = { pending:'○', running:'◌', done:'✓', failed:'✗' };
    return '<div class="step step-'+s.status+'"><span class="step-icon">'+(icons[s.status]||'○')+'</span><span class="step-label">'+s.label+'</span></div>';
  }).join('');
  if (data.result) {
    const ra = document.getElementById('result-area');
    ra.className = 'result-area visible';
    ra.textContent = data.result;
  }
});
</script>
</body></html>`;
	}

	// ── Window management ──

	private createWindow(height: number = POPUP_HEIGHT_TOAST): void {
		if (this.popupWindow && !this.popupWindow.isDestroyed()) return;
		const workArea = screen.getPrimaryDisplay().workArea;
		this.popupWindow = new BrowserWindow({
			width: POPUP_WIDTH,
			height,
			x: workArea.x + MARGIN,
			y: workArea.y + workArea.height - height - MARGIN,
			frame: false,
			transparent: true,
			alwaysOnTop: true,
			skipTaskbar: true,
			resizable: false,
			movable: false,
			focusable: false,
			hasShadow: false,
			show: false,
			webPreferences: { nodeIntegration: true, contextIsolation: false },
		});
		this.popupWindow.setAlwaysOnTop(true, "screen-saver");
		if (process.platform === "darwin") {
			this.popupWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
		}
		this.popupWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(this.getPopupHtml())}`);
		this.popupWindow.on("closed", () => { this.popupWindow = null; });
	}

	private static esc(str: string): string {
		return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"')
			.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
	}

	private resizeAndReposition(height: number): void {
		if (!this.popupWindow || this.popupWindow.isDestroyed()) return;
		const workArea = screen.getPrimaryDisplay().workArea;
		this.popupWindow.setSize(POPUP_WIDTH, height);
		this.popupWindow.setPosition(
			workArea.x + MARGIN,
			workArea.y + workArea.height - height - MARGIN,
		);
	}

	private setInteractive(interactive: boolean): void {
		if (!this.popupWindow || this.popupWindow.isDestroyed()) return;
		this.popupWindow.setIgnoreMouseEvents(!interactive, { forward: !interactive });
		this.popupWindow.setFocusable(interactive);
	}

	private clearTimers(): void {
		if (this.fadeTimeoutId) { clearTimeout(this.fadeTimeoutId); this.fadeTimeoutId = null; }
		if (this.hideTimeoutId) { clearTimeout(this.hideTimeoutId); this.hideTimeoutId = null; }
		if (this.progressPollTimer) { clearInterval(this.progressPollTimer); this.progressPollTimer = null; }
	}

	private slideIn(): void {
		if (!this.popupWindow || this.popupWindow.isDestroyed()) return;
		this.popupWindow.webContents.executeJavaScript(
			`(function(){var p=document.getElementById('popup');p.className='popup-wrapper';void p.offsetHeight;p.classList.add('show');})();`
		).catch(() => {});
		this.popupWindow.showInactive();
	}

	/** Hide the popup window completely (no animation, immediate). */
	private hideNow(): void {
		this.clearTimers();
		if (this.popupWindow && !this.popupWindow.isDestroyed()) {
			this.popupWindow.hide();
		}
		this.setInteractive(false);
	}

	private slideOutAndHide(delayMs: number = 0): void {
		this.fadeTimeoutId = setTimeout(() => {
			if (this.popupWindow && !this.popupWindow.isDestroyed()) {
				this.popupWindow.webContents.executeJavaScript(
					`(function(){var p=document.getElementById('popup');p.classList.remove('show');p.classList.add('hide');})();`
				).catch(() => {});
			}
		}, delayMs);
		this.hideTimeoutId = setTimeout(() => {
			if (this.popupWindow && !this.popupWindow.isDestroyed()) {
				this.popupWindow.hide();
			}
			this.setInteractive(false);
		}, delayMs + 350);
	}

	// ── Queue state machine ──

	/**
	 * Enqueue an interactive popup. Deduplicates by actionId.
	 * If idle, immediately shows the first item.
	 */
	triggerInteractive(data: InteractivePopupData): void {
		logger.info(`[FLOW][Popup] 收到弹窗请求: actionId=${data.actionId}, type=${data.actionType}, title="${data.title}"`);
		const cfg = this.readConfig();
		if (!cfg.enabled) {
			logger.info(`[FLOW][Popup] 弹窗已禁用, 跳过`);
			return;
		}

		if (this.seenActionIds.has(data.actionId)) {
			logger.info(`[FLOW][Popup] 去重命中, 跳过: ${data.actionId}`);
			return;
		}
		this.seenActionIds.add(data.actionId);
		if (this.seenActionIds.size > this.MAX_SEEN) {
			const first = this.seenActionIds.values().next().value;
			if (first) this.seenActionIds.delete(first);
		}

		this.queue.push(data);
		logger.info(`[FLOW][Popup] 入队成功: queue=${this.queue.length}, state=${this.queueState}`);

		if (this.queueState === "idle") {
			this.processQueue();
		}
	}

	/** Process the next item in the queue. */
	private processQueue(): void {
		const next = this.queue.shift();
		if (!next) {
			this.queueState = "idle";
			this.hideNow();
			logger.info("[Queue] Empty, state → idle");
			return;
		}

		this.queueState = "showing";
		logger.info(`[Queue] Showing "${next.title}", remaining=${this.queue.length}`);
		this.renderInteractive(next);
	}

	/** After user action, show brief feedback then process next. */
	private finishCurrentAndNext(message: string, delayMs: number = 1200): void {
		this.queueState = "transitioning";

		// Show feedback text
		this.popupWindow?.webContents.executeJavaScript(
			`(function(){
				document.getElementById('notif-title').textContent='${NotificationPopupManager.esc(message)}';
				document.getElementById('notif-desc').textContent='';
				document.getElementById('actions').innerHTML='';
			})();`
		).catch(() => {});

		// After delay, hide and show next
		setTimeout(() => {
			this.hideNow();
			setTimeout(() => this.processQueue(), 200);
		}, delayMs);
	}

	/** Render one interactive popup immediately. */
	private renderInteractive(data: InteractivePopupData): void {
		this.clearTimers();

		if (!this.popupWindow || this.popupWindow.isDestroyed()) this.createWindow(POPUP_HEIGHT_INTERACTIVE);
		this.resizeAndReposition(POPUP_HEIGHT_INTERACTIVE);
		this.setInteractive(true);

		const remaining = this.queue.length;
		const badge = remaining > 0 ? ` (还有 ${remaining} 条)` : "";
		const title = NotificationPopupManager.esc(data.title + badge);
		const desc = NotificationPopupManager.esc(data.description);
		const aid = NotificationPopupManager.esc(data.actionId);

		let buttonsHtml: string;
		if (data.actionType === "executable") {
			buttonsHtml = `
				<button class="btn-execute" onclick="doAction('execute','${aid}')">执行</button>
				<button class="btn-secondary" onclick="doAction('confirm','${aid}')">仅添加待办</button>
				<button class="btn-ghost" onclick="doAction('reject','${aid}')">忽略</button>`;
		} else {
			buttonsHtml = `
				<button class="btn-primary" onclick="doAction('confirm','${aid}')">确认</button>
				<button class="btn-ghost" onclick="doAction('reject','${aid}')">忽略</button>`;
		}

		logger.info(`[FLOW][Popup] 渲染弹窗: actionId=${data.actionId}, type=${data.actionType}, buttons=${data.actionType === "executable" ? "执行/仅添加/忽略" : "确认/忽略"}`);

		this.popupWindow!.webContents.executeJavaScript(
			`(function(){
				document.getElementById('notif-title').textContent='${title}';
				document.getElementById('notif-desc').textContent='${desc}';
				document.getElementById('actions').innerHTML=\`${buttonsHtml}\`;
				document.getElementById('progress-area').className='progress-area';
				document.getElementById('result-area').className='result-area';
				document.getElementById('progress-bar').className='progress-bar';
			})();`
		).catch(() => {});

		this.slideIn();
	}

	// ── Progress mode ──

	private switchToProgressMode(actionId: string): void {
		logger.info(`[FLOW][Popup] 切换到进度模式: actionId=${actionId}, 开始每秒轮询进度`);
		this.queueState = "progress";
		this.resizeAndReposition(POPUP_HEIGHT_PROGRESS);

		this.popupWindow?.webContents.executeJavaScript(
			`(function(){
				document.getElementById('notif-title').textContent='正在执行...';
				document.getElementById('actions').innerHTML='';
				document.getElementById('progress-area').className='progress-area visible';
				document.getElementById('progress-area').innerHTML='<div class="step step-running"><span class="step-icon">◌</span><span class="step-label">启动中...</span></div>';
			})();`
		).catch(() => {});

		this.startProgressPolling(actionId);
	}

	private startProgressPolling(actionId: string): void {
		if (this.progressPollTimer) clearInterval(this.progressPollTimer);

		const baseUrl = getBackendUrl();

		this.progressPollTimer = setInterval(async () => {
			try {
				const res = await fetch(`${baseUrl}/api/intent-actions/${actionId}/progress`);
				if (!res.ok) return;
				const data = await res.json();

				if (this.popupWindow && !this.popupWindow.isDestroyed()) {
					this.popupWindow.webContents.send("update-progress", data);
				}

				if (data.status === "completed" || data.status === "failed") {
					if (this.progressPollTimer) {
						clearInterval(this.progressPollTimer);
						this.progressPollTimer = null;
					}
					const msg = data.status === "completed" ? "✓ 执行完成" : "✗ 执行失败";
					this.finishCurrentAndNext(msg, 3000);
				}
			} catch {
				// Network error — will retry on next interval
			}
		}, 1000);
	}

	// ── IPC handlers ──

	private registerIpcHandlers(): void {
		ipcMain.on("popup-action", async (_event, payload: { action: string; actionId: string }) => {
			const { action, actionId } = payload;

			const baseUrl = getBackendUrl();
			logger.info(`[FLOW][Popup] 用户点击按钮: action=${action}, actionId=${actionId}, backendUrl=${baseUrl}`);

			try {
				if (action === "close") {
					this.finishCurrentAndNext("", 0);
					return;
				}

				if (action === "confirm") {
					logger.info(`[FLOW][Popup] → 调用 POST /api/intent-actions/${actionId}/confirm`);
					const res = await fetch(`${baseUrl}/api/intent-actions/${actionId}/confirm`, { method: "POST" });
					logger.info(`[FLOW][Popup] ← confirm响应: HTTP ${res.status}`);
					const body = await res.text().catch(() => "");
					let parsed: { success?: boolean; message?: string; detail?: unknown } | null = null;
					try {
						parsed = JSON.parse(body) as {
							success?: boolean;
							message?: string;
							detail?: unknown;
						};
					} catch {
						/* 非 JSON */
					}
					if (res.ok && parsed?.success !== false) {
						logger.info(`[FLOW][Popup] ✓ confirm成功 → 关闭弹窗, 流程结束`);
						this.finishCurrentAndNext("", 0);
					} else {
						const errToast = (): string => {
							if (parsed?.message) return String(parsed.message);
							if (typeof parsed?.detail === "string") return parsed.detail;
							return res.status === 404 ? "操作已过期" : `失败 (${res.status})`;
						};
						logger.error(`[FLOW][Popup] ✗ confirm失败: HTTP ${res.status}, body=${body.slice(0, 200)}`);
						this.finishCurrentAndNext(errToast(), 2000);
					}
					return;
				}

				if (action === "reject") {
					logger.info(`[FLOW][Popup] → 调用 POST /api/intent-actions/${actionId}/reject`);
					await fetch(`${baseUrl}/api/intent-actions/${actionId}/reject`, { method: "POST" }).catch(() => {});
					logger.info(`[FLOW][Popup] ✓ reject完成 → 关闭弹窗`);
					this.finishCurrentAndNext("已忽略", 500);
					return;
				}

				if (action === "execute") {
					logger.info(`[FLOW][Popup] → 调用 POST /api/intent-actions/${actionId}/execute`);
					const res = await fetch(`${baseUrl}/api/intent-actions/${actionId}/execute`, { method: "POST" });
					logger.info(`[FLOW][Popup] ← execute响应: HTTP ${res.status}`);
					const body = await res.text().catch(() => "");
					let parsed: { success?: boolean; message?: string; detail?: unknown } | null = null;
					try {
						parsed = JSON.parse(body) as {
							success?: boolean;
							message?: string;
							detail?: unknown;
						};
					} catch {
						/* 非 JSON */
					}
				if (res.ok && parsed?.success !== false) {
					logger.info(`[FLOW][Popup] ✓ execute成功 → 进入进度模式`);
					this.switchToProgressMode(actionId);
				} else if (res.status === 409) {
					logger.info(`[FLOW][Popup] execute返回409(已在执行中, 可能被signal-sensor先处理) → 直接进入进度模式`);
					this.switchToProgressMode(actionId);
				} else {
					const execErr = (): string => {
						if (parsed?.message) return String(parsed.message);
						if (typeof parsed?.detail === "string") return parsed.detail;
						return res.status === 404 ? "操作已过期" : `执行失败 (${res.status})`;
					};
					logger.error(`[FLOW][Popup] ✗ execute失败: HTTP ${res.status}, body=${body.slice(0, 200)}`);
					this.finishCurrentAndNext(execErr(), 2000);
				}
					return;
				}
		} catch (error) {
			logger.error(`[FLOW][Popup] ✗ 网络异常: ${error instanceof Error ? error.message : String(error)}`);
			this.finishCurrentAndNext("网络错误", 1500);
		}
		});
	}

	// ── Public API ──

	init(): void {
		this.loadAvatar();
		this.createWindow();
		this.registerIpcHandlers();
		logger.info("NotificationPopupManager v3 initialized (queue-based)");
	}

	/** Legacy toast notification (3s auto-dismiss). */
	trigger(data?: PopupData): void {
		const cfg = this.readConfig();
		if (!cfg.enabled) return;

		this.clearTimers();

		if (!this.popupWindow || this.popupWindow.isDestroyed()) this.createWindow(POPUP_HEIGHT_TOAST);
		this.resizeAndReposition(POPUP_HEIGHT_TOAST);
		this.setInteractive(false);

		const title = NotificationPopupManager.esc(data?.title || "待办提醒");
		const message = NotificationPopupManager.esc(data?.message || "检测到新的待办事项");
		this.popupWindow!.webContents.executeJavaScript(
			`(function(){
				document.getElementById('notif-title').textContent='${title}';
				document.getElementById('notif-desc').textContent='${message}';
				document.getElementById('actions').innerHTML='';
				document.getElementById('progress-area').className='progress-area';
				document.getElementById('result-area').className='result-area';
				var b=document.getElementById('progress-bar');b.className='progress-bar';void b.offsetHeight;b.classList.add('animate');
			})();`
		).catch(() => {});

		this.slideIn();
		this.slideOutAndHide(TOAST_DURATION_MS - 300);
	}

	stop(): void {
		this.clearTimers();
		this.queue.length = 0;
		if (this.popupWindow && !this.popupWindow.isDestroyed()) {
			this.popupWindow.close();
			this.popupWindow = null;
		}
		logger.info("NotificationPopupManager stopped");
	}
}
