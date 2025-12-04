'use client';

import AppLayout from './AppLayout';
import { ThemeProvider } from '@/components/common/ThemeProvider';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  // UI 配置自动从 localStorage 加载（通过 zustand persist）
  return (
    <ThemeProvider>
      <div className="flex h-screen flex-col bg-background overflow-hidden">
        <main className="flex-1 overflow-hidden h-full">
          <AppLayout>{children}</AppLayout>
        </main>
      </div>
    </ThemeProvider>
  );
}
