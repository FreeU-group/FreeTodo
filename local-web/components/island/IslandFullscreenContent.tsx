"use client";

/**
 * Island 全屏内容组件
 * 在 FULLSCREEN 模式下显示完整的 FreeTodo 三栏面板布局
 * 直接使用 FreeTodo 原有的样式，保持一致性
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { IslandHeader } from "@/components/island/IslandHeader";
import { PanelRegion } from "@/components/layout/PanelRegion";
import type { PanelFeature } from "@/lib/config/panel-config";
import { GlobalDndProvider } from "@/lib/dnd";
import { usePanelResize } from "@/lib/hooks/usePanelResize";
import { IslandMode } from "@/lib/island/types";
import { useUiStore } from "@/lib/store/ui-store";

interface IslandFullscreenContentProps {
  onModeChange: (mode: IslandMode) => void;
}

export function IslandFullscreenContent({ onModeChange }: IslandFullscreenContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 1920, height: 1080 });
  const [_mounted, setMounted] = useState(false);
  const [isDraggingPanelA, setIsDraggingPanelA] = useState(false);
  const [isDraggingPanelC, setIsDraggingPanelC] = useState(false);

  const {
    isPanelCOpen,
    isPanelBOpen,
    panelCWidth,
    setPanelAWidth,
    setPanelCWidth,
    setPanelFeature,
    getAvailableFeatures,
  } = useUiStore();

  // 确保三栏全部打开，并确保所有面板都有功能分配
  useEffect(() => {
    const state = useUiStore.getState();
    const updates: Partial<typeof state> = {};
    if (!state.isPanelAOpen) updates.isPanelAOpen = true;
    if (!state.isPanelBOpen) updates.isPanelBOpen = true;
    if (!state.isPanelCOpen) updates.isPanelCOpen = true;
    if (Object.keys(updates).length > 0) {
      useUiStore.setState(updates);
    }

    // 确保所有面板都有功能分配
    const currentFeatureMap = state.panelFeatureMap;
    const availableFeatures = getAvailableFeatures();

    // 定义每个面板的优先功能（如果没有分配）
    const preferredFeatures: Record<"panelA" | "panelB" | "panelC", PanelFeature> = {
      panelA: "todos",
      panelB: "chat",
      panelC: "todoDetail",
    };

    // 检查并分配缺失的功能
    (["panelA", "panelB", "panelC"] as const).forEach((position) => {
      if (!currentFeatureMap[position]) {
        // 该位置没有功能，需要分配
        const preferred = preferredFeatures[position];

        // 优先使用偏好功能（如果可用），否则使用第一个可用功能
        let featureToAssign: PanelFeature | null = null;

        if (availableFeatures.includes(preferred)) {
          featureToAssign = preferred;
        } else if (availableFeatures.length > 0) {
          featureToAssign = availableFeatures[0];
        }

        if (featureToAssign) {
          setPanelFeature(position, featureToAssign);
          // 更新可用功能列表（移除已分配的）
          const index = availableFeatures.indexOf(featureToAssign);
          if (index > -1) {
            availableFeatures.splice(index, 1);
          }
        }
      }
    });
  }, [setPanelFeature, getAvailableFeatures]);

  useEffect(() => {
    setMounted(true);
  }, []);

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
    isPanelCOpen,
    panelCWidth,
    setPanelAWidth,
    setPanelCWidth,
    setIsDraggingPanelA,
    setIsDraggingPanelC,
    setGlobalResizeCursor,
  });

  // 监听窗口尺寸变化
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  return (
    <GlobalDndProvider>
      <div
        ref={containerRef}
        className="w-full h-full flex flex-col overflow-hidden bg-background"
      >
        {/* Island 专用 Header */}
        <IslandHeader mode={IslandMode.FULLSCREEN} onModeChange={onModeChange} />

        {/* 面板区域 */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <PanelRegion
            width={dimensions.width}
            isMaximizeMode={true}
            isInPanelMode={false}
            isDraggingPanelA={isDraggingPanelA}
            isDraggingPanelC={isDraggingPanelC}
            isResizingPanel={false}
            onPanelAResizePointerDown={handlePanelAResizePointerDown}
            onPanelCResizePointerDown={handlePanelCResizePointerDown}
            containerRef={containerRef}
          />
        </div>
      </div>
    </GlobalDndProvider>
  );
}
