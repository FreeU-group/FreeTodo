"use client";

import { User } from "lucide-react";
import { useTranslations } from "@/lib/i18n";
import { useLocaleStore } from "@/lib/store/locale";

export function UserAvatar() {
	const { locale } = useLocaleStore();
	const t = useTranslations(locale);

	return (
		<button
			type="button"
			className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-all duration-200 hover:bg-muted/80 hover:text-foreground hover:shadow-md active:scale-95 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			title={t.layout.userSettings}
			aria-label={t.layout.userSettings}
		>
			<User className="h-5 w-5" />
		</button>
	);
}
