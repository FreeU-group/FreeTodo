"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { type ColorTheme, useColorThemeStore } from "@/lib/store/color-theme";

export function ThemeStyleSelect() {
	const { colorTheme, setColorTheme } = useColorThemeStore();
	const t = useTranslations("colorTheme");
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return <div className="h-9 w-[140px]" />;
	}

	const options: { value: ColorTheme; label: string }[] = [
		{ value: "blue", label: t("blue") },
		{ value: "neutral", label: t("neutral") },
	];

	return (
		<label className="relative inline-flex items-center">
			<span className="sr-only">{t("label")}</span>
			<select
				value={colorTheme}
				onChange={(event) => setColorTheme(event.target.value as ColorTheme)}
				className="h-9 min-w-[136px] appearance-none rounded-md border border-border bg-background px-3 pr-8 text-sm font-medium text-foreground shadow-sm transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
				title={t("label")}
				aria-label={t("label")}
			>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
			<ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-muted-foreground" />
		</label>
	);
}
