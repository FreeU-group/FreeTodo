import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ThemeProvider } from "@/components/common/theme/ThemeProvider";
import { BackendReadyGate } from "@/components/common/ui/BackendReadyGate";
import { CapabilitiesSync } from "@/components/common/ui/CapabilitiesSync";
import { DockTriggerZone } from "@/components/common/ui/DockTriggerZone";
import { LocaleSync } from "@/components/common/ui/LocaleSync";
import { QuerySync } from "@/components/common/ui/QuerySync";
import { ScrollbarController } from "@/components/common/ui/ScrollbarController";
import { UiStoreSync } from "@/components/common/ui/UiStoreSync";
import { QueryProvider } from "@/lib/query/provider";
import "./globals.css";
import "driver.js/dist/driver.css";

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
	const remoteBackendUrl = process.env.FREETODO_REMOTE_API_URL || "";

	return (
		<html lang={locale} suppressHydrationWarning>
			<body
				className="min-h-screen bg-background text-foreground antialiased"
				suppressHydrationWarning
			>
				<script>{`window.__BACKEND_URL__ = ${JSON.stringify(remoteBackendUrl)};`}</script>
				<ScrollbarController />
				<QueryProvider>
					<NextIntlClientProvider messages={messages}>
						<LocaleSync />
						<UiStoreSync />
						<QuerySync />
						<CapabilitiesSync />
						<DockTriggerZone />
						<ThemeProvider>
							<BackendReadyGate>{children}</BackendReadyGate>
						</ThemeProvider>
					</NextIntlClientProvider>
				</QueryProvider>
			</body>
		</html>
	);
}
