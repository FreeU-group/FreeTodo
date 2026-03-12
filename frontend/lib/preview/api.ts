export type PreviewFetchMode = "text" | "binary";

export function getPreviewFileUrl(
	path: string,
	mode: PreviewFetchMode = "binary",
): string {
	const baseUrl =
		typeof window !== "undefined"
			? ""
			: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8100";
	const params = new URLSearchParams({
		path,
		mode,
	});
	return `${baseUrl}/api/preview/file?${params.toString()}`;
}
