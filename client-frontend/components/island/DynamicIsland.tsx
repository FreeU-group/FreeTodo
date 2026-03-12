"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { unwrapApiData } from "@/lib/api/fetcher";
import { listTodosApiTodosGet } from "@/lib/generated/todos/todos";
import { IslandMode } from "@/lib/island/types";
import { queryKeys } from "@/lib/query/keys";
import { useUiStore } from "@/lib/store/ui-store";
import type { TodoListResponse } from "@/lib/types";
import {
  FloatContent,
  PopupContent,
} from "./IslandContent";
import { IslandSidebarContent } from "./IslandSidebarContent";

interface DynamicIslandProps {
  mode: IslandMode;
  onModeChange?: (mode: IslandMode) => void;
}

const DynamicIsland: React.FC<DynamicIslandProps> = ({ mode, onModeChange }) => {
  const prevModeRef = useRef<IslandMode | null>(null);
  const queryClient = useQueryClient();
  const [popupTodos, setPopupTodos] = useState<{ id: number; name: string }[]>([]);
  const lastTodoIdsRef = useRef<number[]>([]);
  const seenDraftIdsRef = useRef<number[]>([]);
  const setPanelFeature = useUiStore((state) => state.setPanelFeature);
  const togglePanelB = useUiStore((state) => state.togglePanelB);
  const isPanelBOpen = useUiStore((state) => state.isPanelBOpen);
  const [isDragging, setIsDragging] = useState(false);
  const [anchorPoint, setAnchorPoint] = useState<'top' | 'bottom' | null>('top');
  const [currentY, setCurrentY] = useState(20);
  const [screenHeight, setScreenHeight] = useState(1080);

  // 自定义拖拽处理器（仅允许垂直拖动）
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // 仅在非全屏模式下允许拖拽
    if (mode === IslandMode.FULLSCREEN) return;

    // 仅响应左键
    if (e.button !== 0) return;

    setIsDragging(true);

    // 发送拖拽开始事件到主进程
    if (typeof window !== "undefined" && window.electronAPI?.islandDragStart) {
      window.electronAPI.islandDragStart(e.screenY);
    }
  }, [mode]);

  // 用于 FLOAT/POPUP 模式的整体拖拽（整个区域可拖）
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // SIDEBAR 模式由 Header 独立处理，不在此处理
    if (mode === IslandMode.SIDEBAR) return;
    handleDragStart(e);
  }, [mode, handleDragStart]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    // 发送拖拽移动事件到主进程
    if (typeof window !== "undefined" && window.electronAPI?.islandDragMove) {
      window.electronAPI.islandDragMove(e.screenY);
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);

    // 发送拖拽结束事件到主进程
    if (typeof window !== "undefined" && window.electronAPI?.islandDragEnd) {
      window.electronAPI.islandDragEnd();
    }
  }, [isDragging]);

  // 设置全局鼠标事件监听器
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);

      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 监听位置和锚点更新
  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI) {
      // 监听位置更新（拖拽时）
      const cleanupPosition = window.electronAPI.onIslandPositionUpdate?.((data) => {
        setCurrentY(data.y);
        setScreenHeight(data.screenHeight);
      });

      // 监听锚点更新（模式切换时）
      const cleanupAnchor = window.electronAPI.onIslandAnchorUpdate?.((data) => {
        setAnchorPoint(data.anchor);
        setCurrentY(data.y);
      });

      return () => {
        cleanupPosition?.();
        cleanupAnchor?.();
      };
    }
  }, []);

  // 监听 draft 状态的待办变化：有新 draft 待办时，如果当前是 FLOAT 模式，则切换到 POPUP 模式并展示待办名称。
  // 用户从 POPUP 点击进入 SIDEBAR 后，同一批 draft 不会再次触发 POPUP。
  useEffect(() => {
    let isMounted = true;

    const fetchDraftTodos = async () => {
      try {
        const result = await listTodosApiTodosGet({
          status: "draft",
          limit: 3,
          offset: 0,
        });

        const data = unwrapApiData<TodoListResponse>(result);
        const todos = data?.todos ?? [];
        const ids = todos
          .map((t) => t.id)
          .filter((id): id is number => typeof id === "number");

        if (!isMounted || ids.length === 0) {
          return;
        }

        const lastTodoIds = lastTodoIdsRef.current;
        const sameAsLast =
          ids.length === lastTodoIds.length &&
          ids.every((id, idx) => id === lastTodoIds[idx]);

        if (sameAsLast) {
          return;
        }

        lastTodoIdsRef.current = ids;

        // 如果这一批 draft 已经通过 POPUP 被用户处理过，则不再弹出
        const seenIds = seenDraftIdsRef.current;
        const sameAsSeen =
          ids.length === seenIds.length &&
          ids.every((id, idx) => id === seenIds[idx]);

        if (sameAsSeen) {
          return;
        }

        const simplified = todos
          .filter((t) => typeof t.id === "number")
          .map((t) => ({
            id: t.id as number,
            name: t.name || "未命名待办",
          }));

        if (!isMounted || simplified.length === 0) {
          return;
        }

        setPopupTodos(simplified);

        // 草稿待办有更新时，让所有 Todo 查询变为 stale 并触发刷新，
        // 确保 Sidebar 中的 Todo 列表能及时显示最新的 draft 任务。
        try {
          void queryClient.invalidateQueries({ queryKey: queryKeys.todos.all });
        } catch {
          // 静默失败，避免影响后续逻辑
        }

        if (mode === IslandMode.FLOAT && onModeChange) {
          onModeChange(IslandMode.POPUP);
        }
      } catch {
        // 静默失败，避免打扰用户
      }
    };

    // 初次加载时获取一次
    void fetchDraftTodos();

    const timer = window.setInterval(() => {
      void fetchDraftTodos();
    }, 1000);

    return () => {
      isMounted = false;
      window.clearInterval(timer);
    };
  }, [mode, onModeChange, queryClient]);

  // Electron Click-Through Handling & Window Resizing
  useEffect(() => {
    const setIgnoreMouse = (ignore: boolean) => {
      // 使用 electronAPI（通过 preload 暴露）
      if (typeof window !== "undefined" && window.electronAPI) {
        try {
          if (ignore) {
            window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
          } else {
            window.electronAPI.setIgnoreMouseEvents(false);
          }
        } catch (e) {
          console.error("Electron API call failed", e);
        }
      }
    };

    // Resize window based on mode
    const resizeWindow = () => {
      if (typeof window !== "undefined" && prevModeRef.current !== mode) {
        try {
          // 尝试使用 electronAPI
          if (window.electronAPI?.islandResizeWindow) {
            window.electronAPI.islandResizeWindow(mode);
          }
          // 降级：使用 require('electron')
          else if (typeof window !== "undefined" && "require" in window) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const electron = (window as { require: (module: string) => { ipcRenderer: { send: (channel: string, ...args: unknown[]) => void } } }).require("electron");
            electron.ipcRenderer.send("resize-window", mode);
          }
          prevModeRef.current = mode;
        } catch (e) {
          console.error("Failed to resize window", e);
        }
      }
    };

    // Resize window when mode changes
    if (prevModeRef.current !== null) {
      resizeWindow();
    } else {
      if (mode !== IslandMode.FLOAT) {
        resizeWindow();
      } else {
        prevModeRef.current = mode;
      }
    }

    // Always allow mouse events
    setIgnoreMouse(false);
  }, [mode]);

  const getLayoutState = (mode: IslandMode) => {
    switch (mode) {
      case IslandMode.FLOAT:
        return {
          width: "100%",
          height: "100%",
          borderRadius: 9999, // 完美胶囊形状 (fully rounded, 与 rounded-full 语义一致)
        };
      case IslandMode.POPUP:
        return {
          width: "100%",
          height: "100%",
          borderRadius: 32,
        };
      case IslandMode.SIDEBAR:
        return {
          width: "100%",
          height: "100%",
          borderRadius: 48,
        };
      case IslandMode.FULLSCREEN:
        return {
          width: "100%",
          height: "100%",
          borderRadius: 0,
        };
      default:
        return {
          width: "100%",
          height: "100%",
          borderRadius: 28,
        };
    }
  };

  const layoutState = getLayoutState(mode);
  const isFullscreen = mode === IslandMode.FULLSCREEN;

  // 计算 transform-origin 基于锚点
  const getTransformOrigin = (): string => {
    if (anchorPoint === null || mode === IslandMode.FULLSCREEN) {
      return "center right";
    }

    // 对于 SIDEBAR 模式，使用智能锚点
    if (mode === IslandMode.SIDEBAR) {
      return `${anchorPoint} right`;
    }

    // 对于 FLOAT/POPUP 模式，根据当前位置决定
    const isInUpperHalf = currentY < screenHeight / 2;
    return isInUpperHalf ? "top right" : "bottom right";
  };

  return (
    <div className="relative w-full h-full pointer-events-none overflow-hidden">
      <motion.div
        layout
        initial={false}
        animate={{
          width: layoutState.width,
          height: layoutState.height,
          borderRadius: layoutState.borderRadius,
        }}
        transition={{
          type: "spring",
          stiffness: 340,
          damping: 28,
          mass: 0.6,
          restDelta: 0.001,
        }}
        className={`absolute overflow-hidden pointer-events-auto ${
          (mode === IslandMode.SIDEBAR || mode === IslandMode.FULLSCREEN) ? "bg-background" : ""
        }`}
        onMouseDown={handleMouseDown}
        style={{
          right: 0,
          bottom: 0,
          transformOrigin: getTransformOrigin(),
          // FLOAT/POPUP: 整个区域可拖拽，显示 ns-resize 光标
          // SIDEBAR: 仅 Header 可拖拽，主区域使用默认光标
          // FULLSCREEN: 不可拖拽
          cursor: (mode === IslandMode.FLOAT || mode === IslandMode.POPUP)
            ? (isDragging ? "grabbing" : "ns-resize")
            : "default",
          // Only apply box-shadow for SIDEBAR mode (FLOAT/POPUP are fully transparent, FULLSCREEN has no shadow)
          boxShadow: mode === IslandMode.SIDEBAR
            ? "0px 20px 50px -10px rgba(0, 0, 0, 0.5), 0px 10px 20px -10px rgba(0,0,0,0.3)"
            : "none",
        }}
      >
        {/* 背景层 - 仅在 SIDEBAR/FULLSCREEN 模式显示（FLOAT/POPUP 完全透明） */}
        {(mode === IslandMode.SIDEBAR || mode === IslandMode.FULLSCREEN) && (
          <div
            className={`absolute inset-0 bg-primary-foreground/90 dark:bg-accent/90 backdrop-blur-[80px] transition-colors duration-700 ease-out ${
              isFullscreen ? "bg-primary-foreground/98 dark:bg-accent/98" : ""
            }`}
          />
        )}

        {/* 噪点纹理 - 仅在 SIDEBAR/FULLSCREEN 模式显示 */}
        {(mode === IslandMode.SIDEBAR || mode === IslandMode.FULLSCREEN) && (
          <div className="absolute inset-0 opacity-[0.035] bg-[url('https://grainy-gradients.vercel.app/noise.svg')] pointer-events-none mix-blend-overlay" />
        )}

        {/* 光晕效果 - 仅在 SIDEBAR/FULLSCREEN 模式显示 */}
        {(mode === IslandMode.SIDEBAR || mode === IslandMode.FULLSCREEN) && (
          <div className="absolute inset-0">
            <div className="absolute top-[-50%] left-[-20%] w-full h-full rounded-full bg-primary/10 blur-[120px] mix-blend-screen" />
            <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-primary/8 blur-[120px] mix-blend-screen" />
          </div>
        )}

        {/* 边框 - 仅在 SIDEBAR 模式显示 */}
        {mode === IslandMode.SIDEBAR && (
          <div className="absolute inset-0 rounded-[inherit] border border-border pointer-events-none shadow-[inset_0_0_20px_oklch(var(--foreground)/0.03)]" />
        )}

        {/* 内容区域 */}
        <div className="absolute inset-0 w-full h-full text-foreground font-sans antialiased overflow-hidden">
          <AnimatePresence>
            {mode === IslandMode.FLOAT && (
              <motion.div key="float" className="absolute inset-0 w-full h-full">
                <FloatContent onModeChange={onModeChange} />
              </motion.div>
            )}
            {mode === IslandMode.POPUP && (
              <motion.div key="popup" className="absolute inset-0 w-full h-full">
                <PopupContent
                  todos={popupTodos}
                  onOpenSidebar={() => {
                    // 记录这一批 draft 已被用户查看，避免再次自动弹出 POPUP
                    if (popupTodos.length > 0) {
                      seenDraftIdsRef.current = popupTodos.map((t) => t.id);
                    }
                    // 确保 SIDEBAR 中有 TODO 面板：将 panelB 设为 todos 并打开
                    try {
                      setPanelFeature("panelB", "todos");
                      if (!isPanelBOpen) {
                        togglePanelB();
                      }
                    } catch {
                      // 静默失败，避免影响模式切换
                    }
                    if (onModeChange) {
                      onModeChange(IslandMode.SIDEBAR);
                    }
                  }}
                />
              </motion.div>
            )}
            {mode === IslandMode.SIDEBAR && (
              <motion.div key="sidebar" className="absolute inset-0 w-full h-full">
                <IslandSidebarContent
                  onModeChange={onModeChange || (() => {})}
                  onHeaderDragStart={handleDragStart}
                  isDragging={isDragging}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
};

export default DynamicIsland;
