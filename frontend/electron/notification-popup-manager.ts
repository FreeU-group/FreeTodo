import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain, screen } from "electron";
import { logger } from "./logger";
import { getBackendUrl } from "./next-server";
import {
	fetchIntentProgress,
	type PopupProgressResponse,
	postIntentAction,
} from "./notification-popup-api";
import {
	escapePopupText,
	getNotificationPopupHtml,
	renderPopupSection,
	renderPopupStep,
} from "./notification-popup-view";

const TOAST_DURATION_MS = 3_000;
const POPUP_WIDTH = 400;
const POPUP_HEIGHT_TOAST = 120;
const POPUP_HEIGHT_INTERACTIVE = 300;
const POPUP_HEIGHT_PROGRESS = 520;
const MARGIN = 16;
interface PopupConfig {
	enabled: boolean;
}

export interface PopupData {
	title?: string;
	message?: string;
}

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
	private currentPopup: InteractivePopupData | null = null;
	private queueState: QueueState = "idle";
	private queue: InteractivePopupData[] = [];
	private seenActionIds: Set<string> = new Set();
	private readonly MAX_SEEN = 200;

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
		const html = getNotificationPopupHtml(this.avatarBase64, TOAST_DURATION_MS);
		this.popupWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
		this.popupWindow.on("closed", () => { this.popupWindow = null; });
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

	private processQueue(): void {
		const next = this.queue.shift();
		if (!next) {
			this.queueState = "idle";
			this.currentPopup = null;
			this.hideNow();
			logger.info("[Queue] Empty, state → idle");
			return;
		}

		this.queueState = "showing";
		this.currentPopup = next;
		logger.info(`[Queue] Showing "${next.title}", remaining=${this.queue.length}`);
		this.renderInteractive(next);
	}

	private finishCurrentAndNext(message: string, delayMs: number = 1200): void {
		this.queueState = "transitioning";

		this.popupWindow?.webContents.executeJavaScript(
			`(function(){
				document.getElementById('notif-title').textContent='${escapePopupText(message)}';
				document.getElementById('notif-desc').textContent='';
				document.getElementById('actions').innerHTML='';
			})();`
		).catch(() => {});

		setTimeout(() => {
			this.hideNow();
			setTimeout(() => this.processQueue(), 200);
		}, delayMs);
	}

	private renderInteractive(data: InteractivePopupData): void {
		this.clearTimers();

		if (!this.popupWindow || this.popupWindow.isDestroyed()) this.createWindow(POPUP_HEIGHT_INTERACTIVE);
		this.resizeAndReposition(POPUP_HEIGHT_INTERACTIVE);
		this.setInteractive(true);

		const remaining = this.queue.length;
		const badge = remaining > 0 ? ` (还有 ${remaining} 条)` : "";
		const title = escapePopupText(data.title + badge);
		const desc = escapePopupText(data.description);
		const aid = escapePopupText(data.actionId);
		const meta = data.actionType === "executable" ? "识别为可直接执行的任务" : "识别为待确认待办";
		const planSection =
			data.actionType === "executable"
				? renderPopupSection(
						"预期执行计划",
						(data.executionPlan || []).map((step) =>
							renderPopupStep(step, "pending"),
						),
						"当前还没有拆出具体步骤，执行时会在这里补充进展。",
					)
				: "";

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

		this.popupWindow?.webContents.executeJavaScript(
			`(function(){
				document.getElementById('notif-title').textContent='${title}';
				document.getElementById('notif-desc').textContent='${desc}';
				document.getElementById('meta-row').textContent='${escapePopupText(meta)}';
				var badge=document.getElementById('status-badge');
				badge.textContent='待确认';
				badge.className='status-badge pending';
				document.getElementById('actions').innerHTML=\`${buttonsHtml}\`;
				var pa=document.getElementById('progress-area');
				pa.className='${planSection ? "progress-area visible" : "progress-area"}';
				pa.innerHTML=\`${planSection}\`;
				document.getElementById('result-area').className='result-area';
				document.getElementById('result-area').textContent='';
				document.getElementById('progress-bar').className='progress-bar';
			})();`
		).catch(() => {});

		this.slideIn();
	}

	private switchToProgressMode(actionId: string): void {
		logger.info(`[FLOW][Popup] 切换到进度模式: actionId=${actionId}, 开始每秒轮询进度`);
		this.queueState = "progress";
		this.resizeAndReposition(POPUP_HEIGHT_PROGRESS);

		this.popupWindow?.webContents.executeJavaScript(
			`(function(){
				document.getElementById('notif-title').textContent='${escapePopupText(this.currentPopup?.title || "正在执行...")}';
				var badge=document.getElementById('status-badge');
				badge.textContent='执行中';
				badge.className='status-badge executing';
				document.getElementById('notif-desc').textContent='${escapePopupText(this.currentPopup?.description || "")}';
				document.getElementById('meta-row').textContent='工作会直接在这个弹窗里持续显示，完成后可手动关闭。';
				document.getElementById('actions').innerHTML='';
				document.getElementById('progress-area').className='progress-area visible';
				document.getElementById('progress-area').innerHTML='';
				var ra = document.getElementById('result-area');
				ra.className = 'result-area visible';
				ra.textContent = '启动中...';
			})();`
		).catch(() => {});

		this.startProgressPolling(actionId);
	}

	private showExecutionFinished(data: PopupProgressResponse): void {
		const success = data.status === "completed";
		this.queueState = "showing";
		this.popupWindow?.webContents.executeJavaScript(
			`(function(){
				document.getElementById('notif-title').textContent='${escapePopupText(data.title || this.currentPopup?.title || "任务完成")}';
				var badge=document.getElementById('status-badge');
				badge.textContent='${success ? "已完成" : "执行失败"}';
				badge.className='status-badge ${success ? "completed" : "failed"}';
				document.getElementById('meta-row').textContent='${escapePopupText(
					success ? "执行结果已保留在下方，关闭后会继续处理下一条弹窗。" : "你可以查看失败信息后关闭，或等待后续重试。",
				)}';
				document.getElementById('actions').innerHTML=\`
					<button class="btn-secondary" onclick="doAction('close','${escapePopupText(data.action_id)}')">关闭</button>
				\`;
			})();`,
		).catch(() => {});
	}

	private startProgressPolling(actionId: string): void {
		if (this.progressPollTimer) clearInterval(this.progressPollTimer);

		const baseUrl = getBackendUrl();

		this.progressPollTimer = setInterval(async () => {
			try {
				const data = await fetchIntentProgress(baseUrl, actionId);
				if (!data) return;

				if (this.popupWindow && !this.popupWindow.isDestroyed()) {
					this.popupWindow.webContents.send("update-progress", data);
				}

				if (data.status === "completed" || data.status === "failed") {
					if (this.progressPollTimer) {
						clearInterval(this.progressPollTimer);
						this.progressPollTimer = null;
					}
					this.showExecutionFinished(data);
				}
			} catch {
				// Network error — will retry on next interval
			}
		}, 1000);
	}

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
					const result = await postIntentAction(baseUrl, actionId, "confirm");
					logger.info(`[FLOW][Popup] ← confirm响应: HTTP ${result.status}`);
					if (result.status >= 200 && result.status < 300 && result.success !== false) {
						logger.info(`[FLOW][Popup] ✓ confirm成功 → 关闭弹窗, 流程结束`);
						this.finishCurrentAndNext("", 0);
					} else {
						const errToast = (): string => {
							if (result.message) return String(result.message);
							if (typeof result.detail === "string") return result.detail;
							return result.status === 404 ? "操作已过期" : `失败 (${result.status})`;
						};
						logger.error(
							`[FLOW][Popup] ✗ confirm失败: HTTP ${result.status}, body=${result.body.slice(0, 200)}`,
						);
						this.finishCurrentAndNext(errToast(), 2000);
					}
					return;
				}

				if (action === "reject") {
					logger.info(`[FLOW][Popup] → 调用 POST /api/intent-actions/${actionId}/reject`);
					await postIntentAction(baseUrl, actionId, "reject").catch(() => null);
					logger.info(`[FLOW][Popup] ✓ reject完成 → 关闭弹窗`);
					this.finishCurrentAndNext("已忽略", 500);
					return;
				}

				if (action === "execute") {
					logger.info(`[FLOW][Popup] → 调用 POST /api/intent-actions/${actionId}/execute`);
					const result = await postIntentAction(baseUrl, actionId, "execute");
					logger.info(`[FLOW][Popup] ← execute响应: HTTP ${result.status}`);
					if (result.status >= 200 && result.status < 300 && result.success !== false) {
						logger.info(`[FLOW][Popup] ✓ execute成功 → 进入进度模式`);
						this.switchToProgressMode(actionId);
					} else if (result.status === 409) {
						logger.info(`[FLOW][Popup] execute返回409(已在执行中, 可能被signal-sensor先处理) → 直接进入进度模式`);
						this.switchToProgressMode(actionId);
					} else {
						const execErr = (): string => {
							if (result.message) return String(result.message);
							if (typeof result.detail === "string") return result.detail;
							return result.status === 404 ? "操作已过期" : `执行失败 (${result.status})`;
						};
						logger.error(
							`[FLOW][Popup] ✗ execute失败: HTTP ${result.status}, body=${result.body.slice(0, 200)}`,
						);
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

	init(): void {
		this.loadAvatar();
		this.createWindow();
		this.registerIpcHandlers();
		logger.info("NotificationPopupManager v3 initialized (queue-based)");
	}

	trigger(data?: PopupData): void {
		const cfg = this.readConfig();
		if (!cfg.enabled) return;

		this.clearTimers();

		if (!this.popupWindow || this.popupWindow.isDestroyed()) this.createWindow(POPUP_HEIGHT_TOAST);
		this.resizeAndReposition(POPUP_HEIGHT_TOAST);
		this.setInteractive(false);

		const title = escapePopupText(data?.title || "待办提醒");
		const message = escapePopupText(data?.message || "检测到新的待办事项");
		this.popupWindow?.webContents.executeJavaScript(
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
