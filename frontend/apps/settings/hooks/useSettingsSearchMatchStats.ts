"use client";

import { useCallback, useMemo, useState } from "react";
import type { SettingsCategoryId } from "../components/SettingsCategoryPanel";

interface UseSettingsSearchMatchStatsOptions {
	categoriesCount: number;
	isSearchActive: boolean;
}

export function useSettingsSearchMatchStats({
	categoriesCount,
	isSearchActive,
}: UseSettingsSearchMatchStatsOptions) {
	const [matchesByCategory, setMatchesByCategory] = useState<
		Partial<Record<SettingsCategoryId, boolean>>
	>({});

	const handleCategoryMatchChange = useCallback(
		(categoryId: SettingsCategoryId, hasMatches: boolean) => {
			setMatchesByCategory((prev) => {
				if (prev[categoryId] === hasMatches) return prev;
				return { ...prev, [categoryId]: hasMatches };
			});
		},
		[],
	);

	const hasSearchMatches = useMemo(
		() => Object.values(matchesByCategory).some(Boolean),
		[matchesByCategory],
	);
	const searchMatchesReady = useMemo(
		() => Object.keys(matchesByCategory).length === categoriesCount,
		[matchesByCategory, categoriesCount],
	);
	const showNoResults =
		isSearchActive && searchMatchesReady && !hasSearchMatches;

	return {
		handleCategoryMatchChange,
		hasSearchMatches,
		searchMatchesReady,
		showNoResults,
	};
}
