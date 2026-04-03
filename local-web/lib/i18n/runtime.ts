import { createTranslator } from "next-intl";
import enMessages from "@/lib/i18n/messages/en.json";
import zhMessages from "@/lib/i18n/messages/zh.json";
import type { Locale } from "@/lib/store/locale";
import { useLocaleStore } from "@/lib/store/locale";

const MESSAGES: Record<Locale, typeof enMessages> = {
	en: enMessages,
	zh: zhMessages,
};

const DEFAULT_LOCALE: Locale = "en";

const getRuntimeLocale = (): Locale => {
	const locale = useLocaleStore.getState().locale;
	return locale in MESSAGES ? locale : DEFAULT_LOCALE;
};

export const getClientTranslator = () => {
	const locale = getRuntimeLocale();
	return createTranslator({
		locale,
		messages: MESSAGES[locale],
	});
};
