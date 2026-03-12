"use client";

import { create } from "zustand";
import { readFileFromPath, readFileFromPicker } from "@/lib/preview/access";
import type { PreviewFileKind, PreviewMode, PreviewSource } from "@/lib/preview/utils";
import {
	getFileNameFromPath,
	inferFileKind,
	inferMimeType,
	isBinaryKind,
	normalizePath,
	supportsCodeMode,
} from "@/lib/preview/utils";

export type PreviewStatus = "idle" | "loading" | "ready" | "error";

export type PreviewFile = {
	id: string;
	name: string;
	path?: string;
	source: PreviewSource;
	kind: PreviewFileKind;
	mimeType?: string;
	size?: number;
	updatedAt?: number;
	text?: string;
	objectUrl?: string;
	file?: File;
	status: PreviewStatus;
	error?: string;
};

type PreviewState = {
	activeFile: PreviewFile | null;
	recentFiles: PreviewFile[];
	mode: PreviewMode;
	currentRequestId: number;
	openFromPath: (path: string, source?: PreviewSource) => Promise<void>;
	openFromPicker: (file: File) => Promise<void>;
	activateRecent: (id: string) => void;
	setMode: (mode: PreviewMode) => void;
	clearActive: () => void;
};

const RECENT_LIMIT = 6;

const getRequestId = () => Date.now();

const getFileId = (
	path: string | undefined,
	source: PreviewSource,
	file?: File,
): string => {
	if (path) {
		return `${source}:${path}`;
	}
	if (file) {
		return `${source}:${file.name}:${file.size}:${file.lastModified}`;
	}
	return `${source}:${Math.random().toString(36).slice(2)}`;
};

const revokeObjectUrl = (file?: PreviewFile | null) => {
	if (!file?.objectUrl) return;
	URL.revokeObjectURL(file.objectUrl);
};

const updateRecentFiles = (
	current: PreviewFile[],
	next: PreviewFile,
): PreviewFile[] => {
	const existing = current.find((item) => item.id === next.id);
	if (existing && existing.objectUrl && existing.objectUrl !== next.objectUrl) {
		revokeObjectUrl(existing);
	}
	const filtered = current.filter((item) => item.id !== next.id);
	const updated = [next, ...filtered];
	if (updated.length <= RECENT_LIMIT) return updated;
	const trimmed = updated.slice(0, RECENT_LIMIT);
	const removed = updated.slice(RECENT_LIMIT);
	for (const file of removed) {
		revokeObjectUrl(file);
	}
	return trimmed;
};

export const usePreviewStore = create<PreviewState>((set, get) => ({
	activeFile: null,
	recentFiles: [],
	mode: "view",
	currentRequestId: 0,

	openFromPath: async (path, source = "chat") => {
		const normalized = normalizePath(path);
		const name = getFileNameFromPath(normalized);
		const kind = inferFileKind(name);
		const mimeType = inferMimeType(name);
		const requestId = getRequestId();
		const nextMode = supportsCodeMode(kind) ? get().mode : "view";

		set({
			activeFile: {
				id: getFileId(normalized, source),
				name,
				path: normalized,
				source,
				kind,
				mimeType,
				status: "loading",
			},
			mode: nextMode,
			currentRequestId: requestId,
		});

		const result = await readFileFromPath(normalized, kind, mimeType);
		if (get().currentRequestId !== requestId) return;

		if (!result.ok) {
			set((state) => ({
				activeFile: state.activeFile
					? {
							...state.activeFile,
							status: "error",
							error: result.error || "Failed to load file",
						}
					: null,
			}));
			return;
		}

		const objectUrl =
			result.blob && isBinaryKind(kind)
				? URL.createObjectURL(result.blob)
				: undefined;

		const loadedFile: PreviewFile = {
			id: getFileId(normalized, source),
			name: result.name || name,
			path: normalized,
			source,
			kind,
			mimeType,
			size: result.size,
			updatedAt: result.modifiedAt,
			text: result.text,
			objectUrl,
			status: "ready",
		};

		set((state) => ({
			activeFile: loadedFile,
			recentFiles: updateRecentFiles(state.recentFiles, loadedFile),
		}));
	},

	openFromPicker: async (file) => {
		const kind = inferFileKind(file.name, file.type);
		const mimeType = file.type || inferMimeType(file.name);
		const requestId = getRequestId();
		const nextMode = supportsCodeMode(kind) ? get().mode : "view";
		const filePath = (file as File & { path?: string }).path;
		const normalizedPath = filePath ? normalizePath(filePath) : undefined;
		const id = getFileId(normalizedPath, "picker", file);

		set({
			activeFile: {
				id,
				name: file.name,
				path: normalizedPath,
				source: "picker",
				kind,
				mimeType,
				status: "loading",
				file,
			},
			mode: nextMode,
			currentRequestId: requestId,
		});

		const result = await readFileFromPicker(file, kind);
		if (get().currentRequestId !== requestId) return;

		if (!result.ok) {
			set((state) => ({
				activeFile: state.activeFile
					? {
							...state.activeFile,
							status: "error",
							error: result.error || "Failed to load file",
						}
					: null,
			}));
			return;
		}

		const objectUrl =
			result.blob && isBinaryKind(kind)
				? URL.createObjectURL(result.blob)
				: undefined;

		const loadedFile: PreviewFile = {
			id,
			name: result.name,
			path: normalizedPath,
			source: "picker",
			kind,
			mimeType,
			size: result.size ?? file.size,
			updatedAt: result.modifiedAt ?? file.lastModified,
			text: result.text,
			objectUrl,
			file,
			status: "ready",
		};

		set((state) => ({
			activeFile: loadedFile,
			recentFiles: updateRecentFiles(state.recentFiles, loadedFile),
		}));
	},

	activateRecent: (id) => {
		const file = get().recentFiles.find((item) => item.id === id);
		if (!file) return;
		const nextMode = supportsCodeMode(file.kind) ? get().mode : "view";
		set({ activeFile: file, mode: nextMode });
	},

	setMode: (mode) => set({ mode }),

	clearActive: () =>
		set((state) => {
			revokeObjectUrl(state.activeFile);
			return { activeFile: null, mode: "view" };
		}),
}));
