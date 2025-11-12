'use client';

import { useState, useRef, useEffect } from 'react';
import { TaskStatus } from '@/lib/types';
import { Circle, CircleDot, CheckCircle2, XCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TaskStatusSelectProps {
  status: TaskStatus;
  onChange: (newStatus: TaskStatus) => void;
}

const statusOptions = [
  {
    value: 'pending' as TaskStatus,
    label: '待办',
    icon: Circle,
    color: 'text-gray-500 dark:text-gray-400',
    bgColor: 'bg-gray-100/80 dark:bg-gray-800/50',
    hoverBgColor: 'hover:bg-gray-200/80 dark:hover:bg-gray-700/50',
    activeBgColor: 'active:bg-gray-300/80 dark:active:bg-gray-600/50',
  },
  {
    value: 'in_progress' as TaskStatus,
    label: '进行中',
    icon: CircleDot,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100/80 dark:bg-blue-900/20',
    hoverBgColor: 'hover:bg-blue-200/80 dark:hover:bg-blue-900/30',
    activeBgColor: 'active:bg-blue-300/80 dark:active:bg-blue-800/40',
  },
  {
    value: 'completed' as TaskStatus,
    label: '已完成',
    icon: CheckCircle2,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100/80 dark:bg-green-900/20',
    hoverBgColor: 'hover:bg-green-200/80 dark:hover:bg-green-900/30',
    activeBgColor: 'active:bg-green-300/80 dark:active:bg-green-800/40',
  },
  {
    value: 'cancelled' as TaskStatus,
    label: '已取消',
    icon: XCircle,
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-100/80 dark:bg-red-900/20',
    hoverBgColor: 'hover:bg-red-200/80 dark:hover:bg-red-900/30',
    activeBgColor: 'active:bg-red-300/80 dark:active:bg-red-800/40',
  },
];

export default function TaskStatusSelect({ status, onChange }: TaskStatusSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
          'inline-flex items-center justify-center gap-1.5',
          'rounded-md border border-transparent',
          'px-2.5 py-1.5',
          'text-xs font-medium',
          'transition-all duration-200',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
          'active:scale-95',
          currentOption.bgColor,
          currentOption.hoverBgColor,
          currentOption.activeBgColor
        )}
        aria-label={`当前状态：${currentOption.label}，点击修改`}
        aria-expanded={isOpen}
      >
        <CurrentIcon className={cn('h-3.5 w-3.5', currentOption.color)} />
        <span className={cn('leading-none', currentOption.color)}>{currentOption.label}</span>
        <ChevronDown
          className={cn(
            'h-3 w-3 transition-transform duration-200',
            currentOption.color,
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div
          className={cn(
            'absolute top-full left-0 mt-2 z-50',
            'min-w-[150px]',
            'rounded-lg border border-border bg-popover shadow-lg',
            'animate-in fade-in-0 zoom-in-95 duration-200'
          )}
          role="menu"
          aria-orientation="vertical"
        >
          <div className="p-1">
            {statusOptions.map((option) => {
              const OptionIcon = option.icon;
              const isSelected = option.value === status;
              return (
                <button
                  key={option.value}
                  onClick={() => handleStatusChange(option.value)}
                  className={cn(
                    'w-full flex items-center gap-2',
                    'rounded-md px-3 py-2',
                    'text-sm font-medium',
                    'transition-all duration-200',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                    'active:scale-[0.98]',
                    isSelected && 'bg-accent',
                    !isSelected && 'hover:bg-accent/50'
                  )}
                  role="menuitem"
                  aria-current={isSelected ? 'true' : undefined}
                >
                  <OptionIcon className={cn('h-4 w-4', option.color)} />
                  <span className={option.color}>{option.label}</span>
                  {isSelected && (
                    <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
