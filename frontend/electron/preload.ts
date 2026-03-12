/**
 * Electron Preload Script
 * 用于在渲染进程中安全地访问 Electron API
 */

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

// 立即设置透明背景（在页面加载前执行）
// 这样可以避免 Next.js SSR 导致的窗口显示问题
(() => {
	function setTransparentBackground() {
		// 检查 DOM 是否可用
		if (typeof document === "undefined" || !document.documentElement) {
			return;
		}

		// 立即设置透明背景，使用 !important
		const html = document.documentElement;
		const body = document.body;

		if (html) {
			html.setAttribute("data-electron", "true");
			html.style.setProperty("background-color", "transparent", "important");
			html.style.setProperty("background", "transparent", "important");
		}

		if (body) {
			body.style.setProperty("background-color", "transparent", "important");
			body.style.setProperty("background", "transparent", "important");
		}

		// 原来这里会直接通知主进程 "transparent-background-ready"
		// 但这发生在 React 完成水合之前，可能导致窗口过早显示整页 UI
		// 现在改为只由前端的 ElectronTransparentScript 通知，确保已进入 Electron 专用布局后再显示窗口
	}

	// 等待 DOM 可用后再执行
	if (typeof document !== "undefined") {
		// 如果 DOM 已经加载完成
		if (
			document.readyState === "complete" ||
			document.readyState === "interactive"
		) {
			setTransparentBackground();
		} else {
			// 监听 DOMContentLoaded
			document.addEventListener("DOMContentLoaded", setTransparentBackground, {
				once: true,
			});
		}

		// 也监听 body 的创建（如果 body 还不存在）
		if (!document.body && document.documentElement) {
			const observer = new MutationObserver((_mutations, obs) => {
				if (document.body) {
					setTransparentBackground();
					obs.disconnect();
				}
			});

			// 确保 documentElement 存在且是有效的 Node
			if (document.documentElement && document.documentElement.nodeType === 1) {
				observer.observe(document.documentElement, {
					childList: true,
					subtree: true,
				});
			}
		} else if (document.body) {
			// body 已存在，直接设置
			setTransparentBackground();
		}
	}
})();

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld("electronAPI", {
	/**
	 * 显示系统通知
	 * @param data 通知数据
	 * @returns Promise<void>
	 */
	showNotification: (data: NotificationData): Promise<void> => {
		return ipcRenderer.invoke("show-notification", data);
	},

	/**
	 * 设置窗口是否忽略鼠标事件（用于透明窗口点击穿透）
	 */
	setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => {
		ipcRenderer.send("set-ignore-mouse-events", ignore, options);
	},

	/**
	 * 获取屏幕信息
	 */
	getScreenInfo: () => ipcRenderer.invoke("get-screen-info"),

	/**
	 * 通知主进程透明背景已设置完成
	 */
	transparentBackgroundReady: () => {
		ipcRenderer.send("transparent-background-ready");
	},

	/**
	 * 移动窗口到指定位置
	 */
	moveWindow: (x: number, y: number) => {
		ipcRenderer.send("move-window", x, y);
	},

	/**
	 * 获取窗口当前位置
	 */
	getWindowPosition: async () => {
		return await ipcRenderer.invoke("get-window-position");
	},

	/**
	 * 退出应用
	 */
	quit: () => {
		ipcRenderer.send("app-quit");
	},

	/**
	 * 设置窗口背景色
	 */
	setWindowBackgroundColor: (color: string) => {
		ipcRenderer.send("set-window-background-color", color);
	},

	/**
	 * 打开本地文件选择器（预览）
	 */
	previewOpenFile: () => ipcRenderer.invoke("preview:open-file"),

	/**
	 * 读取文件内容（预览）
	 */
	previewReadFile: (payload: {
		path: string;
		mode: "text" | "binary";
		maxBytes?: number;
	}) => ipcRenderer.invoke("preview:read-file", payload),

	/**
	 * 使用系统默认应用打开文件
	 */
	previewOpenExternal: (path: string) =>
		ipcRenderer.invoke("preview:open-external", path),

	/**
	 * 在文件管理器中显示文件
	 */
	previewRevealInFolder: (path: string) =>
		ipcRenderer.invoke("preview:reveal", path),

	/**
	 * 截图并提取待办事项
	 */
	captureAndExtractTodos: async (
		panelBounds?: { x: number; y: number; width: number; height: number } | null,
	): Promise<{
		success: boolean;
		message: string;
		extractedTodos: Array<{
			title: string;
			description?: string;
			time_info?: Record<string, unknown>;
			source_text?: string;
			confidence: number;
		}>;
		createdCount: number;
	}> => {
		return await ipcRenderer.invoke("capture-and-extract-todos", panelBounds);
	},

	/**
	 * 触发通知弹窗（由自动待办检测等事件调用）
	 * @param data 可选的弹窗内容数据
	 */
	triggerNotificationPopup: (data?: { title?: string; message?: string }) => {
		ipcRenderer.send("trigger-notification-popup", data);
	},

	// ========== Island 动态岛相关 API ==========

	/**
	 * 调整 Island 窗口大小（切换模式）
	 * @param mode Island 模式: "FLOAT" | "POPUP" | "SIDEBAR" | "FULLSCREEN"
	 */
	islandResizeWindow: (mode: string) => {
		ipcRenderer.send("island:resize-window", mode);
	},

	/**
	 * 调整 SIDEBAR 模式窗口大小（多栏展开/收起）
	 * @param columnCount 栏数: 1 | 2 | 3
	 */
	islandResizeSidebar: (columnCount: number) => {
		ipcRenderer.send("island:resize-sidebar", columnCount);
	},

	/**
	 * 显示 Island 窗口
	 */
	islandShow: () => {
		ipcRenderer.send("island:show");
	},

	/**
	 * 隐藏 Island 窗口
	 */
	islandHide: () => {
		ipcRenderer.send("island:hide");
	},

	/**
	 * 切换 Island 窗口显示/隐藏
	 */
	islandToggle: () => {
		ipcRenderer.send("island:toggle");
	},

	/**
	 * Island 窗口拖拽开始（自定义拖拽，仅垂直方向）
	 * @param mouseY 鼠标屏幕 Y 坐标
	 */
	islandDragStart: (mouseY: number) => {
		ipcRenderer.send("island:drag-start", mouseY);
	},

	/**
	 * Island 窗口拖拽移动（自定义拖拽，仅垂直方向）
	 * @param mouseY 鼠标屏幕 Y 坐标
	 */
	islandDragMove: (mouseY: number) => {
		ipcRenderer.send("island:drag-move", mouseY);
	},

	/**
	 * Island 窗口拖拽结束（自定义拖拽）
	 */
	islandDragEnd: () => {
		ipcRenderer.send("island:drag-end");
	},

	/**
	 * 设置 Island SIDEBAR 模式的固定状态
	 * @param isPinned true = 固定（始终在顶部），false = 非固定（正常窗口行为）
	 */
	islandSetPinned: (isPinned: boolean) => {
		ipcRenderer.send("island:set-pinned", isPinned);
	},

	/**
	 * 监听 Island 窗口位置更新（拖拽时实时更新）
	 * @param callback 回调函数，接收位置数据
	 */
	onIslandPositionUpdate: (callback: (data: { y: number; screenHeight: number }) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, data: { y: number; screenHeight: number }) => callback(data);
		ipcRenderer.on('island:position-update', listener);
		return () => {
			ipcRenderer.removeListener('island:position-update', listener);
		};
	},

	/**
	 * 监听 Island 窗口锚点更新（模式切换时更新）
	 * @param callback 回调函数，接收锚点数据
	 */
	onIslandAnchorUpdate: (callback: (data: { anchor: 'top' | 'bottom' | null; y: number }) => void) => {
		const listener = (_event: Electron.IpcRendererEvent, data: { anchor: 'top' | 'bottom' | null; y: number }) => callback(data);
		ipcRenderer.on('island:anchor-update', listener);
		return () => {
			ipcRenderer.removeListener('island:anchor-update', listener);
		};
	},
});
