import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ThemeProvider } from "@/components/common/theme/ThemeProvider";
import { LocaleSync } from "@/components/common/ui/LocaleSync";
import { ScrollbarController } from "@/components/common/ui/ScrollbarController";
import { QueryProvider } from "@/lib/query/provider";
import "./globals.css";

interface RootLayoutProps {
	children: React.ReactNode;
}

export const metadata: Metadata = {
	title: "Free Todo",
	description: "A todo app that tracks your life.",
};

export default async function RootLayout({ children }: RootLayoutProps) {
	const locale = await getLocale();
	const messages = await getMessages();

	return (
		<html lang={locale} suppressHydrationWarning>
			<body
				className="min-h-screen bg-background text-foreground antialiased"
				suppressHydrationWarning
			>
				<ScrollbarController />
				<QueryProvider>
					<NextIntlClientProvider messages={messages}>
						<LocaleSync />
						<ThemeProvider>{children}</ThemeProvider>
					</NextIntlClientProvider>
				</QueryProvider>
			</body>
		</html>
	);
}
