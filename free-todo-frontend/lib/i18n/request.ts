import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

// Supported locales - add new languages here
// Must match the files in ./messages/ directory
const SUPPORTED_LOCALES = ["zh", "en"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

// Default locale when no match is found
const DEFAULT_LOCALE: Locale = "en";

const isValidLocale = (value: string | undefined): value is Locale => {
	return value !== undefined && SUPPORTED_LOCALES.includes(value as Locale);
};

export default getRequestConfig(async () => {
	// Read locale from cookie, default to "en" (client-side will detect system language on hydration)
	const cookieStore = await cookies();
	const localeCookie = cookieStore.get("locale")?.value;
	const locale: Locale = isValidLocale(localeCookie)
		? localeCookie
		: DEFAULT_LOCALE;

	return {
		locale,
		messages: (await import(`./messages/${locale}.json`)).default,
	};
});
