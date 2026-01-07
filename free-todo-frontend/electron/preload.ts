import { contextBridge, ipcRenderer } from "electron";

/**
 * 通知数据接口
 */
export interface NotificationData {
	id: string;
	title: string;
	content: string;
	timestamp: string;
}

/**
 * 暴露给渲染进程的 Electron API
 */
const electronAPI = {
	/**
	 * 显示系统通知
	 * @param data 通知数据
	 * @returns Promise<void>
	 */
	showNotification: (data: NotificationData): Promise<void> => {
		return ipcRenderer.invoke("show-notification", data);
	},

	// ========== 灵动岛相关 API ==========

	/**
	 * 通知主进程透明背景已就绪
	 */
	transparentBackgroundReady: (): void => {
		ipcRenderer.send("transparent-background-ready");
	},

	/**
	 * 设置窗口是否忽略鼠标事件（用于透明窗口点击穿透）
	 * @param ignore 是否忽略
	 * @param options 选项
	 */
	setIgnoreMouseEvents: (
		ignore: boolean,
		options?: { forward?: boolean },
	): Promise<void> => {
		return ipcRenderer.invoke("set-ignore-mouse-events", ignore, options);
	},

	/**
	 * 折叠窗口到小尺寸（FLOAT 模式）
	 */
	collapseWindow: (): Promise<void> => {
		return ipcRenderer.invoke("collapse-window");
	},

	/**
	 * 展开窗口到面板模式（PANEL 模式）
	 */
	expandWindow: (): Promise<void> => {
		return ipcRenderer.invoke("expand-window");
	},

	/**
	 * 展开窗口到全屏模式（FULLSCREEN 模式）
	 */
	expandWindowFull: (): Promise<void> => {
		return ipcRenderer.invoke("expand-window-full");
	},

	/**
	 * 调整窗口大小
	 * @param dx X 方向变化量
	 * @param dy Y 方向变化量
	 * @param pos 调整位置（right, left, bottom, top, top-right, top-left, bottom-right, bottom-left）
	 */
	resizeWindow: (
		dx: number,
		dy: number,
		pos: string,
	): Promise<void> => {
		return ipcRenderer.invoke("resize-window", dx, dy, pos);
	},

	/**
	 * 退出应用
	 */
	quit: (): Promise<void> => {
		return ipcRenderer.invoke("app-quit");
	},

	/**
	 * 移动窗口到指定位置
	 * @param x X 坐标
	 * @param y Y 坐标
	 */
	moveWindow: (x: number, y: number): Promise<void> => {
		return ipcRenderer.invoke("move-window", x, y);
	},

	/**
	 * 获取窗口当前位置
	 * @returns 窗口位置
	 */
	getWindowPosition: (): Promise<{ x: number; y: number }> => {
		return ipcRenderer.invoke("get-window-position");
	},

	/**
	 * 获取屏幕信息
	 * @returns 屏幕尺寸
	 */
	getScreenInfo: (): Promise<{ screenWidth: number; screenHeight: number }> => {
		return ipcRenderer.invoke("get-screen-info");
	},
};

// 安全地暴露 API 到渲染进程
contextBridge.exposeInMainWorld("electronAPI", electronAPI);
