"use client";

import { snakeToCamel } from "@/lib/generated/case-transform";

export type ChatUploadFile = {
	id: string;
	fileName: string;
	storageName: string;
	filePath: string;
	relativePath: string;
	size: number;
	mimeType?: string;
	isImage: boolean;
	isText: boolean;
};

export type ChatUploadResponse = {
	workspacePath: string;
	files: ChatUploadFile[];
};

function getApiBaseUrl(): string {
	return typeof window !== "undefined"
		? ""
		: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";
}

export async function uploadChatFiles(
	files: File[],
): Promise<ChatUploadResponse> {
	const baseUrl = getApiBaseUrl();
	const formData = new FormData();

	for (const file of files) {
		formData.append("files", file, file.name);
	}

	const response = await fetch(`${baseUrl}/api/chat/uploads`, {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		throw new Error(`Upload failed: ${response.status}`);
	}

	const json = await response.json();
	return snakeToCamel(json) as ChatUploadResponse;
}
