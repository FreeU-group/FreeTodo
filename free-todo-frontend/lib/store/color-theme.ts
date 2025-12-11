import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ColorTheme = "blue" | "neutral";

interface ColorThemeState {
	colorTheme: ColorTheme;
	setColorTheme: (colorTheme: ColorTheme) => void;
}

const isValidColorTheme = (value: string | null): value is ColorTheme => {
	return value === "blue" || value === "neutral";
};

const colorThemeStorage = {
	getItem: () => {
		if (typeof window === "undefined") return null;

		const saved = localStorage.getItem("color-theme");
		const colorTheme: ColorTheme = isValidColorTheme(saved) ? saved : "blue";

		return JSON.stringify({ state: { colorTheme } });
	},
	setItem: (_name: string, value: string) => {
		if (typeof window === "undefined") return;

		try {
			const data = JSON.parse(value);
			const rawTheme = data.state?.colorTheme ?? data.colorTheme ?? "blue";
			const colorTheme: ColorTheme = isValidColorTheme(rawTheme)
				? rawTheme
				: "blue";
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
			colorTheme: "blue",
			setColorTheme: (colorTheme) => set({ colorTheme }),
		}),
		{
			name: "color-theme",
			storage: createJSONStorage(() => colorThemeStorage),
		},
	),
);
