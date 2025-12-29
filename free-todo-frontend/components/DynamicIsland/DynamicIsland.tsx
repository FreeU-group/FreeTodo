"use client";

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Minimize2 } from 'lucide-react';
import { IslandMode } from './types';
import { 
  FloatContent
} from './IslandContent';
import { useAppStore } from '@/apps/voice-module/store/useAppStore';

interface DynamicIslandProps {
  mode: IslandMode;
  onModeChange?: (mode: IslandMode) => void;
  onClose?: () => void; // 保留以保持接口兼容性，但使用 handleClose 代替
}

type Corner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export const DynamicIsland: React.FC<DynamicIslandProps> = ({ 
  mode, 
  onModeChange,
  onClose 
}) => {
  const { isRecording } = useAppStore();
  const recordingStatus = useAppStore(state => state.processStatus.recording);
  const isPaused = recordingStatus === 'paused';
  
  // 拖拽状态（完全手动实现，不使用 framer-motion 的 drag）
  const [corner, setCorner] = useState<Corner>('bottom-right');
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const islandRef = useRef<HTMLDivElement>(null);
  
  // 处理录音控制 - 通过事件系统触发 VoiceModulePanel 的录音
  const handleToggleRecording = useCallback(() => {
    console.log('[DynamicIsland] handleToggleRecording called, isRecording:', isRecording, 'isPaused:', isPaused);
    
    let action: 'start' | 'stop' | 'pause' | 'resume';
    
    if (!isRecording) {
      action = 'start';
    } else if (isPaused) {
      action = 'resume';
    } else {
      action = 'pause'; // 第一次点击暂停，再次点击停止
    }
    
    console.log('[DynamicIsland] Dispatching recording action:', action);
    
    // 发送自定义事件，让 VoiceModulePanel 监听并处理
    // 使用原生 DOM 事件，确保能被正确接收
    const event = new CustomEvent('dynamic-island-toggle-recording', {
      detail: { action },
      bubbles: true,
      cancelable: true
    });
    
    // 同时在 window 和 document 上发送事件
    window.dispatchEvent(event);
    document.dispatchEvent(event);
    
    // 也尝试直接调用 document 上的监听器
    const listeners = (document as any).__dynamicIslandListeners || [];
    listeners.forEach((listener: (action: string) => void) => {
      try {
        listener(action);
      } catch (e) {
        console.error('[DynamicIsland] Error calling listener:', e);
      }
    });
    
    console.log('[DynamicIsland] Event dispatched to window, document, and listeners');
  }, [isRecording, isPaused]);
  
  // 处理停止录音（长按或右键）
  const handleStopRecording = (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const event = new CustomEvent('dynamic-island-toggle-recording', {
      detail: { action: 'stop' }
    });
    window.dispatchEvent(event);
  };
  
  // LOGIC: Electron Click-Through Handling
  // Initialize click-through on mount
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
          (window as any).electronAPI?.setIgnoreMouseEvents?.(ignore, { forward: true });
        } catch (e) {
          console.error("Electron IPC failed", e);
        }
      }
    };

    // Immediately set click-through on mount (for FLOAT mode)
    if (mode !== IslandMode.FULLSCREEN) {
      setIgnoreMouse(true);
    }
  }, []); // Run once on mount

  // Update click-through when mode changes
  useEffect(() => {
    const setIgnoreMouse = (ignore: boolean) => {
      if ((window as any).require) {
        try {
          const { ipcRenderer } = (window as any).require('electron');
          if (ignore) {
            ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
          } else {
            ipcRenderer.send('set-ignore-mouse-events', false);
          }
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

    // If we are in FULLSCREEN mode, we always want to capture mouse
    if (mode === IslandMode.FULLSCREEN) {
      setIgnoreMouse(false);
    } 
    // Otherwise, we default to ignore, and let the hover events below handle the toggle
    else {
      setIgnoreMouse(true);
    }
  }, [mode]);


  const handleMouseEnter = () => {
    if (mode !== IslandMode.FULLSCREEN) {
      // 鼠标进入时，立即取消点击穿透，允许交互和拖拽
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
      console.log('[DynamicIsland] Mouse entered, click-through disabled');
    }
  };

  const handleMouseLeave = () => {
    if (mode !== IslandMode.FULLSCREEN) {
      // 鼠标离开时，恢复点击穿透
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
      console.log('[DynamicIsland] Mouse left, click-through enabled');
    }
  };

  // 处理展开到全屏（完全按照 electron-with-nextjs 的方式）
  const handleExpandFull = async () => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI) {
      await electronAPI.expandWindowFull?.();
    }
    onModeChange?.(IslandMode.FULLSCREEN);
  };

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
          }
          onModeChange?.(IslandMode.FLOAT); 
          break;
        case '4': 
          // 切换到全屏模式
          const electronAPI2 = (window as any).electronAPI;
          if (electronAPI2) {
            await electronAPI2.expandWindowFull?.();
          }
          onModeChange?.(IslandMode.FULLSCREEN); 
          break;
        case 'Escape': 
          // Escape 键：从全屏模式返回悬浮模式
          if (mode === IslandMode.FULLSCREEN) {
            const electronAPI3 = (window as any).electronAPI;
            if (electronAPI3) {
              await electronAPI3.collapseWindow?.();
            }
            onModeChange?.(IslandMode.FLOAT);
          }
          break;
        default: 
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, onModeChange]);

  // 计算最近的角落（参考 BottomDock 的实现）
  const calculateNearestCorner = useCallback((x: number, y: number): Corner => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const islandWidth = 180;
    const islandHeight = 48;
    const margin = 32;
    
    // 计算到各个角落的距离
    const distances = {
      'top-left': Math.sqrt(Math.pow(x - margin - islandWidth / 2, 2) + Math.pow(y - margin - islandHeight / 2, 2)),
      'top-right': Math.sqrt(Math.pow(windowWidth - x - margin - islandWidth / 2, 2) + Math.pow(y - margin - islandHeight / 2, 2)),
      'bottom-left': Math.sqrt(Math.pow(x - margin - islandWidth / 2, 2) + Math.pow(windowHeight - y - margin - islandHeight / 2, 2)),
      'bottom-right': Math.sqrt(Math.pow(windowWidth - x - margin - islandWidth / 2, 2) + Math.pow(windowHeight - y - margin - islandHeight / 2, 2)),
    };
    
    // 找到最近的角落
    let nearestCorner: Corner = 'bottom-right';
    let minDistance = Infinity;
    
    for (const [corner, distance] of Object.entries(distances)) {
      if (distance < minDistance) {
        minDistance = distance;
        nearestCorner = corner as Corner;
      }
    }
    
    return nearestCorner;
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
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // 计算最近的角落
      const nearestCorner = calculateNearestCorner(centerX, centerY);
      
      // 更新角落状态，framer-motion 会自动平滑移动到新位置
      setCorner(nearestCorner);
      setIsDragging(false);
      dragStartPos.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, calculateNearestCorner]);

  const getLayoutState = (mode: IslandMode) => {
    const margin = 32;
    
    switch (mode) {
      case IslandMode.FLOAT:
        // 根据角落位置返回不同的布局
        const baseLayout = { 
          width: 180, 
          height: 48, 
          borderRadius: 24
        };
        
        switch (corner) {
          case 'top-left':
            return { ...baseLayout, left: margin, top: margin, right: 'auto', bottom: 'auto' };
          case 'top-right':
            return { ...baseLayout, right: margin, top: margin, left: 'auto', bottom: 'auto' };
          case 'bottom-left':
            return { ...baseLayout, left: margin, bottom: margin, right: 'auto', top: 'auto' };
          case 'bottom-right':
          default:
            return { ...baseLayout, right: margin, bottom: margin, left: 'auto', top: 'auto' };
        }
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

  return (
    <div className="fixed inset-0 z-50 pointer-events-none overflow-hidden">
      {/* 全屏模式下，灵动岛容器应该完全透明且不拦截点击事件 */}
      <motion.div
        ref={islandRef}
        layout
        initial={false}
        animate={isFullscreen ? {
          width: '100vw',
          height: '100vh',
          borderRadius: 0,
          right: 0,
          bottom: 0,
          left: 0,
          top: 0
        } : layoutState}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseDown={handleMouseDown} // 手动拖拽开始
        onDoubleClick={(e) => {
          // 双击全屏（参考 island，在外层处理）
          // 如果点击的是可交互元素，不触发全屏
          const target = e.target as HTMLElement;
          if (!target.closest('button, a, input, select, textarea, [role="button"]')) {
            if (!isFullscreen) {
              handleExpandFull();
            }
          }
        }}
        transition={{
          type: "spring",
          stiffness: 350, // 参考 BottomDock 的配置
          damping: 30,    // 参考 BottomDock 的配置
          mass: 0.8,      // 参考 BottomDock 的配置
          restDelta: 0.001
        }}
        className={`absolute overflow-hidden ${
          isFullscreen ? 'pointer-events-none' : 'pointer-events-auto'
        } ${
          isFullscreen ? 'bg-transparent' : 'bg-[#0a0a0a]'
        } ${!isFullscreen ? 'cursor-grab active:cursor-grabbing' : ''}`}
        style={{
            boxShadow: isFullscreen ? 'none' : '0px 20px 50px -10px rgba(0, 0, 0, 0.5), 0px 10px 20px -10px rgba(0,0,0,0.3)',
            borderRadius: layoutState.borderRadius ? `${layoutState.borderRadius}px` : undefined,
            // 移除 WebkitAppRegion，使用自定义拖拽
            userSelect: 'none' as any,
        } as React.CSSProperties}
      >
        {/* 非全屏模式下的背景 */}
        {!isFullscreen && (
          <>
            <div className="absolute inset-0 bg-[#080808]/90 backdrop-blur-[80px] transition-colors duration-700 ease-out"></div>
            <div className={`absolute inset-0 transition-opacity duration-1000 ${mode === IslandMode.FLOAT ? 'opacity-0' : 'opacity-100'}`}>
                <div className="absolute top-[-50%] left-[-20%] w-[100%] h-[100%] rounded-full bg-indigo-500/10 blur-[120px] mix-blend-screen"></div>
                <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-purple-500/10 blur-[120px] mix-blend-screen"></div>
            </div>
            <div className="absolute inset-0 rounded-[inherit] border border-white/10 pointer-events-none shadow-[inset_0_0_20px_rgba(255,255,255,0.03)] transition-opacity duration-500"></div>
          </>
        )}

        {/* 关闭按钮（参考 island 的实现，在全屏模式下显示，需要 pointer-events-auto） */}
        <AnimatePresence>
          {isFullscreen && (
            <motion.button
              initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.5, rotate: -45 }}
              className="absolute z-[60] top-8 right-8 w-10 h-10 rounded-full bg-blue-500/80 hover:bg-blue-500 flex items-center justify-center text-white transition-all backdrop-blur-md cursor-pointer border border-blue-400/50 shadow-lg pointer-events-auto"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
            >
              <Minimize2 size={18} />
            </motion.button>
          )}
        </AnimatePresence>

        {/* 内容区域 */}
        <div className="absolute inset-0 w-full h-full text-white font-sans antialiased overflow-hidden">
          {!isFullscreen && (
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
              <FloatContent 
                onToggleRecording={handleToggleRecording}
                onStopRecording={handleStopRecording}
              />
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

