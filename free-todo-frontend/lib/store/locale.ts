import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type Locale = "zh" | "en";

interface LocaleState {
	locale: Locale;
	setLocale: (locale: Locale) => void;
}

const isValidLocale = (value: string | null): value is Locale => {
	return value === "zh" || value === "en";
};

const localeStorage = {
	getItem: () => {
		if (typeof window === "undefined") return null;

		const language = localStorage.getItem("language");
		const locale: Locale = isValidLocale(language) ? language : "zh";
		return JSON.stringify({ state: { locale } });
	},
	setItem: (_name: string, value: string) => {
		if (typeof window === "undefined") return;

		try {
			const data = JSON.parse(value);
			const rawLocale = data.state?.locale || data.locale || "zh";
			const locale: Locale = isValidLocale(rawLocale) ? rawLocale : "zh";
			localStorage.setItem("language", locale);
		} catch (e) {
			console.error("Error saving locale:", e);
		}
	},
	removeItem: () => {
		if (typeof window === "undefined") return;
		localStorage.removeItem("language");
	},
};

export const useLocaleStore = create<LocaleState>()(
	persist(
		(set) => ({
			locale: "zh",
			setLocale: (locale) => set({ locale }),
		}),
		{
			name: "locale",
			storage: createJSONStorage(() => localeStorage),
		},
	),
);
