'use client';

import AppLayout from './AppLayout';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  return (
      <div className="flex h-screen flex-col bg-background overflow-hidden">
      <main className="flex-1 overflow-hidden h-full">
          <AppLayout>{children}</AppLayout>
        </main>
      </div>
  );
}
