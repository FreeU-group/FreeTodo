import { cookies, headers } from "next/headers";
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

/**
 * 从 Accept-Language header 解析用户偏好的语言
 * 格式示例: "zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6"
 */
function parseAcceptLanguage(acceptLanguage: string | null): Locale | null {
	if (!acceptLanguage) return null;

	// 解析并按权重排序
	const languages = acceptLanguage
		.split(",")
		.map((lang) => {
			const [code, qValue] = lang.trim().split(";q=");
			return {
				// 取语言代码的前缀部分 (zh-CN -> zh, en-US -> en)
				code: code.split("-")[0].toLowerCase(),
				// 默认权重为 1
				q: qValue ? Number.parseFloat(qValue) : 1,
			};
		})
		.sort((a, b) => b.q - a.q);

	// 找到第一个匹配的支持语言
	for (const { code } of languages) {
		if (SUPPORTED_LOCALES.includes(code as Locale)) {
			return code as Locale;
		}
	}

	return null;
}

export default getRequestConfig(async () => {
	const cookieStore = await cookies();
	const localeCookie = cookieStore.get("locale")?.value;

	let locale: Locale;

	if (isValidLocale(localeCookie)) {
		// 优先使用用户手动选择的语言（cookie）
		locale = localeCookie;
	} else {
		// Cookie 为空时，从 Accept-Language header 检测浏览器语言
		const headerStore = await headers();
		const acceptLanguage = headerStore.get("accept-language");
		const browserLocale = parseAcceptLanguage(acceptLanguage);
		locale = browserLocale ?? DEFAULT_LOCALE;
	}

	return {
		locale,
		messages: (await import(`./messages/${locale}.json`)).default,
	};
});
