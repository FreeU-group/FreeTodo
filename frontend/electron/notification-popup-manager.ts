import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain, screen } from "electron";
import { logger } from "./logger";
import { getBackendUrl } from "./next-server";
import {
	type PopupExecutionSessionPayload,
	postIntentAction,
} from "./notification-popup-api";
import { NotificationPopupDeduper } from "./notification-popup-dedupe";
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

type QueueState = "idle" | "showing" | "transitioning";

export class NotificationPopupManager {
	private popupWindow: BrowserWindow | null = null;
	private hideTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private fadeTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private avatarBase64 = "";
	private currentPopup: InteractivePopupData | null = null;
	private queueState: QueueState = "idle";
	private queue: InteractivePopupData[] = [];
	private seenActionIds: Set<string> = new Set();
	private deduper = new NotificationPopupDeduper();
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
			backgroundColor: "#00000000",
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
		const html = getNotificationPopupHtml(
			this.avatarBase64,
			TOAST_DURATION_MS,
			getBackendUrl(),
		);
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
	}

	private suppressFutureDuplicates(actionId: string): void {
		this.deduper.suppressFutureDuplicates(actionId);
	}

	private showExecutePreparing(): void {
		this.resizeAndReposition(POPUP_HEIGHT_PROGRESS);
		this.setInteractive(true);
		if (!this.popupWindow || this.popupWindow.isDestroyed()) return;
		this.popupWindow.showInactive();
		this.popupWindow.webContents.executeJavaScript(
			`(function(){
				var badge=document.getElementById('status-badge');
				badge.textContent='执行中';
				badge.className='status-badge executing';
				document.getElementById('meta-row').textContent='正在建立执行会话，这个弹窗会直接进入聊天执行。';
				document.getElementById('actions').innerHTML='';
				document.getElementById('progress-area').className='progress-area visible';
				var ra=document.getElementById('result-area');
				ra.className='result-area visible';
				ra.textContent='正在连接执行会话...';
			})();`,
		).catch(() => {});
	}

	private showInlineError(message: string): void {
		if (this.currentPopup) {
			this.renderInteractive(this.currentPopup);
		}
		this.popupWindow?.webContents.executeJavaScript(
			`(function(){
				var badge=document.getElementById('status-badge');
				badge.textContent='待确认';
				badge.className='status-badge pending';
				document.getElementById('meta-row').textContent='${escapePopupText(message)}';
				var ra=document.getElementById('result-area');
				ra.className='result-area visible';
				ra.textContent='${escapePopupText(message)}';
			})();`,
		).catch(() => {});
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
		if (this.deduper.shouldSuppress(data)) {
			logger.info(
				`[FLOW][Popup] 内容去重命中, 跳过重复弹窗: actionId=${data.actionId}`,
			);
			return;
		}
		this.seenActionIds.add(data.actionId);
		this.deduper.remember(data);
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

	private switchToExecutionChat(
		actionId: string,
		payload: PopupExecutionSessionPayload,
	): void {
		this.queueState = "showing";
		this.resizeAndReposition(POPUP_HEIGHT_PROGRESS);
		this.setInteractive(true);
		this.popupWindow?.showInactive();
		const executionPayload = {
			...payload,
			action_id: actionId,
		};
		const serialized = JSON.stringify(executionPayload);
		this.popupWindow?.webContents.executeJavaScript(
			`(function(){
				if (typeof window.startExecutionChat === 'function') {
					window.startExecutionChat(${serialized});
					return true;
				}
				return false;
			})();`,
		).then((started) => {
			if (!started) {
				this.popupWindow?.webContents.send("start-execution-chat", executionPayload);
			}
		}).catch((error) => {
			logger.error(
				`[FLOW][Popup] 进入执行聊天窗口失败: ${error instanceof Error ? error.message : String(error)}`,
			);
			this.showInlineError("执行聊天窗口初始化失败，请重试。");
		});
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
						this.suppressFutureDuplicates(actionId);
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
					this.suppressFutureDuplicates(actionId);
					logger.info(`[FLOW][Popup] ✓ reject完成 → 关闭弹窗`);
					this.finishCurrentAndNext("已忽略", 500);
					return;
				}

				if (action === "execute") {
					this.showExecutePreparing();
					logger.info(`[FLOW][Popup] → 调用 POST /api/intent-actions/${actionId}/execute`);
					const result = await postIntentAction(baseUrl, actionId, "execute");
					logger.info(`[FLOW][Popup] ← execute响应: HTTP ${result.status}`);
					if (result.status >= 200 && result.status < 300 && result.success !== false) {
						const payload = result.data as PopupExecutionSessionPayload | null;
						if (payload?.session_id && payload?.initial_message) {
							this.suppressFutureDuplicates(actionId);
							logger.info(`[FLOW][Popup] ✓ execute成功 → 进入执行聊天窗口`);
							this.switchToExecutionChat(actionId, payload);
						} else {
							logger.error("[FLOW][Popup] execute成功但缺少会话数据");
							this.showInlineError("执行会话初始化失败，请重试。");
						}
					} else if (result.status === 409) {
						const payload = result.data as PopupExecutionSessionPayload | null;
						if (payload?.session_id) {
							this.suppressFutureDuplicates(actionId);
							logger.info("[FLOW][Popup] execute返回409但已有会话 → 恢复执行聊天窗口");
							this.switchToExecutionChat(actionId, payload);
						} else {
							this.showInlineError("该任务当前不可执行。");
						}
					} else {
						const execErr = (): string => {
							if (result.message) return String(result.message);
							if (typeof result.detail === "string") return result.detail;
							return result.status === 404 ? "操作已过期" : `执行失败 (${result.status})`;
						};
						logger.error(
							`[FLOW][Popup] ✗ execute失败: HTTP ${result.status}, body=${result.body.slice(0, 200)}`,
						);
						this.showInlineError(execErr());
					}
					return;
				}
		} catch (error) {
			logger.error(`[FLOW][Popup] ✗ 网络异常: ${error instanceof Error ? error.message : String(error)}`);
			this.showInlineError("网络错误，请稍后重试。");
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
