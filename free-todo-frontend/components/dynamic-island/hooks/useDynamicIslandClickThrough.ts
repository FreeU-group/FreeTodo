/**
 * 点击穿透逻辑 Hook
 */

import { useCallback, useEffect } from "react";
import { getElectronAPI } from "../electron-api";
import { IslandMode } from "../types";

export function useDynamicIslandClickThrough(mode: IslandMode) {
	const setIgnoreMouse = useCallback((ignore: boolean) => {
		const api = getElectronAPI();
		try {
			if (api.require) {
				const { ipcRenderer } = api.require("electron") ?? {};
				if (ignore) {
					// forward: true lets the mouse move event still reach the browser
					// so we can detect when to turn it back on.
					ipcRenderer?.send("set-ignore-mouse-events", true, {
						forward: true,
					});
				} else {
					ipcRenderer?.send("set-ignore-mouse-events", false);
				}
			} else {
				api.electronAPI?.setIgnoreMouseEvents?.(
					ignore,
					ignore ? { forward: true } : undefined,
				);
			}
		} catch (error) {
			console.error("[DynamicIsland] setIgnoreMouse failed", error);
		}
	}, []);

	useEffect(() => {
		if (mode === IslandMode.FLOAT) {
			// FLOAT 模式下：立即开启点击穿透（窗口级别），由 useElectronClickThrough 负责区域判断
			setIgnoreMouse(true);
		} else {
			// 切换离开 FLOAT（例如到 PANEL）时，确保立即关闭点击穿透
			setIgnoreMouse(false);
		}
	}, [mode, setIgnoreMouse]);

	return setIgnoreMouse;
}
