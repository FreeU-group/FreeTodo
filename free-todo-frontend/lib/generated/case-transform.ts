/**
 * snake_case <-> camelCase conversion utilities
 * Used by customFetcher to auto-transform API request/response keys
 */

/**
 * Convert snake_case string to camelCase
 * @example "user_notes" -> "userNotes"
 */
export function toCamelCase(str: string): string {
	if (str === "audio_is_24x7") {
		return "audioIs24x7";
	}

	return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Convert camelCase string to snake_case
 * @example "userNotes" -> "user_notes"
 */
export function toSnakeCase(str: string): string {
	if (str === "audioIs24x7") {
		return "audio_is_24x7";
	}

	return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Recursively transform all keys of an object using the provided transformer function
 * Handles nested objects, arrays, and primitive values
 */
export function transformKeys<T>(
	obj: unknown,
	transformer: (key: string) => string,
): T {
	if (obj === null || obj === undefined) return obj as T;
	if (Array.isArray(obj)) {
		return obj.map((item) => transformKeys(item, transformer)) as T;
	}
	if (typeof obj === "object" && obj instanceof Date) {
		return obj as T;
	}
	if (typeof obj === "object") {
		return Object.fromEntries(
			Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
				transformer(k),
				transformKeys(v, transformer),
			]),
		) as T;
	}
	return obj as T;
}

/**
 * Convert all keys from snake_case to camelCase
 * Used for API response transformation
 */
export const snakeToCamel = <T>(obj: unknown): T =>
	transformKeys<T>(obj, toCamelCase);

/**
 * Convert all keys from camelCase to snake_case
 * Used for API request transformation
 */
export const camelToSnake = <T>(obj: unknown): T =>
	transformKeys<T>(obj, toSnakeCase);
