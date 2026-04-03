"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	const tTheme = useTranslations("theme");
	const tLayout = useTranslations("layout");

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return <div className="h-9 w-9" />;
	}

	const themes = [
		{ value: "light" as const, icon: Sun, label: tTheme("light") },
		{ value: "dark" as const, icon: Moon, label: tTheme("dark") },
		{ value: "system" as const, icon: Monitor, label: tTheme("system") },
	];

	const validThemes = themes.map((t) => t.value);
	const currentTheme =
		theme && validThemes.includes(theme as (typeof validThemes)[number])
			? (theme as (typeof validThemes)[number])
			: "system";
	const currentIndex = themes.findIndex(
		(themeItem) => themeItem.value === currentTheme,
	);
	const currentThemeLabel =
		themes.find((themeItem) => themeItem.value === currentTheme)?.label || "";

	const CurrentIcon =
		themes.find((themeItem) => themeItem.value === currentTheme)?.icon ||
		Monitor;

	return (
		<button
			type="button"
			onClick={() => {
				const nextIndex = (currentIndex + 1) % themes.length;
				const newTheme = themes[nextIndex].value;
				setTheme(newTheme);
			}}
			className="rounded-md p-2 text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground hover:shadow-md active:scale-95 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			title={`${tLayout("currentTheme")}: ${currentThemeLabel}`}
			aria-label={`${tLayout("currentTheme")}: ${currentThemeLabel}`}
		>
			<CurrentIcon className="h-5 w-5" />
		</button>
	);
}
