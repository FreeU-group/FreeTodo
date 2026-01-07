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
	setMode: (mode: IslandMode) => void;
	toggleEnabled: () => void;
}

export const useDynamicIslandStore = create<DynamicIslandState>((set) => ({
	mode: IslandMode.FLOAT,
	isEnabled: isElectronEnvironment(),
	setMode: (mode) => set({ mode }),
	toggleEnabled: () => set((state) => ({ isEnabled: !state.isEnabled })),
}));


