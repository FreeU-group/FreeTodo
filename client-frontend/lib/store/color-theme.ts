import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ColorTheme =
	| "catppuccin"
	| "blue"
	| "neutral";

interface ColorThemeState {
	colorTheme: ColorTheme;
	setColorTheme: (colorTheme: ColorTheme) => void;
}

const isValidColorTheme = (value: string | null): value is ColorTheme => {
	return (
		value === "catppuccin" ||
		value === "blue" ||
		value === "neutral"
	);
};

const normalizeColorTheme = (value: string | null): ColorTheme => {
	if (value === "amber-coast") return "catppuccin";
	if (isValidColorTheme(value)) return value;
	return "catppuccin";
};

const colorThemeStorage = {
	getItem: () => {
		if (typeof window === "undefined") return null;

		const saved = localStorage.getItem("color-theme");
		const colorTheme = normalizeColorTheme(saved);

		return JSON.stringify({ state: { colorTheme } });
	},
	setItem: (_name: string, value: string) => {
		if (typeof window === "undefined") return;

		try {
			const data = JSON.parse(value);
			const rawTheme =
				data.state?.colorTheme ?? data.colorTheme ?? "catppuccin";
			const colorTheme = normalizeColorTheme(rawTheme);
			localStorage.setItem("color-theme", colorTheme);
		} catch (e) {
			console.error("Error saving color theme:", e);
		}
	},
	removeItem: () => {
		if (typeof window === "undefined") return;
		localStorage.removeItem("color-theme");
	},
};

export const useColorThemeStore = create<ColorThemeState>()(
	persist(
		(set) => ({
			colorTheme: "catppuccin",
			setColorTheme: (colorTheme) => set({ colorTheme }),
		}),
		{
			name: "color-theme",
			storage: createJSONStorage(() => colorThemeStorage),
		},
	),
);
