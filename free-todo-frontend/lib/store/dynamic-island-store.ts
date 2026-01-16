"use client";

import { create } from "zustand";
import { IslandMode } from "@/components/dynamic-island";

function isElectronEnvironment(): boolean {
	if (typeof window === "undefined") return false;

	const w = window as typeof window & {
		electronAPI?: unknown;
		require?: (module: string) => unknown;
	};

	return !!(
		w.electronAPI ||
		w.require?.("electron") ||
		navigator.userAgent.includes("Electron")
	);
}

interface DynamicIslandState {
	mode: IslandMode;
	isEnabled: boolean;
	panelVisible: boolean;
	setMode: (mode: IslandMode) => void;
	toggleEnabled: () => void;
	showPanel: () => void;
	hidePanel: () => void;
}

export const useDynamicIslandStore = create<DynamicIslandState>((set, get) => ({
	mode: IslandMode.FLOAT,
	isEnabled: isElectronEnvironment(),
	panelVisible: false,
	setMode: (mode) =>
		set(() => ({
			mode,
			// PANEL = 显示，其他模式关闭 Panel overlay
			panelVisible: mode === IslandMode.PANEL,
		})),
	toggleEnabled: () => set((state) => ({ isEnabled: !state.isEnabled })),
	showPanel: () => {
		const currentMode = get().mode;
		const newMode = currentMode === IslandMode.MAXIMIZE ? IslandMode.MAXIMIZE : IslandMode.PANEL;
		set({
			panelVisible: true,
			mode: newMode,
		});
	},
	hidePanel: () =>
		set((state) => ({
			panelVisible: false,
			// 如果当前模式是 PANEL，则回到 FLOAT，避免卡在 Panel 模式
			mode: state.mode === IslandMode.PANEL ? IslandMode.FLOAT : state.mode,
		})),
}));
