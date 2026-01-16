/**
 * Electron API 类型定义和工具函数
 */

export type ElectronAPI = typeof window & {
	electronAPI?: {
		collapseWindow?: () => Promise<void> | void;
		expandWindow?: () => Promise<void> | void;
		expandWindowFull?: () => Promise<void> | void;
		setIgnoreMouseEvents?: (
			ignore: boolean,
			options?: { forward?: boolean },
		) => void;
		resizeWindow?: (dx: number, dy: number, pos: string) => void;
		quit?: () => void;
		setWindowBackgroundColor?: (color: string) => void;
		captureAndExtractTodos?: (
			panelBounds?: { x: number; y: number; width: number; height: number } | null,
		) => Promise<{
			success: boolean;
			message: string;
			extractedTodos: Array<{
				title: string;
				description?: string;
				time_info?: Record<string, unknown>;
				source_text?: string;
				confidence: number;
			}>;
			createdCount: number;
		}>;
	};
	require?: (module: string) => {
		ipcRenderer?: { send: (...args: unknown[]) => void };
	};
};

export function getElectronAPI(): ElectronAPI {
	return window as ElectronAPI;
}
