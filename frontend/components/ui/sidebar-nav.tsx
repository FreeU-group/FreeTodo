'use client';

import * as React from 'react';
import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
  badge?: string | number;
}

interface SidebarNavProps {
  items: SidebarNavItem[];
  activeItem: string;
  onItemClick: (itemId: string) => void;
  className?: string;
}

export function SidebarNav({ items, activeItem, onItemClick, className }: SidebarNavProps) {
  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, itemId: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onItemClick(itemId);
    }
  };

  return (
    <nav className={cn('flex flex-col gap-1 p-1', className)} role="navigation" aria-label="主导航">
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeItem === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onItemClick(item.id)}
            onKeyDown={(e) => handleKeyDown(e, item.id)}
            disabled={item.disabled}
            className={cn(
              'group relative flex items-center gap-3',
              'rounded-md px-3 py-2',
              'text-sm font-medium',
              'transition-all duration-200',
              'hover:bg-accent hover:text-accent-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              'disabled:pointer-events-none disabled:opacity-50',
              'active:scale-[0.98]',
              isActive ? [
                'bg-accent text-accent-foreground',
              ] : [
                'text-muted-foreground',
              ]
            )}
            aria-current={isActive ? 'page' : undefined}
            aria-label={item.label}
          >
            <Icon className={cn(
              'h-4 w-4 shrink-0 transition-colors duration-200',
              isActive ? 'text-foreground' : 'text-muted-foreground group-hover:text-accent-foreground'
            )} />
            <span className="truncate flex-1 text-left">{item.label}</span>
            {item.badge !== undefined && (
              <span className={cn(
                'ml-auto flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground group-hover:bg-accent-foreground/10'
              )}>
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
  collapsible?: boolean;
}

export const Sidebar = React.forwardRef<HTMLDivElement, SidebarProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <aside
        ref={ref}
        className={cn(
          'flex h-full flex-col',
          'border-r border-border',
          'bg-background',
          'transition-all duration-300 ease-in-out',
          className
        )}
        {...props}
      >
        {children}
      </aside>
    );
  }
);
Sidebar.displayName = 'Sidebar';

export interface SidebarHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export const SidebarHeader = React.forwardRef<HTMLDivElement, SidebarHeaderProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex flex-col justify-center gap-2',
          'border-b border-border',
          'h-14 px-4',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SidebarHeader.displayName = 'SidebarHeader';

export interface SidebarContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export const SidebarContent = React.forwardRef<HTMLDivElement, SidebarContentProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'flex-1 overflow-y-auto',
          'px-3 py-4',
          'scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SidebarContent.displayName = 'SidebarContent';

export interface SidebarFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode;
}

export const SidebarFooter = React.forwardRef<HTMLDivElement, SidebarFooterProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'border-t border-border',
          'px-4 py-4',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
SidebarFooter.displayName = 'SidebarFooter';
