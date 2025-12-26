"use client";

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minimize2 } from 'lucide-react';
import { IslandMode } from './types';
import { 
  FloatContent, 
  PopupContent, 
  SidebarContent
} from './IslandContent';
import { HelpTooltip } from './HelpTooltip';
import { useAppStore } from '@/apps/voice-module/store/useAppStore';

interface DynamicIslandProps {
  mode: IslandMode;
  onModeChange?: (mode: IslandMode) => void;
  onClose?: () => void;
}

export const DynamicIsland: React.FC<DynamicIslandProps> = ({ 
  mode, 
  onModeChange,
  onClose 
}) => {
  const { isRecording } = useAppStore();
  const recordingStatus = useAppStore(state => state.processStatus.recording);
  const isPaused = recordingStatus === 'paused';
  
  // 处理录音控制 - 通过事件系统触发 VoiceModulePanel 的录音
  const handleToggleRecording = () => {
    let action: 'start' | 'stop' | 'pause' | 'resume';
    
    if (!isRecording) {
      action = 'start';
    } else if (isPaused) {
      action = 'resume';
    } else {
      action = 'pause'; // 第一次点击暂停，再次点击停止
    }
    
    // 发送自定义事件，让 VoiceModulePanel 监听并处理
    const event = new CustomEvent('dynamic-island-toggle-recording', {
      detail: { action }
    });
    window.dispatchEvent(event);
  };
  
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
  
  // LOGIC: Electron Click-Through Handling (仅在 Electron 环境中)
  useEffect(() => {
    // 检查是否在 Electron 环境中
    const isElectron = typeof window !== 'undefined' && (
      (window as any).electronAPI || 
      (window as any).require?.('electron')
    );
    
    if (!isElectron) {
      // 浏览器环境，不需要点击穿透
      return;
    }
    
    const setIgnoreMouse = (ignore: boolean) => {
      if (typeof window !== 'undefined' && (window as any).electronAPI) {
        try {
          (window as any).electronAPI?.setIgnoreMouseEvents?.(ignore, { forward: true });
        } catch (e) {
          console.error("Electron IPC failed", e);
        }
      } else if (typeof window !== 'undefined' && (window as any).require) {
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
    // 仅在 Electron 环境和非全屏模式下处理
    const isElectron = typeof window !== 'undefined' && (
      (window as any).electronAPI || 
      (window as any).require?.('electron')
    );
    
    if (mode !== IslandMode.FULLSCREEN && isElectron) {
      const setIgnoreMouse = (ignore: boolean) => {
        if (typeof window !== 'undefined' && (window as any).electronAPI) {
          try {
            (window as any).electronAPI?.setIgnoreMouseEvents?.(ignore);
          } catch (e) {
            console.error("Electron IPC failed", e);
          }
        } else if (typeof window !== 'undefined' && (window as any).require) {
          try {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('set-ignore-mouse-events', ignore);
          } catch (e) {
            console.error("Electron IPC failed", e);
          }
        }
      };
      setIgnoreMouse(false);
    }
  };

  const handleMouseLeave = () => {
    // 仅在 Electron 环境和非全屏模式下处理
    const isElectron = typeof window !== 'undefined' && (
      (window as any).electronAPI || 
      (window as any).require?.('electron')
    );
    
    if (mode !== IslandMode.FULLSCREEN && isElectron) {
      const setIgnoreMouse = (ignore: boolean) => {
        if (typeof window !== 'undefined' && (window as any).electronAPI) {
          try {
            (window as any).electronAPI?.setIgnoreMouseEvents?.(ignore, { forward: true });
          } catch (e) {
            console.error("Electron IPC failed", e);
          }
        } else if (typeof window !== 'undefined' && (window as any).require) {
          try {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.send('set-ignore-mouse-events', ignore, { forward: true });
          } catch (e) {
            console.error("Electron IPC failed", e);
          }
        }
      };
      setIgnoreMouse(true);
    }
  };

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch(e.key) {
        case '1': 
          onModeChange?.(IslandMode.FLOAT); 
          break;
        case '2': 
          onModeChange?.(IslandMode.POPUP); 
          break;
        case '3': 
          onModeChange?.(IslandMode.SIDEBAR); 
          break;
        case '4': 
          onModeChange?.(IslandMode.FULLSCREEN); 
          break;
        case 'Escape': 
          // Escape 键在所有模式下都可以使用
          if (mode === IslandMode.FULLSCREEN) {
            onModeChange?.(IslandMode.SIDEBAR);
          } else if (mode === IslandMode.SIDEBAR) {
            onModeChange?.(IslandMode.FLOAT);
          } else if (mode === IslandMode.POPUP) {
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

  const getLayoutState = (mode: IslandMode) => {
    switch (mode) {
      case IslandMode.FLOAT:
        return { 
          width: 180, 
          height: 48, 
          borderRadius: 24, 
          right: 32,  
          bottom: 32  
        }; 
      case IslandMode.POPUP:
        return { 
          width: 340, 
          height: 110, 
          borderRadius: 32,
          right: 32,
          bottom: 32
        }; 
      case IslandMode.SIDEBAR:
        return { 
          width: 400, 
          height: 'calc(100vh - 64px)', 
          borderRadius: 48,
          right: 32,
          bottom: 32
        };
      case IslandMode.FULLSCREEN:
        return { 
          width: '100vw',  
          height: '100vh', 
          borderRadius: 0,
          right: 0,        
          bottom: 0        
        };
      default:
        return { 
          width: 180, 
          height: 48, 
          borderRadius: 24,
          right: 32,
          bottom: 32
        };
    }
  };

  const layoutState = getLayoutState(mode);
  const isFullscreen = mode === IslandMode.FULLSCREEN;

  // 在浏览器环境中，不使用 pointer-events-none，确保可以交互
  const isElectron = typeof window !== 'undefined' && (
    (window as any).electronAPI || 
    (window as any).require?.('electron')
  );
  
  return (
    <>
      {/* 全屏模式：只显示关闭按钮，不遮挡页面 */}
      {isFullscreen ? (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <HelpTooltip />
          <motion.button
            initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.5, rotate: -45 }}
            className="absolute top-8 right-8 z-[10000] w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all backdrop-blur-md cursor-pointer border border-white/5 pointer-events-auto"
            onClick={(e) => {
              e.stopPropagation();
              onModeChange?.(IslandMode.SIDEBAR);
            }}
          >
            <Minimize2 size={18} />
          </motion.button>
        </div>
      ) : (
        <div className={`fixed inset-0 z-[9999] overflow-hidden ${isElectron ? 'pointer-events-none' : ''}`}>
          {/* 操作说明按钮 */}
          {mode !== IslandMode.FLOAT && <HelpTooltip />}
          
          <motion.div
            layout
            initial={false}
            animate={layoutState}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            transition={{
              type: "spring",
              stiffness: 340, 
              damping: 28,    
              mass: 0.6,      
              restDelta: 0.001
            }}
            className="absolute overflow-hidden pointer-events-auto origin-bottom-right bg-[#0a0a0a]"
            style={{
                boxShadow: '0px 20px 50px -10px rgba(0, 0, 0, 0.5), 0px 10px 20px -10px rgba(0,0,0,0.3)'
            }}
          >
            <div className="absolute inset-0 bg-[#080808]/90 backdrop-blur-[80px] transition-colors duration-700 ease-out"></div>
            <div className="absolute inset-0 opacity-[0.035] bg-[url('https://grainy-gradients.vercel.app/noise.svg')] pointer-events-none mix-blend-overlay"></div>
            <div className={`absolute inset-0 transition-opacity duration-1000 ${mode === IslandMode.FLOAT ? 'opacity-0' : 'opacity-100'}`}>
                <div className="absolute top-[-50%] left-[-20%] w-[100%] h-[100%] rounded-full bg-indigo-500/10 blur-[120px] mix-blend-screen"></div>
                <div className="absolute bottom-[-20%] right-[-20%] w-[80%] h-[80%] rounded-full bg-purple-500/10 blur-[120px] mix-blend-screen"></div>
            </div>

            <div className="absolute inset-0 rounded-[inherit] border border-white/10 pointer-events-none shadow-[inset_0_0_20px_rgba(255,255,255,0.03)] transition-opacity duration-500"></div>

            <AnimatePresence>
              {mode === IslandMode.SIDEBAR && (
                 <motion.button
                    initial={{ opacity: 0, scale: 0.5, rotate: -45 }}
                    animate={{ opacity: 1, scale: 1, rotate: 0 }}
                    exit={{ opacity: 0, scale: 0.5, rotate: -45 }}
                    className="absolute z-[60] top-6 right-6 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-all backdrop-blur-md cursor-pointer border border-white/5"
                    onClick={(e) => {
                      e.stopPropagation();
                      onClose?.();
                    }}
                 >
                    <X size={18} />
                 </motion.button>
              )}
            </AnimatePresence>

            <div className="absolute inset-0 w-full h-full text-white font-sans antialiased overflow-hidden">
              <AnimatePresence mode="wait">
                {mode === IslandMode.FLOAT && (
                  <motion.div key="float" className="absolute inset-0 w-full h-full">
                      <FloatContent 
                        onToggleRecording={handleToggleRecording}
                        onStopRecording={handleStopRecording}
                      />
                  </motion.div>
                )}
                {mode === IslandMode.POPUP && (
                  <motion.div key="popup" className="absolute inset-0 w-full h-full">
                      <PopupContent 
                        onToggleRecording={handleToggleRecording}
                        onStopRecording={handleStopRecording}
                      />
                  </motion.div>
                )}
                {mode === IslandMode.SIDEBAR && (
                  <motion.div key="sidebar" className="absolute inset-0 w-full h-full">
                      <SidebarContent 
                        onToggleRecording={handleToggleRecording}
                        onStopRecording={handleStopRecording}
                        onExpand={() => onModeChange?.(IslandMode.FULLSCREEN)}
                      />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

          </motion.div>
        </div>
      )}
    </>
  );
};

