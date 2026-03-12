/**
 * Electron 环境检测和工具函数
 */

/**
 * Electron 窗口接口扩展
 */
export interface ElectronWindow extends Window {
	electronAPI?: Window["electronAPI"];
	require?: (module: string) => unknown;
}

/**
 * 检测是否在 Electron 环境中
 */
export function isElectronEnvironment(): boolean {
	if (typeof window === "undefined") return false;
	const win = window as ElectronWindow;
	return !!(
		win.electronAPI ||
		win.require?.("electron") ||
		navigator.userAgent.includes("Electron")
	);
}
