"use client";

import { useEffect } from "react";
import { useDynamicIslandStore } from "@/lib/store/dynamic-island-store";
import { IslandMode } from "./types";

/**
 * 控制 html/body 背景透明：悬浮/Panel 模式透明，全屏恢复背景
 */
export function TransparentBody() {
	const { mode } = useDynamicIslandStore();
	const isFullscreen = mode === IslandMode.FULLSCREEN;

	useEffect(() => {
		if (typeof document === "undefined") return;

		const win = window as Window & {
			electronAPI?: unknown;
			require?: (m: string) => unknown;
		};
		const isElectron =
			!!win.electronAPI ||
			typeof win.require === "function" ||
			navigator.userAgent.includes("Electron");

		if (!isElectron) return;

		const html = document.documentElement;
		const body = document.body;
		const next = document.getElementById("__next");

		html.setAttribute("data-electron", "true");

		if (!isFullscreen) {
			html.style.setProperty("background-color", "transparent", "important");
			html.style.setProperty("background", "transparent", "important");
			body.style.setProperty("background-color", "transparent", "important");
			body.style.setProperty("background", "transparent", "important");
			body.classList.remove("bg-background");
			if (next) {
				next.style.setProperty("background-color", "transparent", "important");
				next.style.setProperty("background", "transparent", "important");
			}
		} else {
			html.style.removeProperty("background-color");
			html.style.removeProperty("background");
			body.style.removeProperty("background-color");
			body.style.removeProperty("background");
			if (!body.classList.contains("bg-background")) {
				body.classList.add("bg-background");
			}
			setTimeout(() => {
				const bgColor = window.getComputedStyle(body).backgroundColor;
				if (bgColor === "rgba(0, 0, 0, 0)" || bgColor === "transparent" || bgColor === "") {
					const cssVar =
						window.getComputedStyle(document.documentElement).getPropertyValue("--background") ||
						"#ffffff";
					const finalBg = cssVar.trim() || "#ffffff";
					body.style.backgroundColor = finalBg;
					html.style.backgroundColor = finalBg;
				}
			}, 100);
		}

		return () => {
			html.style.backgroundColor = "";
			body.style.backgroundColor = "";
			html.style.background = "";
			body.style.background = "";
		};
	}, [isFullscreen]);

	return null;
}


