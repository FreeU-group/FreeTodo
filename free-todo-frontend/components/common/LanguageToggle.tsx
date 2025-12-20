"use client";

import { Languages } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { type Locale, useLocaleStore } from "@/lib/store/locale";

export function LanguageToggle() {
	const { locale, setLocale } = useLocaleStore();
	const [mounted, setMounted] = useState(false);
	const tLang = useTranslations("language");
	const tLayout = useTranslations("layout");

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return <div className="h-9 w-9" />;
	}

	const languages: { value: Locale; label: string }[] = [
		{ value: "zh", label: tLang("zh") },
		{ value: "en", label: tLang("en") },
	];

	const handleToggle = () => {
		const currentIndex = languages.findIndex((l) => l.value === locale);
		const nextIndex = (currentIndex + 1) % languages.length;
		setLocale(languages[nextIndex].value);
		// 需要刷新页面让服务端读取新的 cookie
		window.location.reload();
	};

	const currentLanguage = languages.find((l) => l.value === locale);

	return (
		<button
			type="button"
			onClick={handleToggle}
			className="rounded-md p-2 text-foreground transition-all duration-200 hover:bg-muted hover:text-foreground hover:shadow-md active:scale-95 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			title={`${tLayout("currentLanguage")}: ${currentLanguage?.label}`}
			aria-label={`${tLayout("currentLanguage")}: ${currentLanguage?.label}`}
		>
			<Languages className="h-5 w-5" />
		</button>
	);
}
