"use client";

import { useCallback, useEffect, useState } from "react";
import DynamicIsland from "@/components/island/DynamicIsland";
import { IslandFullscreenContent } from "@/components/island/IslandFullscreenContent";
import { IslandSidebarContent } from "@/components/island/IslandSidebarContent";
import { IslandMode } from "@/lib/island/types";

/**
 * Island 页面组件
 * 作为 Dynamic Island 窗口的入口点
 *
 * 形态1/2: 使用 DynamicIsland 动画组件
 * 形态3/4: 直接渲染面板内容，保持与原 FreeTodo 一致的外观
 */
export default function IslandPage() {
  const [mode, setMode] = useState<IslandMode>(IslandMode.FLOAT);

  // 模式切换处理函数（供子组件调用）
  const handleModeChange = useCallback((newMode: IslandMode) => {
    setMode(newMode);
  }, []);

  // 键盘快捷键监听
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "1":
          setMode(IslandMode.FLOAT);
          break;
        case "2":
          setMode(IslandMode.POPUP);
          break;
        case "3":
          setMode(IslandMode.SIDEBAR);
          break;
        case "4":
          setMode(IslandMode.FULLSCREEN);
          break;
        case "Escape":
          // 逐级退出：全屏 -> 侧边栏 -> 悬浮 -> 隐藏
          if (mode === IslandMode.FULLSCREEN) {
            setMode(IslandMode.SIDEBAR);
          } else if (mode === IslandMode.SIDEBAR || mode === IslandMode.POPUP) {
            setMode(IslandMode.FLOAT);
          } else if (mode === IslandMode.FLOAT) {
            // 隐藏 Island 窗口
            if (typeof window !== "undefined" && window.electronAPI?.islandHide) {
              window.electronAPI.islandHide();
            }
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mode]);

  // 模式变化时通知 Electron 调整窗口大小
  useEffect(() => {
    if (typeof window !== "undefined" && window.electronAPI?.islandResizeWindow) {
      window.electronAPI.islandResizeWindow(mode);
    }
  }, [mode]);

  // 监听来自主窗口的模式切换消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "island:set-mode" && event.data?.mode) {
        const newMode = event.data.mode as IslandMode;
        if (Object.values(IslandMode).includes(newMode)) {
          setMode(newMode);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // 形态3: 侧边栏模式 - 直接渲染面板内容
  if (mode === IslandMode.SIDEBAR) {
    return (
      <div className="w-full h-full bg-background">
        <IslandSidebarContent onModeChange={handleModeChange} />
      </div>
    );
  }

  // 形态4: 全屏模式 - 直接渲染完整面板布局
  if (mode === IslandMode.FULLSCREEN) {
    return (
      <div className="w-full h-full bg-background">
        <IslandFullscreenContent onModeChange={handleModeChange} />
      </div>
    );
  }

  // 形态1/2: 悬浮/弹出模式 - 使用 DynamicIsland 动画组件
  return (
    <div className="island-container">
      <DynamicIsland
        mode={mode}
        onModeChange={handleModeChange}
      />
    </div>
  );
}
