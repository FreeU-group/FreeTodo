"use client";

function getApiBaseUrl(): string {
	return typeof window !== "undefined"
		? ""
		: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";
}

export function getChatAttachmentDownloadUrl(downloadUrl: string): string {
	if (!downloadUrl) {
		return "";
	}
	if (downloadUrl.startsWith("http://") || downloadUrl.startsWith("https://")) {
		return downloadUrl;
	}
	const baseUrl = getApiBaseUrl();
	if (downloadUrl.startsWith("/")) {
		return `${baseUrl}${downloadUrl}`;
	}
	return `${baseUrl}/${downloadUrl}`;
}
