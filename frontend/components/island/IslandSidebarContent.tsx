"use client";

/**
 * Island 侧边栏内容组件
 * 在 SIDEBAR 模式下支持单栏/双栏/三栏展开
 * 直接使用 FreeTodo 原有的样式，保持一致性
 */

import { ChevronLeft, ChevronRight } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { IslandHeader } from "@/components/island/IslandHeader";
import { BottomDock } from "@/components/layout/BottomDock";
import { PanelContainer } from "@/components/layout/PanelContainer";
import { PanelContent } from "@/components/layout/PanelContent";
import { ResizeHandle } from "@/components/layout/ResizeHandle";
import type { PanelFeature } from "@/lib/config/panel-config";
import { GlobalDndProvider } from "@/lib/dnd";
import { usePanelResize } from "@/lib/hooks/usePanelResize";
import { IslandMode } from "@/lib/island/types";
import { type DockDisplayMode, useUiStore } from "@/lib/store/ui-store";

interface IslandSidebarContentProps {
  onModeChange: (mode: IslandMode) => void;
  /** 拖拽开始回调（用于 Header 垂直拖拽） */
  onHeaderDragStart?: (e: React.MouseEvent) => void;
  /** 是否正在拖拽 */
  isDragging?: boolean;
}

export function IslandSidebarContent({ onModeChange, onHeaderDragStart, isDragging: isDraggingProp }: IslandSidebarContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [isLeftExpanded, setIsLeftExpanded] = useState(false); // Panel A
  const [isRightExpanded, setIsRightExpanded] = useState(false); // Panel C
  const [isDraggingPanelA, setIsDraggingPanelA] = useState(false);
  const [isDraggingPanelC, setIsDraggingPanelC] = useState(false);

  // SIDEBAR 模式独立的拖拽状态和处理器
  const [isDraggingWindow, setIsDraggingWindow] = useState(false);

  // 自定义拖拽处理器（仅允许垂直拖动）
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // 仅响应左键
    if (e.button !== 0) return;

    setIsDraggingWindow(true);

    // 发送拖拽开始事件到主进程
    if (typeof window !== "undefined" && window.electronAPI?.islandDragStart) {
      window.electronAPI.islandDragStart(e.screenY);
    }
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingWindow) return;

    // 发送拖拽移动事件到主进程
    if (typeof window !== "undefined" && window.electronAPI?.islandDragMove) {
      window.electronAPI.islandDragMove(e.screenY);
    }
  }, [isDraggingWindow]);

  const handleMouseUp = useCallback(() => {
    if (!isDraggingWindow) return;

    setIsDraggingWindow(false);

    // 发送拖拽结束事件到主进程
    if (typeof window !== "undefined" && window.electronAPI?.islandDragEnd) {
      window.electronAPI.islandDragEnd();
    }
  }, [isDraggingWindow]);

  // 设置全局鼠标事件监听器
  useEffect(() => {
    if (isDraggingWindow) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDraggingWindow, handleMouseMove, handleMouseUp]);

  const {
    isPanelAOpen,
    isPanelBOpen,
    isPanelCOpen,
    panelAWidth,
    panelCWidth,
    setPanelAWidth,
    setPanelCWidth,
    dockDisplayMode,
    setDockDisplayMode,
    setPanelFeature,
    getAvailableFeatures,
    panelFeatureMap,
  } = useUiStore();

  const previousDockModeRef = useRef<DockDisplayMode | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const visiblePanelCount: 1 | 2 | 3 = (1 + (isLeftExpanded ? 1 : 0) + (isRightExpanded ? 1 : 0)) as
    | 1
    | 2
    | 3;

  // SIDEBAR 默认只显示中间栏（Panel B），并在进入时同步窗口尺寸
  useEffect(() => {
    if (!mounted) return;
    setIsLeftExpanded(false);
    setIsRightExpanded(false);

    // 默认：只显示 Panel B，并确保 Panel B 有分配功能
    useUiStore.setState({ isPanelAOpen: false, isPanelBOpen: true, isPanelCOpen: false });

    // 取消分配隐藏面板的功能，释放给可见面板使用
    useUiStore.setState((state) => ({
      panelFeatureMap: {
        ...state.panelFeatureMap,
        panelA: null,
        panelC: null,
        // 确保 Panel B 有功能分配，如果没有则分配 chat
        panelB: state.panelFeatureMap.panelB || ("chat" as PanelFeature),
      },
    }));

    if (typeof window !== "undefined" && window.electronAPI?.islandResizeSidebar) {
      window.electronAPI.islandResizeSidebar(1);
    }
  }, [mounted]);


  useEffect(() => {
    // Save current dock mode only on first mount (when ref is null)
    if (previousDockModeRef.current === null) {
      previousDockModeRef.current = dockDisplayMode;
    }
    // Force dock to be always visible in Island sidebar mode
    setDockDisplayMode("fixed");

    // Restore previous dock mode on unmount
    return () => {
      if (previousDockModeRef.current !== null) {
        setDockDisplayMode(previousDockModeRef.current);
      }
    };
  }, [dockDisplayMode, setDockDisplayMode]);

  // 设置全局调整大小光标
  const setGlobalResizeCursor = useCallback((enabled: boolean) => {
    if (typeof document === "undefined") return;
    document.body.style.cursor = enabled ? "col-resize" : "";
    document.body.style.userSelect = enabled ? "none" : "";
  }, []);

  // 清理光标状态
  useEffect(() => {
    return () => setGlobalResizeCursor(false);
  }, [setGlobalResizeCursor]);

  // 使用 usePanelResize hook 进行面板拖拽调整
  const { handlePanelAResizePointerDown, handlePanelCResizePointerDown } = usePanelResize({
    containerRef,
    isPanelBOpen,
    isPanelCOpen: isRightExpanded && isPanelCOpen,
    panelCWidth,
    setPanelAWidth,
    setPanelCWidth,
    setIsDraggingPanelA,
    setIsDraggingPanelC,
    setGlobalResizeCursor,
  });

  const resizeSidebarWindow = useCallback((count: 1 | 2 | 3) => {
    if (typeof window !== "undefined" && window.electronAPI?.islandResizeSidebar) {
      window.electronAPI.islandResizeSidebar(count);
    }
  }, []);

  const handleToggleLeft = useCallback(() => {
    // 左侧按钮：展开/收起 Panel A
    if (!isLeftExpanded) {
      // 展开 Panel A
      setIsLeftExpanded(true);
      useUiStore.setState({ isPanelAOpen: true });

      // 如果 Panel A 没有分配功能，自动分配一个可用功能
      if (!panelFeatureMap.panelA) {
        const availableFeatures = getAvailableFeatures();
        if (availableFeatures.length > 0) {
          // 优先分配 todos，如果不可用则分配第一个可用功能
          const featureToAssign = availableFeatures.includes("todos" as PanelFeature)
            ? ("todos" as PanelFeature)
            : availableFeatures[0];
          setPanelFeature("panelA", featureToAssign);
        }
      }

      const nextCount = (1 + 1 + (isRightExpanded ? 1 : 0)) as 2 | 3;
      resizeSidebarWindow(nextCount);
      return;
    }

    // 收起 Panel A
    setIsLeftExpanded(false);
    useUiStore.setState({ isPanelAOpen: false });

    // 取消分配 Panel A 的功能，释放给其他面板使用
    useUiStore.setState((state) => ({
      panelFeatureMap: { ...state.panelFeatureMap, panelA: null },
    }));

    const nextCount = (1 + (isRightExpanded ? 1 : 0)) as 1 | 2;
    resizeSidebarWindow(nextCount);
  }, [isLeftExpanded, isRightExpanded, resizeSidebarWindow, panelFeatureMap, getAvailableFeatures, setPanelFeature]);

  const handleToggleRight = useCallback(() => {
    // 右侧按钮：展开/收起 Panel C
    if (!isRightExpanded) {
      // 展开 Panel C
      setIsRightExpanded(true);
      useUiStore.setState({ isPanelCOpen: true });

      // 如果 Panel C 没有分配功能，自动分配一个可用功能
      if (!panelFeatureMap.panelC) {
        const availableFeatures = getAvailableFeatures();
        if (availableFeatures.length > 0) {
          // 优先分配 todoDetail，如果不可用则分配第一个可用功能
          const featureToAssign = availableFeatures.includes("todoDetail" as PanelFeature)
            ? ("todoDetail" as PanelFeature)
            : availableFeatures[0];
          setPanelFeature("panelC", featureToAssign);
        }
      }

      const nextCount = (1 + 1 + (isLeftExpanded ? 1 : 0)) as 2 | 3;
      resizeSidebarWindow(nextCount);
      return;
    }

    // 收起 Panel C
    setIsRightExpanded(false);
    useUiStore.setState({ isPanelCOpen: false });

    // 取消分配 Panel C 的功能，释放给其他面板使用
    useUiStore.setState((state) => ({
      panelFeatureMap: { ...state.panelFeatureMap, panelC: null },
    }));

    const nextCount = (1 + (isLeftExpanded ? 1 : 0)) as 1 | 2;
    resizeSidebarWindow(nextCount);
  }, [isRightExpanded, isLeftExpanded, resizeSidebarWindow, panelFeatureMap, getAvailableFeatures, setPanelFeature]);

  // 计算面板宽度布局
  const layoutState = useCallback(() => {
    const clampedPanelA = Math.min(Math.max(panelAWidth, 0.1), 0.9);
    const clampedPanelC = Math.min(Math.max(panelCWidth, 0.1), 0.9);

    // 三栏布局：A + B + C
    if (isLeftExpanded && isRightExpanded) {
      // 三栏布局
      const baseWidth = 1 - panelCWidth;
      const safeBase = baseWidth > 0 ? baseWidth : 1;
      const a = safeBase * clampedPanelA;
      const c = panelCWidth;
      const b = Math.max(0, 1 - a - c);

      return {
        panelAWidth: a,
        panelBWidth: b,
        panelCWidth: c,
      };
    }

    // 双栏布局：A + B
    if (isLeftExpanded && !isRightExpanded) {
      return {
        panelAWidth: clampedPanelA,
        panelBWidth: 1 - clampedPanelA,
        panelCWidth: 0,
      };
    }

    // 双栏布局：B + C
    if (!isLeftExpanded && isRightExpanded) {
      return {
        panelAWidth: 0,
        panelBWidth: 1 - clampedPanelC,
        panelCWidth: clampedPanelC,
      };
    }

    // 单栏布局：只有 B
    return {
      panelAWidth: 0,
      panelBWidth: 1,
      panelCWidth: 0,
    };
  }, [isLeftExpanded, isRightExpanded, panelAWidth, panelCWidth]);

  const layout = layoutState();

  if (!mounted) {
    return (
      <div className="w-full h-full flex flex-col overflow-hidden bg-background">
        <div className="h-12 shrink-0 bg-primary-foreground dark:bg-accent" />
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <GlobalDndProvider>
      <div className="w-full h-full flex flex-col overflow-hidden bg-background">
        {/* Island 专用 Header（可作为垂直拖拽 Handle） */}
        <IslandHeader
          mode={IslandMode.SIDEBAR}
          onModeChange={onModeChange}
          isExpanded={isLeftExpanded || isRightExpanded}
          onDragStart={onHeaderDragStart || handleDragStart}
          isDragging={isDraggingProp !== undefined ? isDraggingProp : isDraggingWindow}
        />

        {/* 面板区域 */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-hidden relative bg-primary-foreground dark:bg-accent flex px-3"
        >
          {/* 左侧收起按钮（点击区域在面板两侧，避免 dock 内部塞按钮） */}
          <button
            type="button"
            onClick={handleToggleLeft}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-50 pointer-events-auto
                       h-20 w-8 rounded-xl
                       bg-[oklch(var(--card))]/70 dark:bg-background/70 opacity-50
                       backdrop-blur-md border border-[oklch(var(--border))]
                       shadow-lg
                       text-[oklch(var(--muted-foreground))] hover:text-[oklch(var(--foreground))] hover:opacity-100
                       hover:bg-[oklch(var(--card))]/90
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(var(--ring))] focus-visible:ring-offset-2"
            aria-label={isLeftExpanded ? "收起左侧栏" : "展开左侧栏"}
            title={isLeftExpanded ? "收起左侧" : "展开左侧"}
          >
            {isLeftExpanded ? (
              <ChevronRight className="mx-auto h-5 w-5" />
            ) : (
              <ChevronLeft className="mx-auto h-5 w-5" />
            )}
          </button>

          {/* Panel A - 左侧展开时显示 */}
          {isLeftExpanded && (
            <PanelContainer
              position="panelA"
              isVisible={isPanelAOpen}
              width={layout.panelAWidth}
              isDragging={isDraggingPanelA || isDraggingPanelC}
              className="mx-1"
            >
              <PanelContent position="panelA" />
            </PanelContainer>
          )}

          {/* Panel A / B 之间的 ResizeHandle（左侧展开时显示） */}
          {isLeftExpanded && (
            <ResizeHandle
              onPointerDown={handlePanelAResizePointerDown}
              isDragging={isDraggingPanelA}
              isVisible={isPanelAOpen && isPanelBOpen}
            />
          )}

          {/* Panel B - SIDEBAR 默认中间栏（可被用户关闭） */}
          <PanelContainer
            position="panelB"
            isVisible={isPanelBOpen}
            width={layout.panelBWidth}
            isDragging={isDraggingPanelA || isDraggingPanelC}
            className="mx-1"
          >
            <PanelContent position="panelB" />
          </PanelContainer>

          {/* Panel B / C 之间的 ResizeHandle（右侧展开时显示） */}
          {isRightExpanded && (
            <ResizeHandle
              onPointerDown={handlePanelCResizePointerDown}
              isDragging={isDraggingPanelC}
              isVisible={isPanelCOpen && (isPanelBOpen || isPanelAOpen)}
            />
          )}

          {/* Panel C - 右侧展开时显示 */}
          {isRightExpanded && (
            <PanelContainer
              position="panelC"
              isVisible={isPanelCOpen}
              width={layout.panelCWidth}
              isDragging={isDraggingPanelA || isDraggingPanelC}
              className="mx-1"
            >
              <PanelContent position="panelC" />
            </PanelContainer>
          )}

          {/* 右侧展开按钮（点击区域在面板两侧，避免 dock 内部塞按钮） */}
          <button
            type="button"
            onClick={handleToggleRight}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-50 pointer-events-auto
                       h-20 w-8 rounded-xl
                       bg-[oklch(var(--card))]/70 dark:bg-background/70 opacity-50
                       backdrop-blur-md border border-[oklch(var(--border))]
                       shadow-lg
                       text-[oklch(var(--muted-foreground))] hover:text-[oklch(var(--foreground))]
                       hover:bg-[oklch(var(--card))] dark:hover:bg-background hover:opacity-100
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(var(--ring))] focus-visible:ring-offset-2"
            aria-label={isRightExpanded ? "收起右侧栏" : "展开右侧栏"}
            title={isRightExpanded ? "收起右侧" : "展开右侧"}
          >
            {isRightExpanded ? (
              <ChevronLeft className="mx-auto h-5 w-5" />
            ) : (
              <ChevronRight className="mx-auto h-5 w-5" />
            )}
          </button>
        </div>

        {/* 底部 Dock - 用于切换面板和展开/收起栏数 */}
        <div className="shrink-0 flex justify-center px-2 pb-2 bg-primary-foreground dark:bg-accent">
          <BottomDock
            isInPanelMode={true}
            panelContainerRef={containerRef}
            visiblePanelCount={visiblePanelCount}
            visiblePositions={
              visiblePanelCount === 1
                ? ["panelB"]
                : visiblePanelCount === 2
                  ? isLeftExpanded
                    ? ["panelA", "panelB"]
                    : ["panelB", "panelC"]
                  : ["panelA", "panelB", "panelC"]
            }
          />
        </div>
      </div>
    </GlobalDndProvider>
  );
}
