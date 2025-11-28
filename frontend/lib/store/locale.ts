import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type Locale = 'zh' | 'en';

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

// 自定义存储：直接使用 'language' key
const localeStorage = {
  getItem: (name: string) => {
    if (typeof window === 'undefined') return null;

    const language = localStorage.getItem('language');

    // 如果有旧的 ui-config-storage，尝试迁移
    if (!language) {
      const oldConfig = localStorage.getItem('ui-config-storage');
      if (oldConfig) {
        try {
          const data = JSON.parse(oldConfig);
          const lang = data.state?.language || data.language;
          if (lang) {
            const locale = lang === 'zh-CN' ? 'zh' : 'en';
            localStorage.setItem('language', locale);
            return JSON.stringify({ state: { locale } });
          }
        } catch (e) {}
      }
    }

    const locale = language || 'zh';
    return JSON.stringify({ state: { locale } });
  },
  setItem: (name: string, value: string) => {
    if (typeof window === 'undefined') return;

    try {
      const data = JSON.parse(value);
      const locale = data.state?.locale || data.locale || 'zh';
      localStorage.setItem('language', locale);

      // 清理旧的 key
      localStorage.removeItem('locale-storage');
    } catch (e) {
      console.error('Error saving locale:', e);
    }
  },
  removeItem: (name: string) => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('language');
  },
};

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'zh',
      setLocale: (locale) => set({ locale }),
    }),
    {
      name: 'locale',
      storage: createJSONStorage(() => localeStorage),
    }
  )
);
