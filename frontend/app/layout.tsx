import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "sonner";
import MainLayout from "@/components/layout/MainLayout";

export const metadata: Metadata = {
	title: "LifeTrace - 智能生活记录系统",
	description: "智能截图记录、搜索和分析系统",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="zh-CN" suppressHydrationWarning>
			<body className="antialiased" suppressHydrationWarning>
				<script src="/theme-init.js" />
				<MainLayout>{children}</MainLayout>
				<Toaster position="top-right" richColors closeButton />
			</body>
		</html>
	);
}
