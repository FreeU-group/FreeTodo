import { getPreviewFileUrl } from "@/lib/preview/api";
import { getDirectoryFromPath } from "@/lib/preview/utils";
import { isElectron, isTauri, isWeb } from "@/lib/utils/platform";

type PreviewCommandResult = { ok: boolean; error?: string };

export async function openExternalFile(
	path?: string,
	fallbackUrl?: string,
): Promise<PreviewCommandResult> {
	if (!path && fallbackUrl && typeof window !== "undefined") {
		window.open(fallbackUrl, "_blank", "noopener,noreferrer");
		return { ok: true };
	}

	if (!path) {
		return { ok: false, error: "Missing path" };
	}

	if (isElectron()) {
		const result = await window.electronAPI?.previewOpenExternal?.(path);
		if (!result) {
			return { ok: false, error: "Electron preview API unavailable" };
		}
		return result;
	}

	if (isTauri()) {
		try {
			const { open } = await import("@tauri-apps/plugin-shell");
			await open(path);
			return { ok: true };
		} catch (error) {
			return {
				ok: false,
				error:
					error instanceof Error ? error.message : "Failed to open file",
			};
		}
	}

	if (isWeb()) {
		const url = fallbackUrl || getPreviewFileUrl(path, "binary");
		window.open(url, "_blank", "noopener,noreferrer");
		return { ok: true };
	}

	return { ok: false, error: "Unsupported platform" };
}

export async function revealFileInFolder(
	path?: string,
): Promise<PreviewCommandResult> {
	if (!path) {
		return { ok: false, error: "Missing path" };
	}

	if (isElectron()) {
		const result = await window.electronAPI?.previewRevealInFolder?.(path);
		if (!result) {
			return { ok: false, error: "Electron preview API unavailable" };
		}
		return result;
	}

	if (isTauri()) {
		try {
			const { open } = await import("@tauri-apps/plugin-shell");
			const directory = getDirectoryFromPath(path);
			if (!directory) {
				return { ok: false, error: "Missing directory" };
			}
			await open(directory);
			return { ok: true };
		} catch (error) {
			return {
				ok: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to reveal file",
			};
		}
	}

	return { ok: false, error: "Unsupported platform" };
}
