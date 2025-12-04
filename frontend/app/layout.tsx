import type { Metadata } from "next";
import "./globals.css";
import MainLayout from "@/components/layout/MainLayout";
import { Toaster } from "sonner";

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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  // 从新的 localStorage key 读取
                  const theme = localStorage.getItem('theme') || 'system';

                  // 调试信息
                  console.log('[Theme Init] localStorage theme:', theme);

                  // 清理旧的 key（只在首次运行时）
                  if (localStorage.getItem('ui-config-storage')) {
                    console.log('[Theme Init] Cleaning up old keys...');
                    localStorage.removeItem('lifetrace-theme');
                    localStorage.removeItem('theme-storage');
                    localStorage.removeItem('ui-config-storage');
                  }

                  // 移除可能存在的主题类
                  document.documentElement.classList.remove('light', 'dark');

                  // 应用主题
                  if (theme === 'system') {
                    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                    const appliedTheme = isDark ? 'dark' : 'light';
                    console.log('[Theme Init] System theme detected:', appliedTheme);
                    document.documentElement.classList.add(appliedTheme);
                  } else {
                    console.log('[Theme Init] Applying theme:', theme);
                    document.documentElement.classList.add(theme);
                  }
                } catch (e) {
                  console.error('[Theme Init] Error:', e);
                  // 出错时使用系统主题
                  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  document.documentElement.classList.remove('light', 'dark');
                  document.documentElement.classList.add(isDark ? 'dark' : 'light');
                }
              })();
            `,
          }}
        />
        <MainLayout>{children}</MainLayout>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
