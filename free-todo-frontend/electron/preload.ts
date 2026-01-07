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
	transparentBackgroundReady: (): void => {
		ipcRenderer.send("transparent-background-ready");
	},
	setIgnoreMouseEvents: (
		ignore: boolean,
		options?: { forward?: boolean },
	): Promise<void> => ipcRenderer.invoke("set-ignore-mouse-events", ignore, options),
	collapseWindow: (): Promise<void> => ipcRenderer.invoke("collapse-window"),
	expandWindow: (): Promise<void> => ipcRenderer.invoke("expand-window"),
	expandWindowFull: (): Promise<void> => ipcRenderer.invoke("expand-window-full"),
	resizeWindow: (dx: number, dy: number, pos: string): Promise<void> =>
		ipcRenderer.invoke("resize-window", dx, dy, pos),
	moveWindow: (x: number, y: number): Promise<void> =>
		ipcRenderer.invoke("move-window", x, y),
	getWindowPosition: (): Promise<{ x: number; y: number }> =>
		ipcRenderer.invoke("get-window-position"),
	getScreenInfo: (): Promise<{ screenWidth: number; screenHeight: number }> =>
		ipcRenderer.invoke("get-screen-info"),
	quit: (): Promise<void> => ipcRenderer.invoke("app-quit"),
};

// 安全地暴露 API 到渲染进程
contextBridge.exposeInMainWorld("electronAPI", electronAPI);
