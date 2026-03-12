import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// Supported locales - add new languages here
// Future languages: "ja" | "ko" | "ru" | "fr"
export type Locale = "zh" | "en";

// Supported locales list for validation and detection
const SUPPORTED_LOCALES: Locale[] = ["zh", "en"];

// Default locale when no match is found
const DEFAULT_LOCALE: Locale = "en";

interface LocaleState {
	locale: Locale;
	setLocale: (locale: Locale) => void;
	/** Whether the store has been hydrated from localStorage */
	_hasHydrated: boolean;
	/** Set hydration state */
	_setHasHydrated: (state: boolean) => void;
}

const isValidLocale = (value: string | null): value is Locale => {
	return value !== null && SUPPORTED_LOCALES.includes(value as Locale);
};

// Detect system language and return default locale
// Returns matching locale if system language is supported, otherwise default
const getSystemLocale = (): Locale => {
	if (typeof navigator === "undefined") return DEFAULT_LOCALE;

	const browserLang = (navigator.language || navigator.languages?.[0] || "").toLowerCase();

	// Match against supported locales by prefix
	for (const locale of SUPPORTED_LOCALES) {
		if (browserLang.startsWith(locale)) {
			return locale;
		}
	}

	return DEFAULT_LOCALE;
};

// 同步 locale 到 cookie，使服务端可以读取
// 注意：必须使用同步的 document.cookie，不能使用异步的 Cookie Store API
// 否则在 router.refresh() 或页面刷新时，cookie 可能还未设置完成
const syncLocaleToCookie = (locale: Locale) => {
	if (typeof document === "undefined") return;
	// 设置 cookie，有效期 1 年
	// biome-ignore lint/suspicious/noDocumentCookie: 需要同步设置 cookie 以确保刷新前完成
	document.cookie = `locale=${locale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
};

const localeStorage = {
	getItem: () => {
		if (typeof window === "undefined") return null;

		const language = localStorage.getItem("language");
		// If user has a saved preference, use it; otherwise detect from system language
		const locale: Locale = isValidLocale(language)
			? language
			: getSystemLocale();
		// Sync to cookie on initialization
		syncLocaleToCookie(locale);
		return JSON.stringify({ state: { locale } });
	},
	setItem: (_name: string, value: string) => {
		if (typeof window === "undefined") return;

		try {
			const data = JSON.parse(value);
			const rawLocale = data.state?.locale || data.locale || getSystemLocale();
			const locale: Locale = isValidLocale(rawLocale)
				? rawLocale
				: getSystemLocale();
			localStorage.setItem("language", locale);
			// Sync to cookie
			syncLocaleToCookie(locale);
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
			locale: getSystemLocale(),
			_hasHydrated: false,
			_setHasHydrated: (state: boolean) => set({ _hasHydrated: state }),
			setLocale: (locale) => {
				// Immediately sync to cookie
				syncLocaleToCookie(locale);
				set({ locale });
			},
		}),
		{
			name: "locale",
			storage: createJSONStorage(() => localeStorage),
			onRehydrateStorage: () => (state) => {
				// Called when hydration is complete
				state?._setHasHydrated(true);
			},
		},
	),
);
