import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ThemeProvider } from "@/components/common/theme/ThemeProvider";
import { ScrollbarController } from "@/components/common/ui/ScrollbarController";
import { DynamicIslandProvider } from "@/components/DynamicIsland/DynamicIslandProvider";
import { QueryProvider } from "@/lib/query/provider";
import { TransparentBody } from "@/components/DynamicIsland/TransparentBody";
import { ElectronTransparentScript } from "@/components/DynamicIsland/ElectronTransparentScript";
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
		<html 
			lang={locale} 
			suppressHydrationWarning
			style={{ backgroundColor: 'transparent', background: 'transparent' }}
		>
			<body
				className="min-h-screen bg-background text-foreground antialiased"
				suppressHydrationWarning
				style={{ backgroundColor: 'transparent', background: 'transparent' }}
			>
				<ElectronTransparentScript />
				<TransparentBody />
				<ScrollbarController />
				<QueryProvider>
					<NextIntlClientProvider messages={messages}>
						<ThemeProvider>
							{children}
							<DynamicIslandProvider />
						</ThemeProvider>
					</NextIntlClientProvider>
				</QueryProvider>
			</body>
		</html>
	);
}
