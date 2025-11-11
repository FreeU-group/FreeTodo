'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Calendar, FolderKanban, Clock } from 'lucide-react';
import dynamic from 'next/dynamic';
import { SelectedEventsProvider } from '@/lib/context/SelectedEventsContext';
import { Sidebar, SidebarContent, SidebarNav } from '@/components/ui/sidebar-nav';
import type { SidebarNavItem } from '@/components/ui/sidebar-nav';

// 动态导入页面组件以避免 SSR 问题
const EventsPage = dynamic(() => import('@/app/page'), { ssr: false });
const ProjectManagementPage = dynamic(() => import('@/app/project-management/page'), { ssr: false });

type MenuType = 'events' | 'project-management' | 'scheduler';

// 所有菜单项配置（包含路由路径）
const allMenuItems: (SidebarNavItem & { path: string })[] = [
  { id: 'events', label: '事件管理', icon: Calendar, path: '/' },
  { id: 'project-management', label: '项目管理', icon: FolderKanban, path: '/project-management' },
  { id: 'scheduler', label: '定时任务', icon: Clock, path: '/scheduler' },
];

interface AppLayoutInnerProps {
  children?: React.ReactNode;
}

function AppLayoutInner({ children }: AppLayoutInnerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [activeMenu, setActiveMenu] = useState<MenuType>('events');
  const [showScheduler, setShowScheduler] = useState(false);

  // 根据设置过滤菜单项
  const menuItems = allMenuItems.filter(item => {
    if (item.id === 'scheduler') {
      return showScheduler;
    }
    return true;
  });

  // 从 localStorage 读取定时任务显示设置
  useEffect(() => {
    const saved = localStorage.getItem('showScheduler');
    if (saved !== null) {
      setShowScheduler(saved === 'true');
    }

    // 监听设置变化
    const handleVisibilityChange = (event: CustomEvent) => {
      const { visible, currentPath } = event.detail;
      setShowScheduler(visible);

      // 如果关闭了定时任务开关，且当前在定时任务页面，则跳转到事件管理页面
      if (!visible && currentPath?.startsWith('/scheduler')) {
        router.push('/');
      }
    };

    window.addEventListener('schedulerVisibilityChange', handleVisibilityChange as EventListener);
    return () => {
      window.removeEventListener('schedulerVisibilityChange', handleVisibilityChange as EventListener);
    };
  }, [router]);

  // 根据当前路径设置激活的菜单项
  useEffect(() => {
    if (pathname) {
      const currentMenuItem = allMenuItems.find(item => pathname.startsWith(item.path));
      if (currentMenuItem) {
        setActiveMenu(currentMenuItem.id as MenuType);
      }
    }
  }, [pathname]);

  // 处理菜单项点击 - 使用路由导航
  const handleMenuClick = (itemId: string) => {
    const menuItem = allMenuItems.find(item => item.id === itemId);
    if (menuItem) {
      router.push(menuItem.path);
    }
  };

  // 渲染中间内容
  const renderContent = () => {
    // 如果传入了 children，优先渲染 children（用于动态路由页面）
    if (children) {
      return children;
    }

    // 否则使用菜单切换逻辑
    switch (activeMenu) {
      case 'events':
        return <EventsPage />;
      case 'project-management':
        return <ProjectManagementPage />;
      default:
        return <EventsPage />;
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden h-full">
      {/* 左侧菜单 - 使用 shadcn 风格组件 */}
      <Sidebar className="w-56 flex-shrink-0 h-full">
        <SidebarContent>
          <SidebarNav
            items={menuItems}
            activeItem={activeMenu}
            onItemClick={handleMenuClick}
          />
        </SidebarContent>
      </Sidebar>

      {/* 内容区 - 全宽 */}
      <div className="flex-1 overflow-y-auto h-full">
        {renderContent()}
      </div>
    </div>
  );
}

interface AppLayoutProps {
  children?: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <SelectedEventsProvider>
      <AppLayoutInner>{children}</AppLayoutInner>
    </SelectedEventsProvider>
  );
}
