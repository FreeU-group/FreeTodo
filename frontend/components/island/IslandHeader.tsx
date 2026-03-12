"use client";

/**
 * Island 专用 Header 组件
 * 用于形态3/4，提供窗口控制按钮
 * 与原 FreeTodo Header 共享 HeaderIsland 组件
 */

import { Maximize2, Minimize2, Pin, PinOff, X } from "lucide-react";
import Image from "next/image";
import type React from "react";
import { useState } from "react";
import { LayoutSelector } from "@/components/common/layout/LayoutSelector";
import { ThemeStyleSelect } from "@/components/common/theme/ThemeStyleSelect";
import { ThemeToggle } from "@/components/common/theme/ThemeToggle";
import { LanguageToggle } from "@/components/common/ui/LanguageToggle";
import { SettingsToggle } from "@/components/common/ui/SettingsToggle";
import { HeaderIsland } from "@/components/notification/HeaderIsland";
import { IslandMode } from "@/lib/island/types";
import { useNotificationStore } from "@/lib/store/notification-store";

interface IslandHeaderProps {
  /** 当前模式 */
  mode: IslandMode;
  /** 模式切换回调 */
  onModeChange: (mode: IslandMode) => void;
  /** SIDEBAR 模式下是否已展开到 2+ 栏（可选） */
  isExpanded?: boolean;
  /** 拖拽开始回调（用于 SIDEBAR 模式垂直拖拽，可选） */
  onDragStart?: (e: React.MouseEvent) => void;
  /** 是否正在拖拽（可选） */
  isDragging?: boolean;
}

export function IslandHeader({ mode, onModeChange, isExpanded = false, onDragStart, isDragging = false }: IslandHeaderProps) {
  const isSidebar = mode === IslandMode.SIDEBAR;
  const isFullscreen = mode === IslandMode.FULLSCREEN;

  // Pin state - default to true (pinned)
  const [isPinned, setIsPinned] = useState(true);

  // 获取当前通知状态
  const { notifications } = useNotificationStore();

  // 检测是否为 Electron 环境
  const isElectron = typeof window !== "undefined" && !!window.electronAPI;

  // 显示通知岛的条件：有通知
  const showNotification = notifications.length > 0;

  // 显示工具按钮的条件：全屏模式 或 侧边栏已展开到 2+ 栏（宽度足够）
  const shouldShowTools = isFullscreen || (isSidebar && isExpanded);

  // Handle pin toggle
  const handlePinToggle = () => {
    const newPinState = !isPinned;
    setIsPinned(newPinState);

    // Notify Electron main process
    if (isElectron && window.electronAPI?.islandSetPinned) {
      window.electronAPI.islandSetPinned(newPinState);
    }
  };

  // 在 SIDEBAR 模式下，Header 作为垂直拖拽的 Handle
  const canDrag = isSidebar && onDragStart;

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Header conditionally acts as a drag handle in SIDEBAR mode
    <header
      className={`relative flex h-15 shrink-0 items-center bg-primary-foreground dark:bg-accent px-4 text-foreground overflow-visible ${!canDrag ? 'app-region-drag' : ''}`}
      onMouseDown={canDrag ? onDragStart : undefined}
      role={canDrag ? "button" : undefined}
      tabIndex={canDrag ? -1 : undefined}
      style={{
        cursor: canDrag ? (isDragging ? "grabbing" : "ns-resize") : undefined,
      }}
    >
      {/* 左侧：Logo + 应用名称 */}
      <div className={`flex items-center gap-2 shrink-0 ${!canDrag ? 'app-region-no-drag' : ''}`}>
        <div className="relative h-8 w-8 shrink-0">
          <Image
            src="/hi_dog2.png"
            alt="Free Todo Logo"
            width={32}
            height={32}
            className="object-contain w-full h-full"
          />
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">
          {isSidebar ? "FreeTodo" : "Free Todo: Your AI Secretary"}
        </h1>
      </div>

      {/* 中间：HeaderIsland 通知区域（与原 FreeTodo 共享，仅在有通知时显示） */}
      {showNotification ? (
        <div className={`flex-1 flex items-center justify-center relative min-w-0 overflow-visible ${!canDrag ? 'app-region-no-drag' : ''}`}>
          <HeaderIsland />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* 右侧：工具按钮 + 窗口控制 */}
      <div className={`flex items-center gap-2 ${!canDrag ? 'app-region-no-drag' : ''}`}>
        {/* 工具按钮 - 全屏模式或 SIDEBAR 已展开时显示 */}
        {shouldShowTools && (
          <>
            <LayoutSelector />
            <ThemeStyleSelect />
            <ThemeToggle />
            <LanguageToggle />
            <SettingsToggle />
            <div className="w-px h-4 bg-border mx-1" />
          </>
        )}

        {/* 窗口控制按钮 */}
        {/* Pin button - only show in SIDEBAR mode */}
        {isSidebar && (
          <button
            type="button"
            onClick={handlePinToggle}
            className={`w-7 h-7 flex items-center justify-center rounded-md
                       hover:bg-accent active:bg-accent/80
                       transition-colors ${
                         isPinned
                           ? "text-primary hover:text-primary"
                           : "text-muted-foreground hover:text-foreground"
                       }`}
            title={isPinned ? "取消固定（窗口将在失焦时最小化）" : "固定窗口（始终保持在桌面上）"}
          >
            {isPinned ? <Pin size={14} /> : <PinOff size={14} />}
          </button>
        )}

        {/* 缩小/展开按钮 */}
        {isSidebar ? (
          <button
            type="button"
            onClick={() => onModeChange(IslandMode.FULLSCREEN)}
            className="w-7 h-7 flex items-center justify-center rounded-md
                       hover:bg-accent active:bg-accent/80
                       text-muted-foreground hover:text-foreground
                       transition-colors"
            title="全屏"
          >
            <Maximize2 size={14} />
          </button>
        ) : isFullscreen ? (
          <button
            type="button"
            onClick={() => onModeChange(IslandMode.SIDEBAR)}
            className="w-7 h-7 flex items-center justify-center rounded-md
                       hover:bg-accent active:bg-accent/80
                       text-muted-foreground hover:text-foreground
                       transition-colors"
            title="缩小"
          >
            <Minimize2 size={14} />
          </button>
        ) : null}

        {/* 关闭按钮 - 回到形态1 */}
        <button
          type="button"
          onClick={() => onModeChange(IslandMode.FLOAT)}
          className="w-7 h-7 flex items-center justify-center rounded-md
                     hover:bg-destructive/10 active:bg-destructive/20
                     text-muted-foreground hover:text-destructive
                     transition-colors"
          title="收起"
        >
          <X size={14} />
        </button>
      </div>
    </header>
  );
}
