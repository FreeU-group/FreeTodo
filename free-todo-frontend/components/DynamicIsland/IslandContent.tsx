"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Mic, 
  Hexagon,
  Camera,
} from 'lucide-react';
import { useAppStore } from '@/apps/voice-module/store/useAppStore';

const fadeVariants = {
    initial: { opacity: 0, filter: 'blur(8px)', scale: 0.98 },
    animate: { 
      opacity: 1, 
      filter: 'blur(0px)', 
      scale: 1, 
      transition: { duration: 0.4, delay: 0.1 } 
    },
    exit: { 
      opacity: 0, 
      filter: 'blur(8px)', 
      scale: 1.05, 
      transition: { duration: 0.2 } 
    }
};

// --- 1. FLOAT STATE: 录音控制 + Logo ---
export const FloatContent: React.FC<{ 
  onToggleRecording?: () => void;
  onStopRecording?: () => void;
  onScreenshot?: () => void; // 切换截屏开关
  screenshotEnabled?: boolean; // 截屏开关状态
  isCollapsed?: boolean; // 是否收起状态
}> = ({ onToggleRecording, onStopRecording, onScreenshot, screenshotEnabled = false, isCollapsed = false }) => {
  const { isRecording } = useAppStore();
  const recordingStatus = useAppStore(state => state.processStatus.recording);
  const isPaused = recordingStatus === 'paused';
  
  // 收起状态：只显示六边形图标
  if (isCollapsed) {
    return (
      <motion.div 
        variants={fadeVariants}
        initial="initial" animate="animate" exit="exit"
        className="w-full h-full flex items-center justify-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Hexagon size={20} strokeWidth={2.5} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]" />
      </motion.div>
    );
  }
  
  // 展开状态：显示完整内容
  return (
    <motion.div 
      variants={fadeVariants}
      initial="initial" animate="animate" exit="exit"
      className="w-full h-full flex items-center justify-between px-5 relative group"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} // 录音按钮区域不允许拖拽
    >
      {/* Left: Recording Status - 可点击区域 */}
      <div 
        className="flex items-center gap-2 group/rec cursor-pointer flex-shrink-0"
        onClick={(e) => {
          e.stopPropagation();
          // 单击开始/暂停/恢复录音
          onToggleRecording?.();
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          // 双击停止录音
          if (isRecording && onStopRecording) {
            onStopRecording();
          }
        }}
        title={isRecording 
          ? (isPaused ? '单击恢复录音 | 双击停止' : '单击暂停录音 | 双击停止')
          : '单击开始录音'}
      >
        <div className="relative flex items-center justify-center">
          {isRecording ? (
            <>
              <motion.div 
                className="absolute w-full h-full bg-red-500/30 rounded-full"
                animate={{ scale: [1, 1.8, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
              />
              <div className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.6)] z-10"></div>
            </>
          ) : (
            <Mic size={16} className="text-white/60" />
          )}
        </div>
        <div className="w-0 overflow-hidden group-hover/rec:w-auto transition-all duration-300">
          <span className="text-[10px] font-medium text-white/50 pl-1 whitespace-nowrap">
            {isRecording 
              ? (isPaused ? '已暂停' : '录音中') 
              : ''}
          </span>
        </div>
      </div>

      {/* Divider - 不可点击 */}
      <div className="w-[1px] h-3 bg-white/10 pointer-events-none flex-shrink-0"></div>

      {/* Center: Voice Recording Waveform (only when recording) - 不可点击 */}
      <div className="flex-1 flex items-center justify-center pointer-events-none">
        {isRecording ? (
          <div className="flex items-center gap-0.5 h-3">
            {[1, 0.6, 1, 0.5, 0.8].map((h, i) => (
              <motion.div 
                key={i}
                className="w-0.5 bg-orange-400 rounded-full"
                animate={{ height: [4, h * 12, 4] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
              />
            ))}
          </div>
        ) : (
          <div className="w-8 h-3"></div>
        )}
      </div>

      {/* Divider - 不可点击 */}
      <div className="w-[1px] h-3 bg-white/10 pointer-events-none flex-shrink-0"></div>

      {/* Right: Logo + 截屏开关按钮 - 统一使用六边形图标 */}
      <div className="flex items-center justify-center gap-2 text-white/80 flex-shrink-0">
        {/* 截屏开关按钮 - 单击切换截屏开关 */}
        <div 
          className="relative cursor-pointer hover:opacity-80 transition-opacity"
          onClick={(e) => {
            e.stopPropagation();
            onScreenshot?.();
          }}
          title={screenshotEnabled ? '截屏已开启，单击关闭' : '截屏已关闭，单击开启'}
        >
          <Camera size={12} className={screenshotEnabled ? 'text-green-400' : 'text-gray-500'} />
          {screenshotEnabled && (
            <div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          )}
        </div>
        <Hexagon size={18} strokeWidth={2.5} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)] pointer-events-none" />
      </div>
    </motion.div>
  );
};

// --- 2. FULLSCREEN STATE: 全屏模式下不渲染内容，让系统前端页面显示 ---
// 注意：全屏模式下，这个组件不会被渲染
// 全屏时灵动岛容器会被隐藏，直接显示底层应用
export const FullScreenContent: React.FC = () => {
  return null; // 全屏模式下不渲染任何内容，让底层应用显示
};