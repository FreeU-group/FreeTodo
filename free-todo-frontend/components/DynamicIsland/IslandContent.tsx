"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Mic, 
  MicOff,
  MoreHorizontal,
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
      className="w-full h-full flex items-center justify-between px-5 relative cursor-pointer group"
      onClick={onToggleRecording}
      onContextMenu={(e) => {
        e.preventDefault();
        onStopRecording?.(e);
      }}
      title={isRecording 
        ? (isPaused ? '点击恢复录音 | 右键停止' : '点击暂停录音 | 右键停止')
        : '点击开始录音 | 按1-4切换模式'}
    >
      {/* Left: Recording Status */}
      <div className="flex items-center gap-2 group/rec">
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

      {/* Divider */}
      <div className="w-[1px] h-3 bg-white/10"></div>

      {/* Center: Voice Recording Waveform (only when recording) */}
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

      {/* Divider */}
      <div className="w-[1px] h-3 bg-white/10"></div>

      {/* Right: Logo */}
      <div className="flex items-center justify-center text-white/80">
        <Hexagon size={18} strokeWidth={2.5} className="text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.4)]" />
      </div>
    </motion.div>
  );
};

// --- 2. POPUP STATE: 录音状态显示 ---
export const PopupContent: React.FC<{ 
  onToggleRecording?: () => void;
  onStopRecording?: (e?: React.MouseEvent) => void;
}> = ({ onToggleRecording, onStopRecording }) => {
  const { isRecording, recordingStartTime } = useAppStore();
  const recordingStatus = useAppStore(state => state.processStatus.recording);
  const isPaused = recordingStatus === 'paused';
  
  const formatDuration = () => {
    if (!recordingStartTime) return '00:00';
    const diff = Date.now() - recordingStartTime.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <motion.div 
      variants={fadeVariants}
      initial="initial" animate="animate" exit="exit"
      className="w-full h-full p-5 flex items-center gap-4 relative overflow-hidden font-lexend"
    >
      <div className="flex items-center gap-3 flex-1">
        <div className="relative shrink-0">
          {isRecording ? (
            <>
              <motion.div 
                className="absolute w-full h-full bg-red-500/30 rounded-full"
                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
              />
              <Mic size={24} className="text-red-500 z-10 relative" />
            </>
          ) : (
            <MicOff size={24} className="text-white/60" />
          )}
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-base font-semibold text-white tracking-wide">
            {isRecording 
              ? (isPaused ? 'Recording Paused' : 'Recording')
              : 'Ready to Record'}
          </span>
          {isRecording && (
            <span className="text-sm text-white/60 font-mono">
              {formatDuration()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onToggleRecording && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleRecording();
              }}
              className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-sm text-white"
            >
              {isRecording 
                ? (isPaused ? 'Resume' : 'Pause')
                : 'Start'}
            </button>
          )}
          {onStopRecording && isRecording && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStopRecording(e);
              }}
              className="px-4 py-2 rounded-full bg-red-500/20 hover:bg-red-500/30 transition-colors text-sm text-red-400"
            >
              Stop
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
};

// --- 3. SIDEBAR STATE: 录音控制面板 ---
export const SidebarContent: React.FC<{ 
  onToggleRecording?: () => void;
  onStopRecording?: (e?: React.MouseEvent) => void;
  onExpand?: () => void;
}> = ({ 
  onToggleRecording,
  onStopRecording,
  onExpand 
}) => {
  const { isRecording, recordingStartTime, transcripts } = useAppStore();
  const recordingStatus = useAppStore(state => state.processStatus.recording);
  const isPaused = recordingStatus === 'paused';
  
  const formatDuration = () => {
    if (!recordingStartTime) return '00:00';
    const diff = Date.now() - recordingStartTime.getTime();
    const minutes = Math.floor(diff / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };
  
  return (
    <motion.div 
      variants={fadeVariants}
      initial="initial" animate="animate" exit="exit"
      className="w-full h-full flex flex-col p-6 pt-8 relative"
    >
      <div className="flex items-center justify-between mb-8 shrink-0">
        <div className="flex flex-col">
          <h2 className="text-3xl font-light font-lexend text-white tracking-tight">Voice Module</h2>
          <span className="text-xs text-white/40 uppercase tracking-widest font-bold mt-1 font-lexend">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric' })}
          </span>
        </div>
        <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors cursor-pointer">
          <MoreHorizontal size={20} className="text-white/60" />
        </div>
      </div>

      {/* Recording Status Card */}
      <div className="w-full p-5 rounded-[28px] bg-white/[0.03] border border-white/5 hover:bg-white/[0.06] transition-colors mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {isRecording ? (
                <>
                  <motion.div 
                    className="w-2 h-2 rounded-full bg-red-500"
                    animate={isPaused ? {} : { opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/70 font-lexend">
                    {isPaused ? 'Paused' : 'Recording'}
                  </span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-white/30"></div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-white/50 font-lexend">Idle</span>
                </>
              )}
            </div>
            {isRecording && (
              <span className="text-xs text-white/30 font-mono">{formatDuration()}</span>
            )}
          </div>
        
        <div className="flex flex-col gap-2">
          {onToggleRecording && (
            <button
              onClick={onToggleRecording}
              className={`w-full py-3 rounded-[20px] font-medium transition-colors ${
                isRecording 
                  ? (isPaused 
                    ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400'
                    : 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400')
                  : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              {isRecording 
                ? (isPaused ? 'Resume Recording' : 'Pause Recording')
                : 'Start Recording'}
            </button>
          )}
          {onStopRecording && isRecording && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStopRecording(e);
              }}
              className="w-full py-3 rounded-[20px] font-medium transition-colors bg-red-500/20 hover:bg-red-500/30 text-red-400"
            >
              Stop Recording
            </button>
          )}
        </div>
      </div>

      {/* Recent Transcripts */}
      <div className="flex-1 space-y-4 overflow-y-auto scrollbar-hide pb-4">
        <div className="text-xs text-white/40 uppercase tracking-wider mb-2">Recent Transcripts</div>
        {transcripts.length === 0 ? (
          <div className="text-sm text-white/30 text-center py-8">No transcripts yet</div>
        ) : (
          transcripts.slice(-5).map((transcript) => (
            <div key={transcript.id} className="w-full p-4 rounded-[20px] bg-white/[0.02] border border-white/5">
              <p className="text-sm text-white/80 line-clamp-2">
                {transcript.optimizedText || transcript.rawText}
              </p>
              <span className="text-xs text-white/30 mt-2 block">
                {transcript.timestamp ? new Date(transcript.timestamp).toLocaleTimeString() : ''}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Expand Button */}
      {onExpand && (
        <div className="mt-auto pt-4 shrink-0">
          <button
            onClick={onExpand}
            className="w-full h-14 bg-white/5 backdrop-blur-xl rounded-[24px] border border-white/10 flex items-center justify-center gap-2 hover:border-white/20 transition-colors text-white/80"
          >
            <span className="text-sm font-medium">Expand to Fullscreen</span>
          </button>
        </div>
      )}
    </motion.div>
  );
};
// --- 4. FULLSCREEN STATE: 显示整个应用内容 ---
// 注意：全屏模式下，这个组件不会被渲染
// 全屏时灵动岛容器会被隐藏，直接显示底层应用
export const FullScreenContent: React.FC = () => {
  return null; // 全屏模式下不渲染任何内容，让底层应用显示
};


