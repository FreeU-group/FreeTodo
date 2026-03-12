"use client";

import { snakeToCamel } from "@/lib/generated/case-transform";
import type { TodoAttachment } from "@/lib/types";

export const MAX_ATTACHMENT_SIZE_BYTES = 50 * 1024 * 1024;

function getApiBaseUrl(): string {
	return typeof window !== "undefined"
		? ""
		: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";
}

export function getAttachmentFileUrl(attachmentId: number): string {
	const baseUrl = getApiBaseUrl();
	return `${baseUrl}/api/todos/attachments/${attachmentId}/file`;
}

export async function uploadTodoAttachments(
	todoId: number,
	files: File[],
): Promise<TodoAttachment[]> {
	const baseUrl = getApiBaseUrl();
	const formData = new FormData();

	for (const file of files) {
		formData.append("files", file, file.name);
	}

	const response = await fetch(`${baseUrl}/api/todos/${todoId}/attachments`, {
		method: "POST",
		body: formData,
	});

	if (!response.ok) {
		throw new Error(`Upload failed: ${response.status}`);
	}

	const json = await response.json();
	return snakeToCamel(json) as TodoAttachment[];
}

export async function removeTodoAttachment(
	todoId: number,
	attachmentId: number,
): Promise<void> {
	const baseUrl = getApiBaseUrl();
	const response = await fetch(
		`${baseUrl}/api/todos/${todoId}/attachments/${attachmentId}`,
		{
			method: "DELETE",
		},
	);

	if (!response.ok) {
		throw new Error(`Remove attachment failed: ${response.status}`);
	}
}
