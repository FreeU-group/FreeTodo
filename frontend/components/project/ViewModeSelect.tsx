'use client';

import { useState, useRef, useEffect } from 'react';
import { LayoutGrid, List, BarChart3, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

type ViewMode = 'list' | 'board' | 'dashboard';

interface ViewModeSelectProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export default function ViewModeSelect({ value, onChange }: ViewModeSelectProps) {
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const viewOptions = [
    {
      value: 'list' as ViewMode,
      label: t.projectDetail?.listView || '列表',
      icon: List,
    },
    {
      value: 'board' as ViewMode,
      label: t.projectDetail?.boardView || '看板',
      icon: LayoutGrid,
    },
    {
      value: 'dashboard' as ViewMode,
      label: t.projectDetail?.dashboardView || '仪表盘',
      icon: BarChart3,
    },
  ];

  const currentOption = viewOptions.find((opt) => opt.value === value) || viewOptions[0];
  const CurrentIcon = currentOption.icon;

  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleViewChange = (mode: ViewMode) => {
    onChange(mode);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* 当前视图按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
          'border border-border bg-background hover:bg-muted/50 text-foreground'
        )}
      >
        <CurrentIcon className="h-4 w-4" />
        <span>{currentOption.label}</span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 z-50 min-w-[160px] rounded-lg border border-border bg-popover shadow-lg">
          <div className="p-1">
            {viewOptions.map((option) => {
              const OptionIcon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => handleViewChange(option.value)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-2.5 rounded-md text-sm transition-colors text-foreground',
                    option.value === value
                      ? 'bg-muted font-medium'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <OptionIcon className="h-4 w-4" />
                  <span>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
