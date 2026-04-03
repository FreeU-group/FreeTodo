import type { EditContentBlock } from "@/apps/chat/types";

/**
 * Parse AI response in Edit mode into structured content blocks.
 * Each block is separated by ## headers and may contain an [append_to: <id>] marker
 * indicating the recommended todo to append the content to.
 *
 * @example
 * Input:
 * ```
 * ## Project Overview
 * This section summarizes the key aspects...
 *
 * [append_to: 123]
 *
 * ## Next Steps
 * 1. Complete research
 * 2. Schedule meeting
 *
 * [append_to: 456]
 * ```
 *
 * Output:
 * [
 *   { id: "block-1", title: "Project Overview", content: "This section...", recommendedTodoId: 123 },
 *   { id: "block-2", title: "Next Steps", content: "1. Complete...", recommendedTodoId: 456 }
 * ]
 */
export function parseEditBlocks(content: string): EditContentBlock[] {
	if (!content.trim()) {
		return [];
	}

	const blocks: EditContentBlock[] = [];

	// Split by ## headers (keeping the header text)
	// Match pattern: start of line, ##, space, then capture the title
	const headerPattern = /^##\s+(.+)$/gm;
	const headerMatches = [...content.matchAll(headerPattern)];

	if (headerMatches.length === 0) {
		// No headers found - treat entire content as a single block
		const { cleanContent, todoId } = extractAppendToMarker(content);
		if (cleanContent.trim()) {
			blocks.push({
				id: "block-1",
				title: "",
				content: cleanContent.trim(),
				recommendedTodoId: todoId,
			});
		}
		return blocks;
	}

	// Process each section between headers
	for (let i = 0; i < headerMatches.length; i++) {
		const match = headerMatches[i];
		const title = match[1].trim();
		const startIndex = (match.index ?? 0) + match[0].length;

		// Find where this section ends (next header or end of content)
		const endIndex =
			i < headerMatches.length - 1
				? (headerMatches[i + 1].index ?? content.length)
				: content.length;

		const sectionContent = content.slice(startIndex, endIndex);

		// Extract [append_to: id] marker and clean content
		const { cleanContent, todoId } = extractAppendToMarker(sectionContent);

		if (cleanContent.trim() || title) {
			blocks.push({
				id: `block-${i + 1}`,
				title,
				content: cleanContent.trim(),
				recommendedTodoId: todoId,
			});
		}
	}

	// Check if there's content before the first header
	if (headerMatches.length > 0 && (headerMatches[0].index ?? 0) > 0) {
		const preHeaderContent = content.slice(0, headerMatches[0].index);
		const { cleanContent, todoId } = extractAppendToMarker(preHeaderContent);
		if (cleanContent.trim()) {
			// Insert at the beginning
			blocks.unshift({
				id: "block-0",
				title: "",
				content: cleanContent.trim(),
				recommendedTodoId: todoId,
			});
		}
	}

	return blocks;
}

/**
 * Extract [append_to: <id>] marker from content and return cleaned content + todo ID
 */
function extractAppendToMarker(content: string): {
	cleanContent: string;
	todoId: number | null;
} {
	// Match [append_to: 123] pattern (with optional whitespace)
	const appendToPattern = /\[append_to:\s*(\d+)\s*\]/gi;
	const matches = [...content.matchAll(appendToPattern)];

	let todoId: number | null = null;

	// Take the last match if multiple exist
	if (matches.length > 0) {
		const lastMatch = matches[matches.length - 1];
		todoId = Number.parseInt(lastMatch[1], 10);
	}

	// Remove all [append_to: x] markers from content
	const cleanContent = content.replace(appendToPattern, "").trim();

	return { cleanContent, todoId };
}

/**
 * Get the clean content from a block (without the append_to marker)
 * Used when appending to todo notes
 */
export function getCleanBlockContent(block: EditContentBlock): string {
	const parts: string[] = [];

	if (block.title) {
		parts.push(`## ${block.title}`);
	}

	if (block.content) {
		parts.push(block.content);
	}

	return parts.join("\n\n");
}
