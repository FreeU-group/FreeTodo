'use client';

import { useState } from 'react';
import Header from './Header';
import AppLayout from './AppLayout';
import SettingsModal from '../common/SettingsModal';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const handleSettingsClick = () => {
    setIsSettingsOpen(true);
  };

  const handleSettingsClose = () => {
    setIsSettingsOpen(false);
  };

  return (
    <>
      <div className="flex h-screen flex-col bg-background overflow-hidden">
        <Header onSettingsClick={handleSettingsClick} />
        <main className="flex-1 overflow-hidden h-[calc(100vh-4rem)]">
          <AppLayout>{children}</AppLayout>
        </main>
      </div>

      {/* 设置对话框 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleSettingsClose}
      />
    </>
  );
}
