'use client';

import Image from 'next/image';
import { Settings, Sun, Moon, Monitor, Globe } from 'lucide-react';
import { useLocaleStore } from '@/lib/store/locale';
import { useThemeStore } from '@/lib/store/theme';
import { useTranslations } from '@/lib/i18n';
import { useState, useRef, useEffect } from 'react';

interface HeaderProps {
  onSettingsClick: () => void;
}

export default function Header({ onSettingsClick }: HeaderProps) {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const t = useTranslations(locale);

  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [systemThemeIsDark, setSystemThemeIsDark] = useState(() => {
    // 懒初始化：在组件挂载时获取系统主题
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });
  const themeMenuRef = useRef<HTMLDivElement>(null);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  // 监听系统主题变化
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = (e: MediaQueryListEvent) => {
      setSystemThemeIsDark(e.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (themeMenuRef.current && !themeMenuRef.current.contains(event.target as Node)) {
        setShowThemeMenu(false);
      }
      if (languageMenuRef.current && !languageMenuRef.current.contains(event.target as Node)) {
        setShowLanguageMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 切换主题
  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    setShowThemeMenu(false);
    // UI 配置自动保存到 localStorage（通过 zustand persist）
  };

  // 切换语言
  const handleLanguageChange = (newLocale: 'zh' | 'en') => {
    setLocale(newLocale);
    setShowLanguageMenu(false);
    // 语言配置自动保存到 localStorage（通过 zustand persist）
  };

  // 获取当前实际生效的主题图标
  const getThemeIcon = () => {
    if (theme === 'system') {
      // system 模式：显示实际生效的主题图标
      return systemThemeIsDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />;
    }

    // 非 system 模式：显示选择的主题图标
    return theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />;
  };

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

        {/* Right Actions */}
        <div className="flex items-center space-x-2">
          {/* 主题切换 */}
          <div className="relative" ref={themeMenuRef}>
            <button
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
              aria-label={t.layout.currentTheme}
            >
              {getThemeIcon()}
            </button>

            {showThemeMenu && (
              <div className="absolute right-0 mt-2 w-36 rounded-lg border bg-background shadow-lg">
                <div className="py-1">
                  <button
                    onClick={() => handleThemeChange('light')}
                    className={`flex w-full items-center space-x-2 px-4 py-2 text-sm hover:bg-muted ${
                      theme === 'light' ? 'text-primary font-medium' : 'text-foreground'
                    }`}
                  >
                    <Sun className="h-4 w-4" />
                    <span>{t.theme.light}</span>
                  </button>
                  <button
                    onClick={() => handleThemeChange('dark')}
                    className={`flex w-full items-center space-x-2 px-4 py-2 text-sm hover:bg-muted ${
                      theme === 'dark' ? 'text-primary font-medium' : 'text-foreground'
                    }`}
                  >
                    <Moon className="h-4 w-4" />
                    <span>{t.theme.dark}</span>
                  </button>
                  <button
                    onClick={() => handleThemeChange('system')}
                    className={`flex w-full items-center space-x-2 px-4 py-2 text-sm hover:bg-muted ${
                      theme === 'system' ? 'text-primary font-medium' : 'text-foreground'
                    }`}
                  >
                    <Monitor className="h-4 w-4" />
                    <span>{t.theme.system}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 语言切换 */}
          <div className="relative" ref={languageMenuRef}>
            <button
              onClick={() => setShowLanguageMenu(!showLanguageMenu)}
              className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
              aria-label={t.layout.currentLanguage}
            >
              <Globe className="h-5 w-5" />
            </button>

            {showLanguageMenu && (
              <div className="absolute right-0 mt-2 w-32 rounded-lg border bg-background shadow-lg">
                <div className="py-1">
                  <button
                    onClick={() => handleLanguageChange('zh')}
                    className={`flex w-full items-center px-4 py-2 text-sm hover:bg-muted ${
                      locale === 'zh' ? 'text-primary font-medium' : 'text-foreground'
                    }`}
                  >
                    {t.language.zh}
                  </button>
                  <button
                    onClick={() => handleLanguageChange('en')}
                    className={`flex w-full items-center px-4 py-2 text-sm hover:bg-muted ${
                      locale === 'en' ? 'text-primary font-medium' : 'text-foreground'
                    }`}
                  >
                    {t.language.en}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 设置按钮 */}
        <button
          onClick={onSettingsClick}
          className="rounded-lg p-2 text-foreground transition-colors hover:bg-muted"
          aria-label={t.ariaLabel.settings}
        >
          <Settings className="h-5 w-5" />
        </button>
        </div>
      </div>
    </header>
  );
}
