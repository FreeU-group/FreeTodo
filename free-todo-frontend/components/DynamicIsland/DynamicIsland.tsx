"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minimize2, X } from 'lucide-react';
import { IslandMode } from './types';
import { 
  FloatContent
} from './IslandContent';
import { ContextMenu } from './ContextMenu';
import { PanelContent } from './PanelContent';
import { ResizeHandle } from './ResizeHandle';
import { useAppStore } from '@/apps/voice-module/store/useAppStore';
import { useConfig, useSaveConfig } from '@/lib/query';

interface DynamicIslandProps {
  mode: IslandMode;
  onModeChange?: (mode: IslandMode) => void;
  onClose?: () => void; // 保留以保持接口兼容性，但使用 handleClose 代替
}


export const DynamicIsland: React.FC<DynamicIslandProps> = ({ 
  mode, 
  onModeChange,
  onClose 
}) => {
  const { isRecording } = useAppStore();
  const recordingStatus = useAppStore(state => state.processStatus.recording);
  const isPaused = recordingStatus === 'paused';
  
  
  // 配置管理
  const { data: config } = useConfig();
  const saveConfigMutation = useSaveConfig();
  const recorderEnabled = config?.jobsRecorderEnabled ?? false;
  
  // 拖拽状态（完全手动实现，支持任意位置放置，吸附到最近的边缘）
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isHovered, setIsHovered] = useState(false); // 鼠标悬停状态
  const dragStartPos = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const islandRef = useRef<HTMLDivElement>(null);

  // 右键菜单状态（仅 FLOAT 模式下使用）
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleOpenContextMenu = useCallback((event: React.MouseEvent) => {
    if (mode !== IslandMode.FLOAT) return;
    event.preventDefault();
    // 在鼠标位置稍微上移一点，让菜单悬浮在灵动岛上方
    setContextMenuPosition({
      x: event.clientX,
      y: event.clientY - 8,
    });
    setContextMenuOpen(true);
  }, [mode]);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenuOpen(false);
  }, []);
  
  // 处理录音控制 - 通过事件系统触发 VoiceModulePanel 的录音
  const handleToggleRecording = useCallback(() => {
    console.log('[DynamicIsland] handleToggleRecording called, isRecording:', isRecording, 'isPaused:', isPaused);
    
    let action: 'start' | 'stop' | 'pause' | 'resume';
    
    if (!isRecording) {
      action = 'start';
    } else if (isPaused) {
      action = 'resume';
    } else {
      action = 'pause'; // 单击暂停
    }
    
    console.log('[DynamicIsland] Dispatching recording action:', action);
    
    // 发送自定义事件，让 VoiceModulePanel 监听并处理
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('dynamic-island-toggle-recording', {
        detail: { action },
        bubbles: true,
        cancelable: true
      });
      
      window.dispatchEvent(event);
      document.dispatchEvent(event);
    }
    
    console.log('[DynamicIsland] Event dispatched');
  }, [isRecording, isPaused]);

  // 处理停止录音
  const handleStopRecording = useCallback(() => {
    console.log('[DynamicIsland] handleStopRecording called');
    
    if (typeof window !== 'undefined') {
      const event = new CustomEvent('dynamic-island-toggle-recording', {
        detail: { action: 'stop' },
        bubbles: true,
        cancelable: true
      });
      
      window.dispatchEvent(event);
      document.dispatchEvent(event);
      
      console.log('[DynamicIsland] Stop recording event dispatched');
    }
  }, []);

  // 处理截屏开关切换
  const handleToggleScreenshot = useCallback(async () => {
    console.log('[DynamicIsland] 📸 切换截屏开关:', !recorderEnabled);
    try {
      await saveConfigMutation.mutateAsync({
        data: {
          jobsRecorderEnabled: !recorderEnabled,
        },
      });
      console.log('[DynamicIsland] ✅ 截屏开关已切换:', !recorderEnabled);
    } catch (error) {
      console.error('[DynamicIsland] ❌ 切换截屏开关失败:', error);
    }
  }, [recorderEnabled, saveConfigMutation]);

  // 处理窗口缩放（用于自定义缩放把手）
  const handleResize = useCallback((deltaX: number, deltaY: number, position: string) => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.resizeWindow) {
      console.log('[DynamicIsland] 缩放窗口:', { deltaX, deltaY, position });
      electronAPI.resizeWindow(deltaX, deltaY, position);
    } else {
      console.warn('[DynamicIsland] electronAPI.resizeWindow 不存在');
    }
  }, []);
  
  
  // LOGIC: Electron Click-Through Handling - 完全照搬 island 实现
  useEffect(() => {
    // Helper to safely call Electron API
    const setIgnoreMouse = (ignore: boolean) => {
      if ((window as any).require) {
        try {
          const { ipcRenderer } = (window as any).require('electron');
          if (ignore) {
            // forward: true lets the mouse move event still reach the browser 
            // so we can detect when to turn it back on.
            ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
          } else {
            ipcRenderer.send('set-ignore-mouse-events', false);
          }
        } catch (e) {
          console.error("Electron IPC failed", e);
        }
      } else if ((window as any).electronAPI) {
        try {
          (window as any).electronAPI?.setIgnoreMouseEvents?.(ignore, ignore ? { forward: true } : {});
        } catch (e) {
          console.error("Electron API failed", e);
        }
      }
    };

    // If we are in FULLSCREEN mode, we always want to capture mouse
    if (mode === IslandMode.FULLSCREEN) {
      setIgnoreMouse(false);
    } 
    // Panel 模式：窗口可交互，不忽略鼠标
    else if (mode === IslandMode.PANEL) {
      setIgnoreMouse(false);
    }
    // FLOAT 模式：默认忽略鼠标（点击穿透），hover 时会取消忽略
    else {
      setIgnoreMouse(true);
    }
  }, [mode]);


  // 全局鼠标移动监听器：检测鼠标是否在灵动岛区域内
  useEffect(() => {
    if (mode === IslandMode.FULLSCREEN || typeof window === 'undefined') return;

    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (!islandRef.current) return;

      const rect = islandRef.current.getBoundingClientRect();
      const { clientX, clientY } = e;

      // 检查鼠标是否在灵动岛区域内（包括一些容差，避免边缘抖动）
      const padding = 10; // 容差：10px
      const isInside = 
        clientX >= rect.left - padding &&
        clientX <= rect.right + padding &&
        clientY >= rect.top - padding &&
        clientY <= rect.bottom + padding;

      if (isInside && !isHovered) {
        // 鼠标进入区域，展开
        setIsHovered(true);
        const setIgnoreMouse = (ignore: boolean) => {
          if ((window as any).require) {
            try {
              const { ipcRenderer } = (window as any).require('electron');
              ipcRenderer.send('set-ignore-mouse-events', ignore, ignore ? { forward: true } : {});
            } catch (e) {
              console.error("Electron IPC failed", e);
            }
          } else if ((window as any).electronAPI) {
            try {
              (window as any).electronAPI?.setIgnoreMouseEvents?.(ignore, ignore ? { forward: true } : {});
            } catch (e) {
              console.error("Electron IPC failed", e);
            }
          }
        };
        setIgnoreMouse(false); // 取消点击穿透，允许交互
        console.log('[DynamicIsland] Mouse entered (global), click-through disabled');
      } else if (!isInside && isHovered) {
        // 鼠标移出区域，折叠
        setIsHovered(false);
        const setIgnoreMouse = (ignore: boolean) => {
          if ((window as any).require) {
            try {
              const { ipcRenderer } = (window as any).require('electron');
              ipcRenderer.send('set-ignore-mouse-events', ignore, { forward: true });
            } catch (e) {
              console.error("Electron IPC failed", e);
            }
          } else if ((window as any).electronAPI) {
            try {
              (window as any).electronAPI?.setIgnoreMouseEvents?.(ignore, { forward: true });
            } catch (e) {
              console.error("Electron IPC failed", e);
            }
          }
        };
        setIgnoreMouse(true); // 恢复点击穿透
        console.log('[DynamicIsland] Mouse left (global), click-through enabled');
      }
    };

    // 使用 requestAnimationFrame 优化性能
    let rafId: number | null = null;
    const throttledHandleMouseMove = (e: MouseEvent) => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        handleGlobalMouseMove(e);
        rafId = null;
      });
    };

    window.addEventListener('mousemove', throttledHandleMouseMove, { passive: true });

    return () => {
      window.removeEventListener('mousemove', throttledHandleMouseMove);
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [mode, isHovered]);

  const handleMouseEnter = () => {
    if (mode !== IslandMode.FULLSCREEN && (window as any).require) {
      setIsHovered(true);
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('set-ignore-mouse-events', false);
    }
  };

  const handleMouseLeave = () => {
    if (mode !== IslandMode.FULLSCREEN && (window as any).require) {
      setIsHovered(false);
      const { ipcRenderer } = (window as any).require('electron');
      ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
    }
  };

  // 处理展开到窗口化模式（可调整大小）- 通过键盘快捷键触发

  // 处理关闭/恢复（完全按照 electron-with-nextjs 的方式）
  const handleClose = async () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI) {
      await electronAPI.collapseWindow?.();
    }
    onModeChange?.(IslandMode.FLOAT);
    onClose?.(); // 调用外部传入的 onClose 回调
  };

  // 键盘快捷键（参考 island 的实现）
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      switch(e.key) {
        case '1': 
          // 切换到悬浮模式
          const electronAPI = (window as any).electronAPI;
          if (electronAPI) {
            await electronAPI.collapseWindow?.();
            // 折叠回灵动岛时，重新开启点击穿透
            electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
          }
          onModeChange?.(IslandMode.FLOAT); 
          break;
        case '4': 
          // 切换到Panel模式（使用默认位置，简单可靠）
          const electronAPI2 = (window as any).electronAPI;
          if (electronAPI2) {
            // 直接使用默认位置，不计算相对位置，避免位置错误
            await electronAPI2.expandWindow?.();
          }
          onModeChange?.(IslandMode.PANEL); 
          break;
        case '5':
          // 切换到全屏模式
          const electronAPI4 = (window as any).electronAPI;
          if (electronAPI4) {
            await electronAPI4.expandWindowFull?.();
          }
          onModeChange?.(IslandMode.FULLSCREEN); 
          break;
        case 'Escape': 
          // Escape 键：从全屏/Panel模式返回悬浮模式
          if (mode === IslandMode.FULLSCREEN || mode === IslandMode.PANEL) {
            const electronAPI3 = (window as any).electronAPI;
            if (electronAPI3) {
              await electronAPI3.collapseWindow?.();
              // 折叠回灵动岛时，重新开启点击穿透
              electronAPI3?.setIgnoreMouseEvents?.(true, { forward: true });
            }
            onModeChange?.(IslandMode.FLOAT);
          }
          break;
        default: 
          break;
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [mode, onModeChange]);

  // 计算吸附位置（支持任意位置，吸附到最近的边缘或角落）
  const calculateSnapPosition = useCallback((x: number, y: number): { x: number; y: number } => {
    if (typeof window === 'undefined') {
      return { x, y };
    }
    
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const islandWidth = 180;
    const islandHeight = 48;
    const margin = 32;
    const snapThreshold = 50; // 吸附阈值：50px
    
    let snapX = x;
    let snapY = y;
    
    // 检查是否靠近左边缘
    if (x <= margin + snapThreshold) {
      snapX = margin;
    }
    // 检查是否靠近右边缘
    else if (x >= windowWidth - islandWidth - margin - snapThreshold) {
      snapX = windowWidth - islandWidth - margin;
    }
    
    // 检查是否靠近上边缘
    if (y <= margin + snapThreshold) {
      snapY = margin;
    }
    // 检查是否靠近下边缘
    else if (y >= windowHeight - islandHeight - margin - snapThreshold) {
      snapY = windowHeight - islandHeight - margin;
    }
    
    // 限制在屏幕范围内
    snapX = Math.max(margin, Math.min(snapX, windowWidth - islandWidth - margin));
    snapY = Math.max(margin, Math.min(snapY, windowHeight - islandHeight - margin));
    
    return { x: snapX, y: snapY };
  }, []);

  // 手动拖拽实现（完全控制位置，防止飞出屏幕）
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode === IslandMode.FULLSCREEN) return;
    
    // 如果点击的是按钮或可交互元素，不拖拽
    const target = e.target as HTMLElement;
    if (target.closest('button, a, input, select, textarea, [role="button"]')) {
      return;
    }
    
    if (e.button === 0) { // 左键
      setIsDragging(true);
      const rect = islandRef.current?.getBoundingClientRect();
      if (rect) {
        dragStartPos.current = {
          x: e.clientX,
          y: e.clientY,
          startX: rect.left,
          startY: rect.top,
        };
      }
      e.preventDefault();
    }
  }, [mode]);

  // 处理鼠标移动
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isDragging || !dragStartPos.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!islandRef.current || !dragStartPos.current) return;

      const deltaX = e.clientX - dragStartPos.current.x;
      const deltaY = e.clientY - dragStartPos.current.y;
      
      // 计算新位置
      let newX = dragStartPos.current.startX + deltaX;
      let newY = dragStartPos.current.startY + deltaY;
      
      // 限制在屏幕范围内
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;
      const islandWidth = 180;
      const islandHeight = 48;
      
      newX = Math.max(0, Math.min(newX, windowWidth - islandWidth));
      newY = Math.max(0, Math.min(newY, windowHeight - islandHeight));
      
      // 更新位置（临时位置，不更新 corner）
      islandRef.current.style.left = `${newX}px`;
      islandRef.current.style.top = `${newY}px`;
      islandRef.current.style.right = 'auto';
      islandRef.current.style.bottom = 'auto';
    };

    const handleMouseUp = (_e: MouseEvent) => {
      if (!islandRef.current || !dragStartPos.current) return;
      
      const rect = islandRef.current.getBoundingClientRect();
      const currentX = rect.left;
      const currentY = rect.top;
      
      // 计算吸附位置
      const snapPos = calculateSnapPosition(currentX, currentY);
      
      // 更新位置状态，framer-motion 会自动平滑移动到新位置
      setPosition(snapPos);
      setIsDragging(false);
      dragStartPos.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, calculateSnapPosition]);

  const getLayoutState = (mode: IslandMode) => {
    const margin = 32;
    
    switch (mode) {
      case IslandMode.FLOAT:
        // 默认收起状态：只显示小图标（32x32）
        // 鼠标悬停时展开：显示完整内容（180x48）
        const collapsedLayout = { 
          width: 32, 
          height: 32, 
          borderRadius: 16
        };
        const expandedLayout = { 
          // 稍微缩窄一点，减小中间空隙
          width: 160, 
          height: 48, 
          borderRadius: 24
        };
        
        const baseLayout = isHovered ? expandedLayout : collapsedLayout;
        
        if (position) {
          return { 
            ...baseLayout, 
            left: position.x, 
            top: position.y, 
            right: 'auto', 
            bottom: 'auto' 
          };
        } else {
          // 默认位置：右下角
          return { 
            ...baseLayout, 
            right: margin, 
            bottom: margin, 
            left: 'auto', 
            top: 'auto' 
          };
        }
      case IslandMode.PANEL:
        // Panel模式：窗口化显示，由Electron控制大小和位置
        // 为避免四角露出灰底，这里让内容铺满整个窗口，改成矩形（无圆角）
        return { 
          width: '100%',  
          height: '100%', 
          borderRadius: 0,
          right: 0,        
          bottom: 0,
          left: 0,
          top: 0
        };
      case IslandMode.FULLSCREEN:
        return { 
          width: '100vw',  
          height: '100vh', 
          borderRadius: 0,
          right: 0,        
          bottom: 0,
          left: 0,
          top: 0
        };
      default:
        return { 
          width: 180, 
          height: 48, 
          borderRadius: 24,
          right: margin,
          bottom: margin,
          left: 'auto',
          top: 'auto'
        };
    }
  };

  const layoutState = getLayoutState(mode);
  const isFullscreen = mode === IslandMode.FULLSCREEN;
  const isPanel = mode === IslandMode.PANEL;

  // FULLSCREEN 模式：不再包裹前端，只在顶部悬浮一条控制条，可拖动窗口
  if (isFullscreen) {
    return (
      <>
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.5, rotate: -45 }}
            className="fixed inset-x-0 top-0 z-[30] pointer-events-none"
          >
            <div
              className="flex items-center justify-end px-4 pt-2 h-10"
              style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
              <div
                className="flex items-center gap-1.5 rounded-xl bg-background/80 dark:bg-background/80 backdrop-blur-xl border border-[oklch(var(--border))]/40 shadow-sm px-2 py-1 text-[oklch(var(--foreground))]/60 pointer-events-auto"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
              <button
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
                title="退出全屏"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const electronAPI = (window as any).electronAPI;
                    if (electronAPI?.expandWindow) {
                      await electronAPI.expandWindow();
                    }
                    // 全屏切回 Panel 后，仍然保持可交互（不忽略鼠标）
                    electronAPI?.setIgnoreMouseEvents?.(false);
                    onModeChange?.(IslandMode.PANEL);
                  } catch (error) {
                    console.error('[DynamicIsland] 退出全屏失败:', error);
                  }
                }}
              >
                <Minimize2 size={15} />
              </button>
              <button
                className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
                title="折叠到灵动岛"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    const electronAPI = (window as any).electronAPI;
                    if (electronAPI?.collapseWindow) {
                      await electronAPI.collapseWindow();
                    }
                    // 折叠回灵动岛时，重新开启点击穿透，避免挡住桌面
                    electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
                    onModeChange?.(IslandMode.FLOAT);
                    onClose?.();
                  } catch (error) {
                    console.error('[DynamicIsland] 关闭面板失败:', error);
                    onModeChange?.(IslandMode.FLOAT);
                    onClose?.();
                  }
                }}
              >
                <X size={15} />
              </button>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
        {/* Fullscreen 模式的缩放把手 - 覆盖整个窗口 */}
        <div className="fixed inset-0 z-[100] pointer-events-none">
          <div className="pointer-events-auto">
            <ResizeHandle position="top" onResize={handleResize} />
            <ResizeHandle position="bottom" onResize={handleResize} />
            <ResizeHandle position="left" onResize={handleResize} />
            <ResizeHandle position="right" onResize={handleResize} />
            <ResizeHandle position="top-left" onResize={handleResize} />
            <ResizeHandle position="top-right" onResize={handleResize} />
            <ResizeHandle position="bottom-left" onResize={handleResize} />
            <ResizeHandle position="bottom-right" onResize={handleResize} />
          </div>
        </div>
      </>
    );
  }

  // Panel 模式：白色窗口化面板，内部滚动
  if (isPanel) {
    return (
      <div className="fixed inset-0 z-[30] pointer-events-none overflow-hidden">
        <motion.div
          layout
          initial={false}
          animate={layoutState}
          transition={{
            type: "spring",
            stiffness: 340,
            damping: 28,
            mass: 0.6,
            restDelta: 0.001,
          }}
          className="absolute pointer-events-auto origin-bottom-right bg-background rounded-2xl shadow-2xl border border-[oklch(var(--border))]/40 overflow-hidden"
        >
          {/* Panel 模式的缩放把手 */}
          <ResizeHandle position="top" onResize={handleResize} />
          <ResizeHandle position="bottom" onResize={handleResize} />
          <ResizeHandle position="left" onResize={handleResize} />
          <ResizeHandle position="right" onResize={handleResize} />
          <ResizeHandle position="top-left" onResize={handleResize} />
          <ResizeHandle position="top-right" onResize={handleResize} />
          <ResizeHandle position="bottom-left" onResize={handleResize} />
          <ResizeHandle position="bottom-right" onResize={handleResize} />
          <div className="flex flex-col w-full h-full text-[oklch(var(--foreground))]">
            <div
              className="h-8 px-4 flex items-center justify-between bg-background/95"
              style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
            >
              <div className="text-xs text-[oklch(var(--foreground))]/70 select-none">
                LifeTrace · AI 聊天
              </div>
              {/* 右上角：和全屏模式保持一致的“全屏 / 折叠”按钮 */}
              <div
                className="flex items-center gap-1.5 text-[oklch(var(--foreground))]/60"
                style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              >
                <button
                  className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
                  title="展开为全屏"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const electronAPI = (window as any).electronAPI;
                      if (electronAPI?.expandWindowFull) {
                        await electronAPI.expandWindowFull();
                      }
                      onModeChange?.(IslandMode.FULLSCREEN);
                    } catch (error) {
                      console.error("[DynamicIsland] 切换全屏失败:", error);
                    }
                  }}
                >
                  <Minimize2 size={14} />
                </button>
                <button
                  className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-[oklch(var(--muted))]/40 hover:text-[oklch(var(--foreground))] transition-colors"
                  title="折叠到灵动岛"
                  onClick={async (e) => {
                    e.stopPropagation();
                    try {
                      const electronAPI = (window as any).electronAPI;
                      if (electronAPI?.collapseWindow) {
                        await electronAPI.collapseWindow();
                      }
                      // 折叠回灵动岛时，重新开启点击穿透，避免挡住桌面
                      electronAPI?.setIgnoreMouseEvents?.(true, { forward: true });
                    } finally {
                      onModeChange?.(IslandMode.FLOAT);
                      onClose?.();
                    }
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <PanelContent />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // FLOAT 模式：保持原有实现
  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      <motion.div
        ref={islandRef}
        layout
        initial={false}
        animate={layoutState}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown}
        transition={{
          type: "spring",
          stiffness: 350,
          damping: 30,
          mass: 0.8,
          restDelta: 0.001
        }}
        className="absolute cursor-grab active:cursor-grabbing overflow-hidden pointer-events-auto bg-[#0a0a0a]"
        style={{
          boxShadow: '0px 20px 50px -10px rgba(0, 0, 0, 0.5), 0px 10px 20px -10px rgba(0,0,0,0.3)',
          borderRadius: layoutState.borderRadius ? `${layoutState.borderRadius}px` : undefined,
          userSelect: 'none' as any,
        } as React.CSSProperties}
      >
        {/* 背景 */}
        <>
          <div className="absolute inset-0 backdrop-blur-[80px] transition-colors duration-700 ease-out bg-[#080808]/90"></div>
          <div className={`absolute inset-0 transition-opacity duration-1000 ${isFullscreen ? 'opacity-100' : 'opacity-0'}`}>
            <div className="absolute top-[-50%] left-[-20%] w-[100%] h-[100%] rounded-full bg-indigo-500/10 blur-[120px] mix-blend-screen"></div>
            <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-purple-500/10 blur-[120px] mix-blend-screen"></div>
          </div>
          <div className="absolute inset-0 rounded-[inherit] border border-white/10 pointer-events-none shadow-[inset_0_0_20px_rgba(255,255,255,0.03)] transition-opacity duration-500"></div>
        </>

        {/* 内容区域 */}
        <div
          className="absolute inset-0 w-full h-full text-white font-sans antialiased overflow-hidden"
          // 右键打开自定义菜单，屏蔽浏览器/系统默认菜单（包括“退出应用”等文字）
          onContextMenu={handleOpenContextMenu}
        >
          {mode === IslandMode.FLOAT ? (
            <motion.div 
              key="float" 
              className="absolute inset-0 w-full h-full"
              onMouseEnter={handleMouseEnter} // 确保鼠标进入时取消点击穿透
              onMouseLeave={handleMouseLeave} // 鼠标离开时恢复点击穿透
              onMouseDown={(e) => {
                // 如果点击的是按钮，阻止拖拽
                const target = e.target as HTMLElement;
                if (target.closest('button, a, input, select, textarea, [role="button"]')) {
                  e.stopPropagation();
                }
              }}
            >
              <div
                className="w-full h-full"
              >
                <FloatContent 
                  onToggleRecording={handleToggleRecording}
                  onStopRecording={handleStopRecording}
                  onScreenshot={handleToggleScreenshot}
                  screenshotEnabled={recorderEnabled}
                  isCollapsed={!isHovered}
                  onOpenPanel={async () => {
                    // 完全按照"4键"的逻辑：切换到Panel模式（使用默认位置，简单可靠）
                    const electronAPI2 = (window as any).electronAPI;
                    if (electronAPI2) {
                      // 直接使用默认位置，不计算相对位置，避免位置错误
                      await electronAPI2.expandWindow?.();
                    }
                    onModeChange?.(IslandMode.PANEL);
                  }}
                />
              </div>
            </motion.div>
          ) : (
            // 全屏模式下，显示完整内容（VoiceModulePanel 会在 page.tsx 中渲染）
            <div className="w-full h-full">
              {/* 内容由 page.tsx 渲染 */}
            </div>
          )}
        </div>
      </motion.div>

      {/* 灵动岛右键菜单：只在 FLOAT 模式下使用，小电源图标，无文字 */}
      <ContextMenu
        open={contextMenuOpen}
        position={contextMenuPosition}
        onClose={handleCloseContextMenu}
        onQuit={() => {
          const electronAPI = (window as any).electronAPI;
          electronAPI?.quit?.();
        }}
      />
    </div>
  );
};

