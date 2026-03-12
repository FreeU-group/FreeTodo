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
		previewOpenFile?: () => Promise<{
			canceled: boolean;
			path?: string;
		}>;
		previewReadFile?: (payload: {
			path: string;
			mode: "text" | "binary";
			maxBytes?: number;
		}) => Promise<{
			ok: boolean;
			path?: string;
			name?: string;
			size?: number;
			modifiedAt?: number;
			text?: string;
			base64?: string;
			error?: string;
		}>;
		previewOpenExternal?: (path: string) => Promise<{
			ok: boolean;
			error?: string;
		}>;
		previewRevealInFolder?: (path: string) => Promise<{
			ok: boolean;
			error?: string;
		}>;
	};
	require?: (module: string) => {
		ipcRenderer?: { send: (...args: unknown[]) => void };
	};
};

export function getElectronAPI(): ElectronAPI {
	return window as ElectronAPI;
}
