'use client';

import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { useThemeStore } from '@/lib/store/theme';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

export default function ThemeToggle() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const { locale } = useLocaleStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="h-9 w-9" />
    );
  }

  const t = useTranslations(locale);

  const themes = [
    { value: 'light' as const, icon: Sun, label: t.theme.light },
    { value: 'dark' as const, icon: Moon, label: t.theme.dark },
    { value: 'system' as const, icon: Monitor, label: t.theme.system },
  ];

  return (
    <button
      onClick={() => {
        const currentIndex = themes.findIndex((themeItem) => themeItem.value === theme);
        const nextIndex = (currentIndex + 1) % themes.length;
        setTheme(themes[nextIndex].value);
      }}
      className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      title={`${t.layout.currentTheme}: ${themes.find((themeItem) => themeItem.value === theme)?.label}`}
      aria-label={`${t.layout.currentTheme}: ${themes.find((themeItem) => themeItem.value === theme)?.label}`}
    >
      {theme === 'light' && <Sun className="h-5 w-5" />}
      {theme === 'dark' && <Moon className="h-5 w-5" />}
      {theme === 'system' && <Monitor className="h-5 w-5" />}
    </button>
  );
}
