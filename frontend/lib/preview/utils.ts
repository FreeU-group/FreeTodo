export type PreviewFileKind =
	| "markdown"
	| "html"
	| "pdf"
	| "image"
	| "text"
	| "binary";

export type PreviewMode = "code" | "view";
export type PreviewSource = "chat" | "picker";

const MARKDOWN_EXTENSIONS = new Set(["md", "markdown", "mdx"]);
const HTML_EXTENSIONS = new Set(["html", "htm"]);
const PDF_EXTENSIONS = new Set(["pdf"]);
const IMAGE_EXTENSIONS = new Set([
	"png",
	"jpg",
	"jpeg",
	"gif",
	"webp",
	"svg",
	"bmp",
	"ico",
]);
const TEXT_EXTENSIONS = new Set([
	"txt",
	"json",
	"yaml",
	"yml",
	"csv",
	"log",
	"tsv",
	"xml",
	"ini",
	"conf",
]);

export const supportsCodeMode = (kind: PreviewFileKind): boolean =>
	kind === "markdown" || kind === "html";

export const supportsViewMode = (kind: PreviewFileKind): boolean =>
	kind !== "binary";

export const isBinaryKind = (kind: PreviewFileKind): boolean =>
	kind === "pdf" || kind === "image" || kind === "binary";

export function getFileExtension(name?: string): string {
	if (!name) return "";
	const parts = name.split(".");
	if (parts.length <= 1) return "";
	return parts[parts.length - 1]?.toLowerCase() ?? "";
}

export function getFileNameFromPath(path?: string): string {
	if (!path) return "";
	const normalized = path.replace(/\\/g, "/");
	const parts = normalized.split("/");
	return parts[parts.length - 1] || path;
}

export function getDirectoryFromPath(path?: string): string {
	if (!path) return "";
	const normalized = path.replace(/\\/g, "/");
	const index = normalized.lastIndexOf("/");
	if (index === -1) return "";
	return normalized.slice(0, index);
}

export function inferFileKind(
	name?: string,
	mimeType?: string | null,
): PreviewFileKind {
	if (mimeType) {
		if (mimeType.includes("markdown")) return "markdown";
		if (mimeType.includes("html")) return "html";
		if (mimeType.includes("pdf")) return "pdf";
		if (mimeType.startsWith("image/")) return "image";
		if (mimeType.startsWith("text/")) return "text";
		if (mimeType.includes("json") || mimeType.includes("xml")) return "text";
	}

	const ext = getFileExtension(name);
	if (MARKDOWN_EXTENSIONS.has(ext)) return "markdown";
	if (HTML_EXTENSIONS.has(ext)) return "html";
	if (PDF_EXTENSIONS.has(ext)) return "pdf";
	if (IMAGE_EXTENSIONS.has(ext)) return "image";
	if (TEXT_EXTENSIONS.has(ext)) return "text";

	return "binary";
}

export function inferMimeType(name?: string): string | undefined {
	const ext = getFileExtension(name);
	if (MARKDOWN_EXTENSIONS.has(ext)) return "text/markdown";
	if (HTML_EXTENSIONS.has(ext)) return "text/html";
	if (PDF_EXTENSIONS.has(ext)) return "application/pdf";
	if (IMAGE_EXTENSIONS.has(ext)) return `image/${ext === "jpg" ? "jpeg" : ext}`;
	if (TEXT_EXTENSIONS.has(ext)) return "text/plain";
	return undefined;
}

export function formatBytes(value?: number): string {
	if (!value && value !== 0) return "—";
	const units = ["B", "KB", "MB", "GB"];
	let size = value;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex += 1;
	}
	return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

const PATH_KEYS = [
	"path",
	"file_path",
	"filepath",
	"file",
	"filename",
	"target",
	"destination",
	"dest",
	"output",
	"output_path",
	"save_path",
];

function isLikelyPath(value: string): boolean {
	if (!value) return false;
	if (value.startsWith("http://") || value.startsWith("https://")) return false;
	if (value.startsWith("file://")) return true;
	return value.includes("/") || value.includes("\\");
}

function extractFromArgs(args?: Record<string, unknown>): string | null {
	if (!args) return null;
	for (const key of PATH_KEYS) {
		const raw = args[key];
		if (typeof raw === "string" && isLikelyPath(raw)) {
			return raw;
		}
	}
	const listKeys = ["paths", "files", "file_paths", "filepaths"];
	for (const key of listKeys) {
		const raw = args[key];
		if (Array.isArray(raw)) {
			const candidate = raw.find(
				(item) => typeof item === "string" && isLikelyPath(item),
			);
			if (typeof candidate === "string") return candidate;
		}
	}
	return null;
}

function extractFromPreview(preview?: string): string | null {
	if (!preview) return null;
	const windowsRegex = /[A-Za-z]:\\[^\s"'<>]+/g;
	const unixRegex = /\/[^\s"'<>]+/g;
	const matches = [
		...(preview.match(windowsRegex) ?? []),
		...(preview.match(unixRegex) ?? []),
	];
	const candidate = matches.find((match) => isLikelyPath(match));
	return candidate ?? null;
}

export function extractPathFromToolEvent(
	args?: Record<string, unknown>,
	resultPreview?: string,
): string | null {
	return extractFromArgs(args) ?? extractFromPreview(resultPreview);
}

export function normalizePath(value: string): string {
	if (value.startsWith("file://")) {
		return decodeURIComponent(value.replace("file://", ""));
	}
	return value;
}
