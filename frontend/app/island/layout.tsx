import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ThemeProvider } from "@/components/common/theme/ThemeProvider";
import { CapabilitiesSync } from "@/components/common/ui/CapabilitiesSync";
import { QueryProvider } from "@/lib/query/provider";
import "@/app/globals.css";
import "./island.css";

export const metadata: Metadata = {
  title: "Dynamic Island",
  description: "FreeTodo Dynamic Island Widget",
};

/**
 * Island 页面独立布局
 * 包含必要的 Provider 以支持 FreeTodo 组件
 * 注意：不使用独立的 html/body，而是作为子布局
 */
export default async function IslandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <div className="island-root">
      <QueryProvider>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ThemeProvider>
            <CapabilitiesSync />
            {children}
          </ThemeProvider>
        </NextIntlClientProvider>
      </QueryProvider>
    </div>
  );
}
