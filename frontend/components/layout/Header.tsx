'use client';

import Image from 'next/image';
import { Settings } from 'lucide-react';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

interface HeaderProps {
  onSettingsClick: () => void;
}

export default function Header({ onSettingsClick }: HeaderProps) {
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background shadow-sm">
      <div className="flex h-12 items-center justify-between w-full px-8">
        {/* Logo + Title */}
        <div className="flex items-center space-x-2">
          <div className="relative h-6 w-6 flex-shrink-0">
            <Image
              src="/logo.png"
              alt="LifeTrace Logo"
              fill
              className="object-contain"
              unoptimized
            />
          </div>
          <h1 className="text-lg font-bold text-foreground">LifeTrace</h1>
        </div>

        {/* Settings Button */}
        <button
          onClick={onSettingsClick}
          className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
          aria-label={t.ariaLabel.settings}
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
