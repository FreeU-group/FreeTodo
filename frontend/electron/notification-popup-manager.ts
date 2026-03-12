/**
 * 系统级通知弹窗管理器
 * 事件驱动：当自动待办检测发现新待办时弹出通知，停留 3 秒后自动消失
 * 完全独立于主应用逻辑，不影响现有功能
 */

import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, screen } from "electron";
import { logger } from "./logger";

/** 通知显示持续时间（毫秒）- 3 秒 */
const NOTIFICATION_DURATION_MS = 3_000;
/** 弹窗窗口尺寸 */
const POPUP_WIDTH = 360;
const POPUP_HEIGHT = 120;
/** 距屏幕边缘的间距 */
const MARGIN = 16;

/** 配置文件接口 */
interface PopupConfig {
	enabled: boolean;
}

/** 弹窗内容数据 */
interface PopupData {
	title?: string;
	message?: string;
}

/** 默认弹窗文案 */
const DEFAULT_TITLE = "待办提醒";
const DEFAULT_MESSAGE = "检测到新的待办事项";

/**
 * 系统级通知弹窗管理器
 */
export class NotificationPopupManager {
	private popupWindow: BrowserWindow | null = null;
	private hideTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private fadeTimeoutId: ReturnType<typeof setTimeout> | null = null;
	private avatarBase64 = "";

	/**
	 * 读取配置文件
	 */
	private readConfig(): PopupConfig {
		try {
			const configPath = path.join(__dirname, "..", ".notification-popup.json");
			if (fs.existsSync(configPath)) {
				const raw = fs.readFileSync(configPath, "utf-8");
				const cfg = JSON.parse(raw) as Partial<PopupConfig>;
				return {
					enabled: typeof cfg.enabled === "boolean" ? cfg.enabled : true,
				};
			}
		} catch {
			// 配置文件不存在或解析失败，使用默认值
		}
		return { enabled: true };
	}

	/**
	 * 加载头像图片并转为 base64 数据 URI
	 */
	private loadAvatar(): void {
		try {
			const possiblePaths = [
				// 开发模式：图片在 public/ 目录
				path.join(__dirname, "..", "public", "hi_dog2.png"),
				// 生产模式（打包后）：图片在 resources 目录
				app.isPackaged
					? path.join(process.resourcesPath, "hi_dog2.png")
					: "",
			].filter(Boolean);

			for (const avatarPath of possiblePaths) {
				if (fs.existsSync(avatarPath)) {
					const buffer = fs.readFileSync(avatarPath);
					this.avatarBase64 = `data:image/png;base64,${buffer.toString("base64")}`;
					logger.info(`Notification avatar loaded from: ${avatarPath}`);
					return;
				}
			}

			logger.warn("Notification avatar not found in any expected location");
		} catch (error) {
			logger.error(
				`Failed to load notification avatar: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * 生成通知弹窗 HTML 内容
	 */
	private getNotificationHtml(): string {
		const durationSeconds = NOTIFICATION_DURATION_MS / 1000;
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
		animation:shrink ${durationSeconds}s linear forwards;
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
				<img src="${this.avatarBase64}" alt="Avatar" />
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

	/**
	 * 创建弹窗窗口（创建一次，后续复用）
	 */
	private createWindow(): void {
		if (this.popupWindow && !this.popupWindow.isDestroyed()) {
			return;
		}

		const workArea = screen.getPrimaryDisplay().workArea;

		this.popupWindow = new BrowserWindow({
			width: POPUP_WIDTH,
			height: POPUP_HEIGHT,
			x: workArea.x + MARGIN,
			y: workArea.y + workArea.height - POPUP_HEIGHT - MARGIN,
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

		// 设置为最高层级，确保在所有窗口之上
		this.popupWindow.setAlwaysOnTop(true, "screen-saver");

		// macOS: 在所有工作区可见
		if (process.platform === "darwin") {
			this.popupWindow.setVisibleOnAllWorkspaces(true, {
				visibleOnFullScreen: true,
			});
		}

		// 点击穿透：通知弹窗不拦截鼠标事件，不影响用户操作
		this.popupWindow.setIgnoreMouseEvents(true, { forward: true });

		// 加载通知 HTML
		const html = this.getNotificationHtml();
		this.popupWindow.loadURL(
			`data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
		);

		this.popupWindow.on("closed", () => {
			this.popupWindow = null;
		});

		logger.info("Notification popup window created");
	}

	/**
	 * 安全转义字符串，用于嵌入到 JS 字符串字面量中
	 */
	private static escapeForJs(str: string): string {
		return str
			.replace(/\\/g, "\\\\")
			.replace(/'/g, "\\'")
			.replace(/"/g, '\\"')
			.replace(/\n/g, "\\n")
			.replace(/\r/g, "\\r");
	}

	/**
	 * 显示一次通知
	 * @param data 可选的弹窗内容数据
	 */
	private showNotification(data?: PopupData): void {
		if (!this.popupWindow || this.popupWindow.isDestroyed()) {
			this.createWindow();
		}

		if (!this.popupWindow) return;

		// 重新定位到屏幕左下角（适应屏幕尺寸变化）
		const workArea = screen.getPrimaryDisplay().workArea;
		this.popupWindow.setPosition(
			workArea.x + MARGIN,
			workArea.y + workArea.height - POPUP_HEIGHT - MARGIN,
		);

		const title = NotificationPopupManager.escapeForJs(
			data?.title || DEFAULT_TITLE,
		);
		const message = NotificationPopupManager.escapeForJs(
			data?.message || DEFAULT_MESSAGE,
		);

		// 更新文本内容、重置动画状态并播放入场动画
		this.popupWindow.webContents
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

		// 不抢焦点地显示窗口
		this.popupWindow.showInactive();

		// 清除之前的定时器
		if (this.fadeTimeoutId) clearTimeout(this.fadeTimeoutId);
		if (this.hideTimeoutId) clearTimeout(this.hideTimeoutId);

		// 在持续时间结束前 300ms 播放退场动画
		this.fadeTimeoutId = setTimeout(() => {
			if (this.popupWindow && !this.popupWindow.isDestroyed()) {
				this.popupWindow.webContents
					.executeJavaScript(
						`(function(){
						var p=document.getElementById('popup');
						p.classList.remove('show');
						p.classList.add('hide');
					})();`,
					)
					.catch(() => {});
			}
		}, NOTIFICATION_DURATION_MS - 300);

		// 持续时间结束后隐藏窗口
		this.hideTimeoutId = setTimeout(() => {
			if (this.popupWindow && !this.popupWindow.isDestroyed()) {
				this.popupWindow.hide();
			}
		}, NOTIFICATION_DURATION_MS);
	}

	/**
	 * 初始化弹窗管理器（加载资源，预创建窗口）
	 */
	init(): void {
		this.loadAvatar();
		this.createWindow();

		const cfg = this.readConfig();
		logger.info(
			`Notification popup manager initialized (event-driven, duration: ${NOTIFICATION_DURATION_MS}ms, enabled: ${cfg.enabled})`,
		);
	}

	/**
	 * 触发一次通知弹窗（由外部事件调用，如自动待办检测）
	 * 会检查配置中的 enabled 开关
	 * @param data 可选的弹窗内容数据
	 */
	trigger(data?: PopupData): void {
		const cfg = this.readConfig();
		if (!cfg.enabled) {
			logger.info("Notification popup is disabled, skipping trigger");
			return;
		}
		this.showNotification(data);
	}

	/**
	 * 停止并清理所有资源
	 */
	stop(): void {
		if (this.hideTimeoutId) {
			clearTimeout(this.hideTimeoutId);
			this.hideTimeoutId = null;
		}
		if (this.fadeTimeoutId) {
			clearTimeout(this.fadeTimeoutId);
			this.fadeTimeoutId = null;
		}
		if (this.popupWindow && !this.popupWindow.isDestroyed()) {
			this.popupWindow.close();
			this.popupWindow = null;
		}
		logger.info("Notification popup manager stopped");
	}
}
