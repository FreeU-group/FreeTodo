'use client';

import { useState, useRef, useEffect } from 'react';
import { TaskStatus } from '@/lib/types';
import { Circle, CircleDot, CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

interface TaskStatusSelectProps {
  status: TaskStatus;
  onChange: (newStatus: TaskStatus) => void;
}

const getStatusOptions = (t: ReturnType<typeof useTranslations>) => [
  {
    value: 'pending' as TaskStatus,
    label: t.task.pending,
    icon: Circle,
    color: 'text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700',
  },
  {
    value: 'in_progress' as TaskStatus,
    label: t.task.inProgress,
    icon: CircleDot,
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50',
  },
  {
    value: 'completed' as TaskStatus,
    label: t.task.completed,
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50',
  },
  {
    value: 'cancelled' as TaskStatus,
    label: t.task.cancelled,
    icon: XCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50',
  },
];

export default function TaskStatusSelect({ status, onChange }: TaskStatusSelectProps) {
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const statusOptions = getStatusOptions(t);
  const currentOption = statusOptions.find((opt) => opt.value === status) || statusOptions[0];
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

  const handleStatusChange = (newStatus: TaskStatus) => {
    onChange(newStatus);
    setIsOpen(false);
  };

  return (
    <div ref={dropdownRef} className="relative">
      {/* 当前状态按钮 */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
          currentOption.bgColor
        )}
      >
        <CurrentIcon className={cn('h-4 w-4', currentOption.color)} />
        <span className={currentOption.color}>{currentOption.label}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', isOpen && 'rotate-180')} />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 min-w-[140px] rounded-md border border-border bg-popover shadow-lg">
          <div className="p-1">
            {statusOptions.map((option) => {
              const OptionIcon = option.icon;
              return (
                <button
                  key={option.value}
                  onClick={() => handleStatusChange(option.value)}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                    option.value === status
                      ? 'bg-accent'
                      : 'hover:bg-accent'
                  )}
                >
                  <OptionIcon className={cn('h-4 w-4', option.color)} />
                  <span className={option.color}>{option.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
