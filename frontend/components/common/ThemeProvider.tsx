'use client';

import { useEffect } from 'react';
import { useThemeStore } from '@/lib/store/theme';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useThemeStore((state) => state.theme);
  const hasHydrated = useThemeStore((state) => state._hasHydrated);

  useEffect(() => {
    // 等待 zustand 完成 hydration
    if (!hasHydrated) {
      console.log('[ThemeProvider] Waiting for hydration...');
      return;
    }

    const root = window.document.documentElement;

    // 计算期望的主题类
    const expectedTheme = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;

    // 检查 DOM 是否已经有正确的主题类（脚本已设置）
    const hasCorrectTheme = root.classList.contains(expectedTheme);

    if (hasCorrectTheme) {
      console.log('[ThemeProvider] Theme already correct:', expectedTheme);
      return;
    }

    console.log('[ThemeProvider] Applying theme:', theme, '(resolved to:', expectedTheme + ')');

    // 移除之前的主题类
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      // 使用系统主题
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
      root.classList.add(systemTheme);
    } else {
      // 使用指定的主题
      root.classList.add(theme);
    }
  }, [theme, hasHydrated]);

  // 监听系统主题变化
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      const systemTheme = mediaQuery.matches ? 'dark' : 'light';
      console.log('[ThemeProvider] System theme changed to:', systemTheme);
      root.classList.add(systemTheme);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return <>{children}</>;
}
