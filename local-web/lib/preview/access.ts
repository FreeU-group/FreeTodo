import { getPreviewFileUrl } from "@/lib/preview/api";
import type { PreviewFileKind } from "@/lib/preview/utils";
import { getFileNameFromPath, isBinaryKind } from "@/lib/preview/utils";
import { isElectron, isTauri } from "@/lib/utils/platform";

export type PreviewReadResult = {
	ok: boolean;
	name: string;
	size?: number;
	modifiedAt?: number;
	text?: string;
	blob?: Blob;
	error?: string;
};

type NativeReadResult = {
	ok: boolean;
	path?: string;
	name?: string;
	size?: number;
	modifiedAt?: number;
	text?: string;
	base64?: string;
	error?: string;
};

const DEFAULT_TEXT_LIMIT = 2 * 1024 * 1024;
const DEFAULT_BINARY_LIMIT = 50 * 1024 * 1024;

function decodeBase64ToBlob(base64: string, mimeType?: string): Blob {
	const binary = atob(base64);
	const length = binary.length;
	const bytes = new Uint8Array(length);
	for (let i = 0; i < length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return new Blob([bytes], { type: mimeType });
}

export async function readFileFromPath(
	path: string,
	kind: PreviewFileKind,
	mimeType?: string,
): Promise<PreviewReadResult> {
	const mode = isBinaryKind(kind) ? "binary" : "text";
	const maxBytes = mode === "text" ? DEFAULT_TEXT_LIMIT : DEFAULT_BINARY_LIMIT;

	if (isElectron()) {
		const result = await window.electronAPI?.previewReadFile?.({
			path,
			mode,
			maxBytes,
		});

		if (!result) {
			return {
				ok: false,
				name: getFileNameFromPath(path),
				error: "Electron preview API unavailable",
			};
		}

		if (!result.ok) {
			return {
				ok: false,
				name: result.name || getFileNameFromPath(path),
				error: result.error || "Failed to load file",
			};
		}

		return {
			ok: true,
			name: result.name || getFileNameFromPath(path),
			size: result.size,
			modifiedAt: result.modifiedAt,
			text: result.text,
			blob: result.base64
				? decodeBase64ToBlob(result.base64, mimeType)
				: undefined,
		};
	}

	if (isTauri()) {
		try {
			const { invoke } = await import("@tauri-apps/api/core");
			const result = await invoke<NativeReadResult>("preview_read_file", {
				path,
				mode,
				maxBytes,
			});

			if (!result.ok) {
				return {
					ok: false,
					name: result.name || getFileNameFromPath(path),
					error: result.error || "Failed to load file",
				};
			}

			return {
				ok: true,
				name: result.name || getFileNameFromPath(path),
				size: result.size,
				modifiedAt: result.modifiedAt,
				text: result.text,
				blob: result.base64
					? decodeBase64ToBlob(result.base64, mimeType)
					: undefined,
			};
		} catch (error) {
			return {
				ok: false,
				name: getFileNameFromPath(path),
				error:
					error instanceof Error
						? error.message
						: "Failed to load file",
			};
		}
	}

	const url = getPreviewFileUrl(path, mode);
	const response = await fetch(url);
	if (!response.ok) {
		return {
			ok: false,
			name: getFileNameFromPath(path),
			error: await response.text(),
		};
	}

	const sizeHeader = response.headers.get("X-File-Size");
	const modifiedHeader = response.headers.get("X-File-Modified");
	const nameHeader = response.headers.get("X-File-Name");
	const size = sizeHeader ? Number(sizeHeader) : undefined;
	const modifiedAt = modifiedHeader ? Number(modifiedHeader) : undefined;

	if (mode === "text") {
		return {
			ok: true,
			name: nameHeader || getFileNameFromPath(path),
			size,
			modifiedAt,
			text: await response.text(),
		};
	}

	return {
		ok: true,
		name: nameHeader || getFileNameFromPath(path),
		size,
		modifiedAt,
		blob: await response.blob(),
	};
}

export async function readFileFromPicker(
	file: File,
	kind: PreviewFileKind,
): Promise<PreviewReadResult> {
	const mode = isBinaryKind(kind) ? "binary" : "text";
	if (mode === "text") {
		return {
			ok: true,
			name: file.name,
			size: file.size,
			modifiedAt: file.lastModified,
			text: await file.text(),
		};
	}

	return {
		ok: true,
		name: file.name,
		size: file.size,
		modifiedAt: file.lastModified,
		blob: file,
	};
}
