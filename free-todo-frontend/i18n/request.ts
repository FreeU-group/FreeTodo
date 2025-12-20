import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

const locales = ["zh", "en"] as const;
type Locale = (typeof locales)[number];

export default getRequestConfig(async () => {
	// 从 cookie 中读取 locale，默认回退到 zh
	const cookieStore = await cookies();
	const localeCookie = cookieStore.get("locale")?.value;
	const locale: Locale =
		localeCookie === "zh" || localeCookie === "en" ? localeCookie : "zh";

	return {
		locale,
		messages: (await import(`../messages/${locale}.json`)).default,
	};
});
