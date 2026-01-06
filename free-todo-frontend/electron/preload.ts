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

		// 通知主进程透明背景已设置
		try {
			ipcRenderer.send("transparent-background-ready");
		} catch (_e) {
			// 忽略错误
		}
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
	 * 获取系统音频源列表（使用 desktopCapturer）
	 */
	getSystemAudioSources: async () => {
		return await ipcRenderer.invoke("get-system-audio-sources");
	},

	/**
	 * 获取系统音频流（自动选择或使用指定源）
	 */
	getSystemAudioStream: async (sourceId?: string) => {
		return await ipcRenderer.invoke("get-system-audio-stream", sourceId);
	},

	/**
	 * 检查虚拟音频设备是否可用
	 */
	checkVirtualAudioDevice: async () => {
		return await ipcRenderer.invoke("check-virtual-audio-device");
	},

	/**
	 * 设置虚拟音频设备
	 */
	setupVirtualAudioDevice: async () => {
		return await ipcRenderer.invoke("setup-virtual-audio-device");
	},

	/**
	 * 设置窗口是否忽略鼠标事件（用于透明窗口点击穿透）
	 */
	setIgnoreMouseEvents: (ignore: boolean, options?: { forward?: boolean }) => {
		ipcRenderer.send("set-ignore-mouse-events", ignore, options);
	},

	/**
	 * 显示窗口（用于全屏模式）
	 */
	showWindow: () => {
		ipcRenderer.send("show-window");
	},

	/**
	 * 隐藏窗口（用于退出全屏模式）
	 */
	hideWindow: () => {
		ipcRenderer.send("hide-window");
	},

	/**
	 * 展开窗口到全屏（完全按照 electron-with-nextjs）
	 */
	expandWindowFull: () => ipcRenderer.invoke("expand-window-full"),

	/**
	 * 展开窗口到窗口化模式（可调整大小）
	 */
	expandWindow: () => ipcRenderer.invoke("expand-window"),

	/**
	 * 在指定位置展开窗口（Panel模式 - 从灵动岛上方展开）
	 */
	expandWindowAtPosition: (
		x: number,
		y: number,
		width: number,
		height: number,
	) => ipcRenderer.invoke("expand-window-at-position", x, y, width, height),

	/**
	 * 恢复窗口到原始大小（完全按照 electron-with-nextjs）
	 */
	collapseWindow: () => ipcRenderer.invoke("collapse-window"),

	/**
	 * 获取屏幕信息（完全照抄 electron-with-nextjs）
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
	 * 调整窗口大小（用于自定义缩放把手）
	 */
	resizeWindow: (deltaX: number, deltaY: number, position: string) => {
		ipcRenderer.send("resize-window", deltaX, deltaY, position);
	},

	/**
	 * 退出应用
	 */
	quit: () => {
		ipcRenderer.send("app-quit");
	},
});
