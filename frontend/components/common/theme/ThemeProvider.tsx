"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import { useEffect } from "react";
import { useColorThemeStore } from "@/lib/store/color-theme";

interface ThemeProviderProps {
	children: React.ReactNode;
}

function ColorThemeApplier() {
	const colorTheme = useColorThemeStore((state) => state.colorTheme);

	useEffect(() => {
		if (typeof document === "undefined") return;
		document.documentElement.dataset.colorTheme = colorTheme;
	}, [colorTheme]);

	return null;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
	return (
		<NextThemesProvider
			attribute="class"
			defaultTheme="system"
			enableSystem
			storageKey="theme"
			disableTransitionOnChange={false}
		>
			<ColorThemeApplier />
			{children}
		</NextThemesProvider>
	);
}
