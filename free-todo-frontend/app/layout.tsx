import type { Metadata } from "next";
import { ThemeProvider } from "@/components/common/ThemeProvider";
import { QueryProvider } from "@/lib/query/provider";
import "./globals.css";

interface RootLayoutProps {
	children: React.ReactNode;
}

export const metadata: Metadata = {
	title: "Free Todo",
	description: "A todo app that tracks your life.",
};

export default function RootLayout({ children }: RootLayoutProps) {
	return (
		<html lang="en" suppressHydrationWarning>
			<body
				className="min-h-screen bg-background text-foreground antialiased"
				suppressHydrationWarning
			>
				<QueryProvider>
					<ThemeProvider>{children}</ThemeProvider>
				</QueryProvider>
			</body>
		</html>
	);
}
