"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { type ColorTheme, useColorThemeStore } from "@/lib/store/color-theme";
import { useLocaleStore } from "@/lib/store/locale";

export function ThemeStyleSelect() {
	const { colorTheme, setColorTheme } = useColorThemeStore();
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return <div className="h-9 w-[140px]" />;
	}

	const options: { value: ColorTheme; label: string }[] = [
		{ value: "blue", label: t.colorTheme.blue },
		{ value: "neutral", label: t.colorTheme.neutral },
	];

	return (
		<label className="relative inline-flex items-center">
			<span className="sr-only">{t.colorTheme.label}</span>
			<select
				value={colorTheme}
				onChange={(event) => setColorTheme(event.target.value as ColorTheme)}
				className="h-9 min-w-[136px] appearance-none rounded-md border border-border bg-background px-3 pr-8 text-sm font-medium text-foreground shadow-sm transition focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring"
				title={t.colorTheme.label}
				aria-label={t.colorTheme.label}
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
