"use client";

import { useDynamicIslandStore } from "@/lib/store/dynamic-island-store";
import { DynamicIsland } from "./DynamicIsland";
import { IslandMode } from "./types";

function isElectronEnvironment(): boolean {
	if (typeof window === "undefined") return false;
	const win = window as Window & {
		electronAPI?: unknown;
		require?: ((module: string) => unknown) | undefined;
	};
	return !!(
		win.electronAPI ||
		win.require?.("electron") ||
		navigator.userAgent.includes("Electron")
	);
}

export function DynamicIslandProvider() {
	const { mode, isEnabled, setMode } = useDynamicIslandStore();
	const allowWebPreview =
		process.env.NEXT_PUBLIC_ENABLE_DYNAMIC_ISLAND_WEB_PREVIEW === "true";

	if ((!isElectronEnvironment() && !allowWebPreview) || !isEnabled) {
		return null;
	}

	return (
		<DynamicIsland
			mode={mode}
			onModeChange={setMode}
			onClose={() => setMode(IslandMode.FLOAT)}
		/>
	);
}

