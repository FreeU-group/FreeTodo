'use client';

import { cn } from '@/lib/utils';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

interface LoadingProps {
  className?: string;
  text?: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function Loading({ className, text, size = 'md' }: LoadingProps) {
  const { locale } = useLocaleStore();
  const t = useTranslations(locale);
  const displayText = text || t.common.loading;
  const sizes = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-3',
    lg: 'h-12 w-12 border-4',
  };

  return (
    <div className={cn('flex flex-col items-center justify-center py-8', className)}>
      <div
        className={cn(
          'animate-spin rounded-full border-border border-t-primary',
          sizes[size]
        )}
      />
      {displayText && <p className="mt-4 font-medium text-muted-foreground">{displayText}</p>}
    </div>
  );
}
