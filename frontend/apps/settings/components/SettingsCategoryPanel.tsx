"use client";

import type { LucideIcon } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { SettingsSearchMatchProvider } from "./SettingsSection";

export type SettingsCategoryId =
	| "workspace"
	| "automation"
	| "ai"
	| "sensing"
	| "proactive"
	| "developer"
	| "help";

export interface SettingsCategory {
	id: SettingsCategoryId;
	label: string;
	description: string;
	icon: LucideIcon;
}

interface SettingsCategoryPanelProps {
	category: SettingsCategory;
	isSearchActive: boolean;
	activeCategory: SettingsCategoryId;
	renderCategoryContent: (categoryId: SettingsCategoryId) => ReactNode;
	onMatchChange: (categoryId: SettingsCategoryId, hasMatches: boolean) => void;
}

export function SettingsCategoryPanel({
	category,
	isSearchActive,
	activeCategory,
	renderCategoryContent,
	onMatchChange,
}: SettingsCategoryPanelProps) {
	const [matchedSectionIds, setMatchedSectionIds] = useState<
		Record<string, boolean>
	>({});

	const handleMatchChange = useCallback(
		(id: string, isMatch: boolean) => {
			setMatchedSectionIds((prev) => {
				const hasMatch = Boolean(prev[id]);
				if (hasMatch === isMatch) return prev;
				const next = { ...prev };
				if (isMatch) {
					next[id] = true;
				} else {
					delete next[id];
				}
				return next;
			});
		},
		[],
	);

	const hasMatches = Object.keys(matchedSectionIds).length > 0;

	useEffect(() => {
		onMatchChange(category.id, hasMatches);
	}, [category.id, hasMatches, onMatchChange]);

	const isActive = isSearchActive ? hasMatches : category.id === activeCategory;
	const Icon = category.icon;

	const labelId = `settings-category-label-${category.id}`;

	const content = (
		<>
			{(!isSearchActive || hasMatches) && (
				<div className="rounded-lg border border-border/60 bg-muted/30 p-4">
					<div className="flex items-center gap-2">
						<Icon className="h-4 w-4 text-primary" />
						<h3
							id={labelId}
							className="text-sm font-semibold text-foreground"
						>
							{category.label}
						</h3>
					</div>
					<p className="mt-1 text-sm text-muted-foreground">
						{category.description}
					</p>
				</div>
			)}
			<SettingsSearchMatchProvider onMatchChange={handleMatchChange}>
				{renderCategoryContent(category.id)}
			</SettingsSearchMatchProvider>
		</>
	);

	if (isSearchActive) {
		return (
			<div
				id={`settings-category-panel-${category.id}`}
				hidden={!isActive}
				className={cn("space-y-6", !isActive && "hidden")}
			>
				{content}
			</div>
		);
	}

	return (
		<div
			id={`settings-category-panel-${category.id}`}
			role="tabpanel"
			aria-labelledby={`settings-category-tab-${category.id}`}
			hidden={!isActive}
			className={cn("space-y-6", !isActive && "hidden")}
		>
			{content}
		</div>
	);
}
