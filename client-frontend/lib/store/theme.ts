import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Theme = "light" | "dark" | "system";

interface ThemeState {
	theme: Theme;
	_hasHydrated: boolean;
	setTheme: (theme: Theme) => void;
	setHasHydrated: (state: boolean) => void;
}

const themeStorage = {
	getItem: () => {
		if (typeof window === "undefined") return null;

		const theme = localStorage.getItem("theme") || "system";

		return JSON.stringify({
			state: {
				theme,
				_hasHydrated: false,
			},
		});
	},
	setItem: (_name: string, value: string) => {
		if (typeof window === "undefined") return;

		try {
			const data = JSON.parse(value);
			const state = data.state || data;

			if (state.theme) {
				localStorage.setItem("theme", state.theme);
			}
		} catch (e) {
			console.error("Error saving theme:", e);
		}
	},
	removeItem: () => {
		if (typeof window === "undefined") return;
		localStorage.removeItem("theme");
	},
};

export const useThemeStore = create<ThemeState>()(
	persist(
		(set) => ({
			theme: "system",
			_hasHydrated: false,
			setTheme: (theme) => set({ theme }),
			setHasHydrated: (state) => set({ _hasHydrated: state }),
		}),
		{
			name: "theme-config",
			storage: createJSONStorage(() => themeStorage),
			onRehydrateStorage: () => (state) => {
				state?.setHasHydrated(true);
			},
		},
	),
);
