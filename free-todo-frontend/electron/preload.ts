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
 * 截图并提取待办的响应接口
 */
export interface CaptureAndExtractResponse {
	success: boolean;
	message: string;
	extractedTodos: Array<{
		title: string;
		description?: string;
		confidence: number;
	}>;
	createdCount: number;
}

/** 待办更新事件数据 */
export interface TodosUpdatedData {
	createdCount: number;
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

	/**
	 * 截图并提取待办事项
	 * 截取当前屏幕，发送给后端视觉模型分析，提取待办
	 * @returns Promise<CaptureAndExtractResponse>
	 */
	captureAndExtractTodos: (): Promise<CaptureAndExtractResponse> => {
		return ipcRenderer.invoke("capture-and-extract-todos");
	},

	/**
	 * 获取后端 URL
	 * @returns Promise<string>
	 */
	getBackendUrl: (): Promise<string> => {
		return ipcRenderer.invoke("get-backend-url");
	},

	/**
	 * 切换悬浮窗显示状态
	 * @returns Promise<void>
	 */
	toggleFloatingWindow: (): Promise<void> => {
		return ipcRenderer.invoke("toggle-floating-window");
	},

	/**
	 * 监听待办更新事件
	 * 当悬浮窗提取待办后，主窗口会收到此事件
	 * @param callback 回调函数
	 * @returns 取消监听的函数
	 */
	onTodosUpdated: (callback: (data: TodosUpdatedData) => void): (() => void) => {
		const handler = (_event: Electron.IpcRendererEvent, data: TodosUpdatedData) => {
			callback(data);
		};
		ipcRenderer.on("todos-updated", handler);
		// 返回取消监听的函数
		return () => {
			ipcRenderer.removeListener("todos-updated", handler);
		};
	},
};

// 安全地暴露 API 到渲染进程
contextBridge.exposeInMainWorld("electronAPI", electronAPI);
