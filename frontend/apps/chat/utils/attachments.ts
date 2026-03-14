import type {
	AgnoAttachment,
	AgnoAttachmentKind,
	AgnoAttachmentValidationError,
	AgnoAttachmentValidationResult,
} from "@/apps/chat/types";
import { getFileExtension } from "@/lib/preview/utils";

export const AGNO_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const AGNO_ATTACHMENT_MAX_COUNT = 8;

export const AGNO_ALLOWED_IMAGE_MIME_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
]);

export const AGNO_ALLOWED_FILE_MIME_TYPES = new Set([
	"text/plain",
	"text/markdown",
	"text/csv",
	"application/json",
	"application/xml",
	"application/yaml",
	"application/x-yaml",
	"application/pdf",
]);

const AGNO_ALLOWED_FILE_EXTENSIONS = new Set([
	"txt",
	"md",
	"markdown",
	"csv",
	"json",
	"yaml",
	"yml",
	"py",
	"js",
	"ts",
	"tsx",
	"jsx",
	"java",
	"go",
	"rs",
	"rb",
	"php",
	"sh",
	"bat",
	"ps1",
	"sql",
	"html",
	"css",
	"xml",
	"toml",
	"ini",
	"log",
	"pdf",
]);

export function getAgnoAttachmentKind(file: File): AgnoAttachmentKind | null {
	const mimeType = (file.type || "").toLowerCase();
	const ext = getFileExtension(file.name);

	if (AGNO_ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) {
		return "image";
	}

	if (mimeType.startsWith("text/") || AGNO_ALLOWED_FILE_MIME_TYPES.has(mimeType)) {
		return "file";
	}

	if (ext && AGNO_ALLOWED_FILE_EXTENSIONS.has(ext)) {
		return "file";
	}

	return null;
}

export function validateAgnoAttachments(
	files: File[],
): AgnoAttachmentValidationResult {
	const accepted: File[] = [];
	const rejected: File[] = [];
	const errors: AgnoAttachmentValidationError[] = [];

	if (files.length > AGNO_ATTACHMENT_MAX_COUNT) {
		const overflow = files.slice(AGNO_ATTACHMENT_MAX_COUNT);
		rejected.push(...overflow);
		for (const file of overflow) {
			errors.push({
				code: "too_many",
				message: `Only ${AGNO_ATTACHMENT_MAX_COUNT} attachments are allowed.`,
				file,
			});
		}
	}

	const candidates = files.slice(0, AGNO_ATTACHMENT_MAX_COUNT);
	for (const file of candidates) {
		if (file.size > AGNO_ATTACHMENT_MAX_BYTES) {
			rejected.push(file);
			errors.push({
				code: "too_large",
				message: `Attachment exceeds ${AGNO_ATTACHMENT_MAX_BYTES} bytes.`,
				file,
			});
			continue;
		}

		const kind = getAgnoAttachmentKind(file);
		if (!kind) {
			rejected.push(file);
			errors.push({
				code: "unsupported_type",
				message: "Unsupported attachment type.",
				file,
			});
			continue;
		}

		accepted.push(file);
	}

	return { accepted, rejected, errors };
}

export function getAgnoAttachmentDownloadUrl(
	attachment: AgnoAttachment,
	baseUrl?: string,
): string {
	const raw = attachment.downloadUrl || "";
	if (!raw) return "";
	if (raw.startsWith("http://") || raw.startsWith("https://")) {
		return raw;
	}
	const resolvedBase =
		baseUrl ??
		(typeof window !== "undefined"
			? ""
			: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100");
	const separator = raw.startsWith("/") || resolvedBase.endsWith("/") ? "" : "/";
	return `${resolvedBase}${separator}${raw}`;
}

export function createAgnoAttachmentPreviewUrl(file: File): string {
	if (typeof window === "undefined") return "";
	return URL.createObjectURL(file);
}

export function revokeAgnoAttachmentPreviewUrl(url: string | null | undefined): void {
	if (!url || typeof window === "undefined") return;
	URL.revokeObjectURL(url);
}
