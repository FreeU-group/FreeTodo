"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Mic, 
  Hexagon,
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
  onStopRecording?: (e?: React.MouseEvent) => void;
}> = ({ onToggleRecording, onStopRecording }) => {
  const { isRecording } = useAppStore();
  const recordingStatus = useAppStore(state => state.processStatus.recording);
  const isPaused = recordingStatus === 'paused';
  
  return (
    <motion.div 
      variants={fadeVariants}
      initial="initial" animate="animate" exit="exit"
      className="w-full h-full flex items-center justify-between px-5 relative group"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} // 录音按钮区域不允许拖拽
    >
      {/* Left: Recording Status - 可点击区域（参考 island，只在左侧区域可点击） */}
      <div 
        className="flex items-center gap-2 group/rec cursor-pointer flex-shrink-0"
        onClick={(e) => {
          // 防止双击触发两次录音或向上冒泡
          if (e.detail > 1) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          e.stopPropagation();
          // 单击即可开始/暂停/恢复录音（参考 island 的简洁交互）
          onToggleRecording?.();
        }}
        onDoubleClick={(e) => {
          // 阻止双击冒泡到容器触发全屏
          e.preventDefault();
          e.stopPropagation();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onStopRecording?.(e);
        }}
        title={isRecording 
          ? (isPaused ? '点击恢复录音 | 右键停止' : '点击暂停录音 | 右键停止')
          : '点击开始录音'}
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
              ? (isPaused ? 'PAUSED' : 'REC') 
              : 'Click to Record'}
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

      {/* Right: Logo - 仅展示（参考 island，不处理点击） */}
      <div className="flex items-center justify-center text-white/80 flex-shrink-0 pointer-events-none">
        <Hexagon size={18} strokeWidth={2.5} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]" />
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