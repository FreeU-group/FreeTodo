"use client";

import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useId,
	useMemo,
} from "react";

const SettingsSearchContext = createContext<string>("");
const SettingsSearchMatchContext = createContext<
	((id: string, isMatch: boolean) => void) | null
>(null);

export function SettingsSearchProvider({
	query = "",
	children,
}: {
	query?: string;
	children: ReactNode;
}) {
	return (
		<SettingsSearchContext.Provider value={query}>
			{children}
		</SettingsSearchContext.Provider>
	);
}

export function SettingsSearchMatchProvider({
	onMatchChange,
	children,
}: {
	onMatchChange: (id: string, isMatch: boolean) => void;
	children: ReactNode;
}) {
	return (
		<SettingsSearchMatchContext.Provider value={onMatchChange}>
			{children}
		</SettingsSearchMatchContext.Provider>
	);
}

export function useSettingsSearchQuery() {
	return useContext(SettingsSearchContext);
}

const normalizeSearchValue = (value: string) => value.toLowerCase().trim();

export const doesSearchMatch = (
	query: string,
	values: Array<string | undefined>,
) => {
	const normalizedQuery = normalizeSearchValue(query);
	if (!normalizedQuery) return true;

	const haystack = values.filter(Boolean).join(" ").toLowerCase();
	if (!haystack) return false;

	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	return tokens.every((token) => haystack.includes(token));
};

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildHighlightParts = (text: string, query: string) => {
	const normalizedQuery = normalizeSearchValue(query);
	if (!normalizedQuery) return [{ text, match: false }];

	const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
	if (!tokens.length) return [{ text, match: false }];

	const regex = new RegExp(tokens.map(escapeRegExp).join("|"), "gi");
	const parts: Array<{ text: string; match: boolean }> = [];
	let lastIndex = 0;

	for (const match of text.matchAll(regex)) {
		const matchIndex = match.index !== undefined ? match.index : 0;
		if (matchIndex > lastIndex) {
			parts.push({
				text: text.slice(lastIndex, matchIndex),
				match: false,
			});
		}
		parts.push({ text: match[0], match: true });
		lastIndex = matchIndex + match[0].length;
	}

	if (!parts.length) return [{ text, match: false }];

	if (lastIndex < text.length) {
		parts.push({ text: text.slice(lastIndex), match: false });
	}

	return parts;
};

export function SettingsSearchHighlight({ text }: { text?: string }) {
	const searchQuery = useSettingsSearchQuery();
	const safeText = text ? text : "";
	const parts = useMemo(
		() => buildHighlightParts(safeText, searchQuery),
		[safeText, searchQuery],
	);

	if (!safeText) return null;

	return (
		<>
			{parts.map((part, index) =>
				part.match ? (
					<mark
						key={`${part.text}-${index}`}
						className="rounded bg-primary/20 px-0.5 text-foreground"
					>
						{part.text}
					</mark>
				) : (
					<span key={`${part.text}-${index}`}>{part.text}</span>
				),
			)}
		</>
	);
}

interface SettingsSectionProps {
	title: string;
	description?: string;
	children: ReactNode;
	searchKeywords?: Array<string | undefined>;
}

/**
 * 设置区块容器组件
 */
export function SettingsSection({
	title,
	description,
	children,
	searchKeywords,
}: SettingsSectionProps) {
	const searchQuery = useContext(SettingsSearchContext);
	const isSearchActive = normalizeSearchValue(searchQuery).length > 0;
	const reportMatch = useContext(SettingsSearchMatchContext);
	const sectionId = useId();

	const isMatch = doesSearchMatch(searchQuery, [
		title,
		description,
		...(searchKeywords ?? []),
	]);

	useEffect(() => {
		if (!reportMatch) return;
		reportMatch(sectionId, isMatch);
		return () => {
			reportMatch(sectionId, false);
		};
	}, [reportMatch, sectionId, isMatch]);

	if (!isMatch) {
		return null;
	}

	return (
		<div
			className={
				isSearchActive
					? "rounded-lg border border-primary/40 bg-primary/5 p-4 ring-1 ring-primary/20"
					: "rounded-lg border border-border p-4"
			}
		>
			<div className="mb-4">
				<h3 className="mb-1 text-base font-semibold text-foreground">
					<SettingsSearchHighlight text={title} />
				</h3>
				{description && (
					<p className="text-sm text-muted-foreground">
						<SettingsSearchHighlight text={description} />
					</p>
				)}
			</div>
			{children}
		</div>
	);
}
