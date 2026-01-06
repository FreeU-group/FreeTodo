"use client";

import { useEffect } from "react";

/**
 * 在 Electron 环境中立即设置透明背景
 * 这个脚本会在组件挂载时立即执行，尽可能早地设置透明背景
 * 避免 Next.js SSR 导致的窗口显示问题
 */
export function ElectronTransparentScript() {
	useEffect(() => {
		// 检测是否在 Electron 环境中
		const win = typeof window !== "undefined"
			? (window as Window & {
					electronAPI?: { transparentBackgroundReady?: () => void };
					require?: (module: string) => { ipcRenderer?: { send: (channel: string) => void } };
				})
			: undefined;
		const isElectron =
			!!win &&
			(win.electronAPI ||
				win.require?.("electron") ||
				navigator.userAgent.includes("Electron"));

		if (!isElectron) {
			return;
		}

		// 立即设置透明背景，使用 !important 级别的内联样式
		const html = document.documentElement;
		const body = document.body;
		const nextRoot = document.getElementById("__next");

		html.setAttribute("data-electron", "true");

		// 使用 setProperty 设置 !important 样式
		html.style.setProperty("background-color", "transparent", "important");
		html.style.setProperty("background", "transparent", "important");
		body.style.setProperty("background-color", "transparent", "important");
		body.style.setProperty("background", "transparent", "important");

		if (nextRoot) {
			nextRoot.style.setProperty(
				"background-color",
				"transparent",
				"important",
			);
			nextRoot.style.setProperty("background", "transparent", "important");
		}

		// 移除可能存在的背景色类
		body.classList.remove("bg-background");

		// 通知 Electron 主进程透明背景已设置
		if (win?.require) {
			try {
				const { ipcRenderer } = win.require("electron") ?? {};
				ipcRenderer?.send("transparent-background-ready");
			} catch (_e) {
				// 忽略错误
			}
		} else if (win?.electronAPI) {
			try {
				win.electronAPI?.transparentBackgroundReady?.();
			} catch (_e) {
				// 忽略错误
			}
		}
	}, []); // 只在挂载时执行一次

	return null;
}
