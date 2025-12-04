'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Calendar, FolderKanban, Clock, PanelLeftClose, PanelLeft, Settings, DollarSign, BarChart3 } from 'lucide-react';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { SelectedEventsProvider } from '@/lib/context/SelectedEventsContext';
import { Sidebar, SidebarContent, SidebarHeader, SidebarNav } from '@/components/ui/sidebar-nav';
import type { SidebarNavItem } from '@/components/ui/sidebar-nav';
import ThemeToggle from '@/components/common/ThemeToggle';
import LanguageToggle from '@/components/common/LanguageToggle';
import SettingsModal from '@/components/common/SettingsModal';
import { useLocaleStore } from '@/lib/store/locale';
import { useTranslations } from '@/lib/i18n';

// 动态导入页面组件以避免 SSR 问题
const EventsPage = dynamic(() => import('@/app/page'), { ssr: false });
const ProjectManagementPage = dynamic(() => import('@/app/project-management/page'), { ssr: false });
const TimeAllocationPage = dynamic(() => import('@/app/time-allocation/page'), { ssr: false });

type MenuType = 'events' | 'project-management' | 'scheduler' | 'time-allocation' | 'cost-tracking';

// 定义基础菜单项（不含翻译）
const baseMenuItems: (Omit<SidebarNavItem, 'label'> & { path: string; labelKey: string })[] = [
  { id: 'project-management', labelKey: 'projectManagement', icon: FolderKanban, path: '/project-management' },
  { id: 'events', labelKey: 'events', icon: Calendar, path: '/' },
  { id: 'time-allocation', labelKey: 'timeAllocation', icon: BarChart3, path: '/time-allocation' },
  { id: 'scheduler', labelKey: 'scheduler', icon: Clock, path: '/scheduler' },
  { id: 'cost-tracking', labelKey: 'costTracking', icon: DollarSign, path: '/cost-tracking' },
];

interface AppLayoutInnerProps {
  children?: React.ReactNode;
}

function AppLayoutInner({ children }: AppLayoutInnerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocaleStore((state) => state.locale);
  const t = useTranslations(locale);
  const [activeMenu, setActiveMenu] = useState<MenuType>('events');
  const [showScheduler, setShowScheduler] = useState(false);
  const [showCostTracking, setShowCostTracking] = useState(false);
  const [showProjectManagement, setShowProjectManagement] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // 从 localStorage 读取侧边栏折叠状态
  useEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved !== null) {
      setIsSidebarCollapsed(saved === 'true');
    }
  }, []);

  // 切换侧边栏折叠状态
  const toggleSidebar = () => {
    const newState = !isSidebarCollapsed;
    setIsSidebarCollapsed(newState);
    localStorage.setItem('sidebarCollapsed', String(newState));
  };

  // 打开设置模态框
  const onSettingsClick = () => {
    setIsSettingsOpen(true);
  };

  // 根据设置过滤菜单项并添加翻译
  const menuItems: SidebarNavItem[] = baseMenuItems
    .filter(item => {
      if (item.id === 'scheduler') {
        return showScheduler;
      }
      if (item.id === 'cost-tracking') {
        return showCostTracking;
      }
      if (item.id === 'project-management') {
        return showProjectManagement;
      }
      return true;
    })
    .map(item => ({
      id: item.id,
      label: t.menu[item.labelKey as keyof typeof t.menu],
      icon: item.icon,
    }));

  // 从 localStorage 读取定时任务、费用统计和项目管理显示设置
  useEffect(() => {
    const savedScheduler = localStorage.getItem('showScheduler');
    if (savedScheduler !== null) {
      setShowScheduler(savedScheduler === 'true');
    }

    const savedCostTracking = localStorage.getItem('showCostTracking');
    if (savedCostTracking !== null) {
      setShowCostTracking(savedCostTracking === 'true');
    }

    const savedProjectManagement = localStorage.getItem('showProjectManagement');
    if (savedProjectManagement !== null) {
      setShowProjectManagement(savedProjectManagement === 'true');
    }

    // 监听定时任务设置变化
    const handleSchedulerVisibilityChange = (event: CustomEvent) => {
      const { visible, currentPath } = event.detail;
      setShowScheduler(visible);

      // 如果关闭了定时任务开关，且当前在定时任务页面，则跳转到事件管理页面
      if (!visible && currentPath?.startsWith('/scheduler')) {
        router.push('/');
      }
    };

    // 监听费用统计设置变化
    const handleCostTrackingVisibilityChange = (event: CustomEvent) => {
      const { visible, currentPath } = event.detail;
      setShowCostTracking(visible);

      // 如果关闭了费用统计开关，且当前在费用统计页面，则跳转到事件管理页面
      if (!visible && currentPath?.startsWith('/cost-tracking')) {
        router.push('/');
      }
    };

    // 监听项目管理设置变化
    const handleProjectManagementVisibilityChange = (event: CustomEvent) => {
      const { visible, currentPath } = event.detail;
      setShowProjectManagement(visible);

      // 如果关闭了项目管理开关，且当前在项目管理页面，则跳转到事件管理页面
      if (!visible && currentPath?.startsWith('/project-management')) {
        router.push('/');
      }
    };

    window.addEventListener('schedulerVisibilityChange', handleSchedulerVisibilityChange as EventListener);
    window.addEventListener('costTrackingVisibilityChange', handleCostTrackingVisibilityChange as EventListener);
    window.addEventListener('projectManagementVisibilityChange', handleProjectManagementVisibilityChange as EventListener);
    return () => {
      window.removeEventListener('schedulerVisibilityChange', handleSchedulerVisibilityChange as EventListener);
      window.removeEventListener('costTrackingVisibilityChange', handleCostTrackingVisibilityChange as EventListener);
      window.removeEventListener('projectManagementVisibilityChange', handleProjectManagementVisibilityChange as EventListener);
    };
  }, [router]);

  // 根据当前路径设置激活的菜单项
  useEffect(() => {
    if (pathname) {
      // 按路径长度降序排序，确保先匹配更具体的路径
      const sortedMenuItems = [...baseMenuItems].sort((a, b) => b.path.length - a.path.length);
      const currentMenuItem = sortedMenuItems.find(item => {
        // 精确匹配或者路径前缀匹配（但需要确保是完整的路径段）
        if (item.path === '/') {
          return pathname === '/';
        }
        return pathname.startsWith(item.path);
      });
      if (currentMenuItem) {
        setActiveMenu(currentMenuItem.id as MenuType);
      }
    }
  }, [pathname]);

  // 处理菜单项点击 - 使用路由导航
  const handleMenuClick = (itemId: string) => {
    const menuItem = baseMenuItems.find(item => item.id === itemId);
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
      case 'time-allocation':
        return <TimeAllocationPage />;
      default:
        return <EventsPage />;
    }
  };

  return (
    <>
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <div className="flex w-full h-full">
        {/* 左侧栏 - 侧边栏菜单 */}
      <Sidebar
        className={`flex-shrink-0 h-full transition-all duration-300 ${
          isSidebarCollapsed ? 'w-0 border-r-0 overflow-hidden' : 'w-64'
        }`}
      >
        {/* Logo 区域 */}
        <SidebarHeader className="h-[68px] flex items-center justify-center">
          <div className="flex items-center gap-3 w-full">
            <div className="relative h-8 w-8 flex-shrink-0">
              <Image
                src="/logo.png"
                alt="LifeTrace Logo"
                fill
                className="object-contain"
                unoptimized
              />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold text-foreground leading-tight">{t.layout.appTitle}</h1>
              <p className="text-xs text-muted-foreground leading-tight truncate">{t.layout.appSubtitle}</p>
            </div>
          </div>
        </SidebarHeader>

        {/* 导航菜单 */}
        <SidebarContent>
          <SidebarNav
            items={menuItems}
            activeItem={activeMenu}
            onItemClick={handleMenuClick}
          />
        </SidebarContent>
      </Sidebar>

      {/* 中间内容区 */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between h-[68px] px-4 border-b bg-background">
          {/* 左侧：折叠按钮 */}
          <button
            onClick={toggleSidebar}
            className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={isSidebarCollapsed ? t.layout.expandSidebar : t.layout.collapseSidebar}
            title={isSidebarCollapsed ? t.layout.expandSidebar : t.layout.collapseSidebar}
          >
            {isSidebarCollapsed ? (
              <PanelLeft className="h-5 w-5" />
            ) : (
              <PanelLeftClose className="h-5 w-5" />
            )}
          </button>

          {/* 右侧：主题切换、语言切换和设置 */}
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <LanguageToggle />

            <button
              onClick={onSettingsClick}
              className="rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t.layout.settings}
              title={t.layout.settings}
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 页面内容 */}
        <div className="flex-1 overflow-y-auto">
          {renderContent()}
        </div>
      </div>
      </div>
    </>
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
