import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
  theme: Theme;
  _hasHydrated: boolean;
  setTheme: (theme: Theme) => void;
  setHasHydrated: (state: boolean) => void;
}

// 自定义存储：直接使用 'theme' key
const themeStorage = {
  getItem: () => {
    if (typeof window === 'undefined') return null;

    const theme = localStorage.getItem('theme') || 'system';

    return JSON.stringify({
      state: {
        theme,
        _hasHydrated: false,
      },
    });
  },
  setItem: (_name: string, value: string) => {
    if (typeof window === 'undefined') return;

    try {
      const data = JSON.parse(value);
      const state = data.state || data;

      if (state.theme) {
        localStorage.setItem('theme', state.theme);
      }

      // 清理旧的 key
      localStorage.removeItem('lifetrace-theme');
      localStorage.removeItem('theme-storage');
      localStorage.removeItem('ui-config-storage');
    } catch (e) {
      console.error('Error saving theme:', e);
    }
  },
  removeItem: () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('theme');
  },
};

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      _hasHydrated: false,
      setTheme: (theme) => set({ theme }),
      setHasHydrated: (state) => set({ _hasHydrated: state }),
    }),
    {
      name: 'theme-config',
      storage: createJSONStorage(() => themeStorage),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
