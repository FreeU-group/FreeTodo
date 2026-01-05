import type { Locale } from "@/lib/store/locale";
import { en } from "./locales/en";
import { zh } from "./locales/zh";

const translations = {
	zh,
	en,
};

export function useTranslations(locale: Locale) {
	return translations[locale];
}

export { zh, en };
export type { Translation } from "./locales/zh";
