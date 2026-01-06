import { create } from "zustand";
import { IslandMode } from "@/components/DynamicIsland";

/**
 * 检测是否在 Electron 环境中
 */
function isElectronEnvironment(): boolean {
	if (typeof window === "undefined") return false;

	// 扩展 window 类型以安全访问 Electron API
	const w = window as typeof window & {
		electronAPI?: unknown;
		require?: (module: string) => unknown;
	};

	return !!(
		w.electronAPI ||
		// require 仅在 Electron preload 中存在
		w.require?.("electron") ||
		navigator.userAgent.includes("Electron")
	);
}

interface DynamicIslandState {
	mode: IslandMode;
	isEnabled: boolean;
	setMode: (mode: IslandMode) => void;
	toggleEnabled: () => void;
}

export const useDynamicIslandStore = create<DynamicIslandState>((set) => ({
	mode: IslandMode.FLOAT,
	// 只在 Electron 环境中启用灵动岛，浏览器模式下自动禁用
	isEnabled: isElectronEnvironment(),
	setMode: (mode) => set({ mode }),
	toggleEnabled: () => set((state) => ({ isEnabled: !state.isEnabled })),
}));
