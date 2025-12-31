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
};

// 安全地暴露 API 到渲染进程
contextBridge.exposeInMainWorld("electronAPI", electronAPI);
