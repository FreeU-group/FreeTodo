"use client";

import { Languages } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "@/lib/i18n";
import { type Locale, useLocaleStore } from "@/lib/store/locale";

export function LanguageToggle() {
	const { locale, setLocale } = useLocaleStore();
	const [mounted, setMounted] = useState(false);
	const t = useTranslations(locale);

	useEffect(() => {
		setMounted(true);
	}, []);

	if (!mounted) {
		return <div className="h-9 w-9" />;
	}

	const languages: { value: Locale; label: string }[] = [
		{ value: "zh", label: t.language.zh },
		{ value: "en", label: t.language.en },
	];

	const handleToggle = () => {
		const currentIndex = languages.findIndex((l) => l.value === locale);
		const nextIndex = (currentIndex + 1) % languages.length;
		setLocale(languages[nextIndex].value);
	};

	const currentLanguage = languages.find((l) => l.value === locale);

	return (
		<button
			type="button"
			onClick={handleToggle}
			className="rounded-md p-2 text-foreground transition-all duration-200 hover:bg-muted hover:text-foreground hover:shadow-md active:scale-95 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			title={`${t.layout.currentLanguage}: ${currentLanguage?.label}`}
			aria-label={`${t.layout.currentLanguage}: ${currentLanguage?.label}`}
		>
			<Languages className="h-5 w-5" />
		</button>
	);
}
