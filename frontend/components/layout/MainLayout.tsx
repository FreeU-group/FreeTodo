'use client';

import { useState, useEffect } from 'react';
import Header from './Header';
import AppLayout from './AppLayout';
import SettingsModal from '../common/SettingsModal';
import { api } from '@/lib/api';
import Loading from '../common/Loading';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHealthCheckRequired, setIsHealthCheckRequired] = useState(false);
  const [isChecking, setIsChecking] = useState(true);

  // 启动时进行健康检查
  useEffect(() => {
    checkLlmHealth();
  }, []);

  const checkLlmHealth = async () => {
    setIsChecking(true);
    try {
      const response = await api.llmHealthCheck();
      const status = response.data.status;

      console.log('LLM健康检查结果:', response.data);

      // 如果状态不是 healthy，强制显示设置界面
      if (status !== 'healthy') {
        setIsHealthCheckRequired(true);
        setIsSettingsOpen(true);
      } else {
        // 健康检查通过，关闭设置窗口
        setIsHealthCheckRequired(false);
        setIsSettingsOpen(false);
      }
    } catch (error) {
      console.error('LLM健康检查失败:', error);
      // 网络错误或其他错误，也强制显示设置界面
      setIsHealthCheckRequired(true);
      setIsSettingsOpen(true);
    } finally {
      setIsChecking(false);
    }
  };

  const handleSettingsClick = () => {
    setIsSettingsOpen(true);
  };

  const handleSettingsClose = () => {
    // 如果是必须配置，在关闭后重新检查健康状态
    if (isHealthCheckRequired) {
      checkLlmHealth();
    } else {
      setIsSettingsOpen(false);
    }
  };

  // 健康检查加载中
  if (isChecking) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <Loading />
          <p className="mt-4 text-muted-foreground">正在检查系统状态...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-screen flex-col bg-background overflow-hidden">
        <Header onSettingsClick={handleSettingsClick} />
        <main className="flex-1 overflow-hidden h-[calc(100vh-4rem)]">
          <AppLayout>{children}</AppLayout>
        </main>
      </div>

      {/* 设置对话框 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={handleSettingsClose}
        isRequired={isHealthCheckRequired}
      />
    </>
  );
}
