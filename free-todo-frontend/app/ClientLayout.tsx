"use client";

import { NextIntlClientProvider } from "next-intl";
import { ThemeProvider } from "@/components/common/theme/ThemeProvider";
import { ScrollbarController } from "@/components/common/ui/ScrollbarController";
import { DynamicIslandProvider } from "@/components/DynamicIsland/DynamicIslandProvider";
import { ElectronTransparentScript } from "@/components/DynamicIsland/ElectronTransparentScript";
import { TransparentBody } from "@/components/DynamicIsland/TransparentBody";
import { QueryProvider } from "@/lib/query/provider";

interface ClientLayoutProps {
	children: React.ReactNode;
	messages: IntlMessages;
	locale: string;
}

/**
 * 客户端 Layout 组件
 * 完全禁用 SSR，避免 SSR 导致的窗口显示问题
 */
export function ClientLayout({
	children,
	messages,
	locale,
}: ClientLayoutProps) {
	return (
		<html
			lang={locale}
			suppressHydrationWarning
			style={{ backgroundColor: "transparent", background: "transparent" }}
		>
			<head>
				{/* 在 head 中直接注入透明背景样式，确保在页面渲染前就生效 */}
				<style
					// biome-ignore lint/security/noDangerouslySetInnerHtml: Electron透明背景需要内联样式
					dangerouslySetInnerHTML={{
						__html: `
						html, body, #__next, #__next > div {
							background-color: transparent !important;
							background: transparent !important;
						}
					`,
					}}
				/>
			</head>
			<body
				className="min-h-screen bg-background text-foreground antialiased"
				suppressHydrationWarning
				style={{ backgroundColor: "transparent", background: "transparent" }}
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
