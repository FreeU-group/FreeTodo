import { zh } from './locales/zh';
import { en } from './locales/en';
import type { Locale } from '@/lib/store/locale';

const translations = {
  zh,
  en,
};

export function useTranslations(locale: Locale) {
  return translations[locale];
}

export { zh, en };
export type { Translation } from './locales/zh';
