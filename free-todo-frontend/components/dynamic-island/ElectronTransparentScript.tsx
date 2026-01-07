"use client";

import { useEffect } from "react";

/**
 * 在 Electron 环境尽早设置透明背景，避免 SSR 初始闪烁
 */
export function ElectronTransparentScript() {
	useEffect(() => {
		const win =
			typeof window !== "undefined"
				? (window as Window & {
						electronAPI?: { transparentBackgroundReady?: () => void };
						require?: (module: string) => { ipcRenderer?: { send: (channel: string) => void } };
					})
				: undefined;

		const isElectron =
			!!win &&
			(win.electronAPI || win?.require?.("electron") || navigator.userAgent.includes("Electron"));

		if (!isElectron) return;

		const html = document.documentElement;
		const body = document.body;
		const nextRoot = document.getElementById("__next");

		html.setAttribute("data-electron", "true");
		html.style.setProperty("background-color", "transparent", "important");
		html.style.setProperty("background", "transparent", "important");
		body.style.setProperty("background-color", "transparent", "important");
		body.style.setProperty("background", "transparent", "important");
		body.classList.remove("bg-background");

		if (nextRoot) {
			nextRoot.style.setProperty("background-color", "transparent", "important");
			nextRoot.style.setProperty("background", "transparent", "important");
		}

		// 通知主进程
		if (win?.require) {
			try {
				const { ipcRenderer } = win.require("electron") ?? {};
				ipcRenderer?.send("transparent-background-ready");
			} catch {
				// ignore
			}
		} else if (win?.electronAPI) {
			try {
				win.electronAPI.transparentBackgroundReady?.();
			} catch {
				// ignore
			}
		}
	}, []);

	return null;
}


