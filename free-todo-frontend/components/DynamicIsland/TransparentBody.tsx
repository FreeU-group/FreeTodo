"use client";

import { useEffect } from "react";
import { useDynamicIslandStore } from "@/lib/store/dynamic-island-store";
import { IslandMode } from "./types";

/**
 * 在非全屏模式下，让 body 和 html 背景完全透明
 * 这样窗口就完全透明，只显示灵动岛按钮
 */
export function TransparentBody() {
	const { mode } = useDynamicIslandStore();
	const isFullscreen = mode === IslandMode.FULLSCREEN;

	useEffect(() => {
		if (typeof document === "undefined") return;

		// 检测是否在 Electron 环境中
		const isElectron =
			typeof window !== "undefined" &&
			(window.electronAPI ||
				(window as typeof window & { require?: (m: string) => unknown }).require?.(
					"electron",
				) ||
				navigator.userAgent.includes("Electron"));

		if (!isElectron) {
			// 非 Electron 环境，不需要处理
			return;
		}

		const html = document.documentElement;
		const body = document.body;

		// 标记为 Electron 环境
		html.setAttribute("data-electron", "true");

		if (!isFullscreen) {
			// 非全屏模式：完全透明（参考 electron-with-nextjs）
			html.style.setProperty("background-color", "transparent", "important");
			html.style.setProperty("background", "transparent", "important");
			body.style.setProperty("background-color", "transparent", "important");
			body.style.setProperty("background", "transparent", "important");
			// 移除可能存在的背景色类
			body.classList.remove("bg-background");

			// 确保 #__next 也透明
			const next = document.getElementById("__next");
			if (next) {
				next.style.setProperty("background-color", "transparent", "important");
				next.style.setProperty("background", "transparent", "important");
			}
		} else {
			// 全屏模式：恢复背景色（使用主题背景色）
			// 先移除透明样式
			html.style.removeProperty("background-color");
			html.style.removeProperty("background");
			body.style.removeProperty("background-color");
			body.style.removeProperty("background");

			// 确保有背景色类
			if (!body.classList.contains("bg-background")) {
				body.classList.add("bg-background");
			}

			// 延迟检查，确保 CSS 变量已加载
			setTimeout(() => {
				const computedStyle = window.getComputedStyle(body);
				const bgColor = computedStyle.backgroundColor;
				// 如果背景色仍然是透明的，设置一个默认背景色
				if (
					bgColor === "rgba(0, 0, 0, 0)" ||
					bgColor === "transparent" ||
					bgColor === ""
				) {
					// 尝试使用 CSS 变量
					const rootStyle = window.getComputedStyle(document.documentElement);
					const cssVarBg =
						rootStyle.getPropertyValue("--background") || "#ffffff";
					const finalBg = cssVarBg.trim() || "#ffffff";
					body.style.backgroundColor = finalBg;
					html.style.backgroundColor = finalBg;
					console.log("[TransparentBody] Set background color to:", finalBg);
				}
			}, 100);
		}

		// 清理函数
		return () => {
			html.style.backgroundColor = "";
			body.style.backgroundColor = "";
			html.style.background = "";
			body.style.background = "";
		};
	}, [isFullscreen]);

	return null;
}
