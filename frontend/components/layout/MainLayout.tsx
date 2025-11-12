'use client';

import { useState } from 'react';
import AppLayout from './AppLayout';
import SettingsModal from '../common/SettingsModal';
import { SelectedEventsProvider } from '@/lib/context/SelectedEventsContext';

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
    <SelectedEventsProvider>
      <div className="flex h-screen bg-background overflow-hidden">
        {/* 左中右三栏布局 */}
        <AppLayout onSettingsClick={handleSettingsClick}>
          {children}
        </AppLayout>
      </div>

      {/* 设置对话框 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleSettingsClose}
      />
    </SelectedEventsProvider>
  );
}
