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

// 同步 locale 到 cookie，使服务端可以读取
const syncLocaleToCookie = (locale: Locale) => {
	if (typeof document === "undefined") return;
	// 设置 cookie，有效期 1 年
	// 使用 Cookie Store API（如果可用），否则回退到 document.cookie
	if ("cookieStore" in window && window.cookieStore) {
		void (window.cookieStore as CookieStoreApi).set({
			name: "locale",
			value: locale,
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
			sameSite: "lax",
		});
	} else {
		// biome-ignore lint/suspicious/noDocumentCookie: 作为 Cookie Store API 的回退方案
		document.cookie = `locale=${locale};path=/;max-age=${60 * 60 * 24 * 365};SameSite=Lax`;
	}
};

const localeStorage = {
	getItem: () => {
		if (typeof window === "undefined") return null;

		const language = localStorage.getItem("language");
		const locale: Locale = isValidLocale(language) ? language : "zh";
		// 初始化时同步到 cookie
		syncLocaleToCookie(locale);
		return JSON.stringify({ state: { locale } });
	},
	setItem: (_name: string, value: string) => {
		if (typeof window === "undefined") return;

		try {
			const data = JSON.parse(value);
			const rawLocale = data.state?.locale || data.locale || "zh";
			const locale: Locale = isValidLocale(rawLocale) ? rawLocale : "zh";
			localStorage.setItem("language", locale);
			// 同步到 cookie
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
			locale: "zh",
			setLocale: (locale) => {
				// 立即同步到 cookie
				syncLocaleToCookie(locale);
				set({ locale });
			},
		}),
		{
			name: "locale",
			storage: createJSONStorage(() => localeStorage),
		},
	),
);
