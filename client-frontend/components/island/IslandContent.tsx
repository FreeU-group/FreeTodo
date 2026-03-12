"use client";

import { motion, type Variants } from "framer-motion";
import {
  Camera,
  CheckCircle2,
  Hexagon,
  MessageCircle,
  Mic,
} from "lucide-react";
import Image from "next/image";
import type React from "react";
import { IslandMode } from "@/lib/island/types";

const fadeVariants: Variants = {
  initial: { opacity: 0, filter: "blur(8px)", scale: 0.98 },
  animate: {
    opacity: 1,
    filter: "blur(0px)",
    scale: 1,
    transition: { duration: 0.4, ease: "easeOut", delay: 0.1 },
  },
  exit: { opacity: 0, filter: "blur(8px)", scale: 1.05, transition: { duration: 0.2 } },
};

// 图标按钮组件 - 胶囊设计（无独立背景）
interface IconButtonProps {
  icon: React.ReactNode;
  onClick?: () => void;
  title?: string;
  color?: string;
  hoverBgColor?: string;
}

const IconButton: React.FC<IconButtonProps> = ({ icon, onClick, title, color, hoverBgColor }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    className={`w-8 h-8 flex items-center justify-center rounded-full
               transition-all duration-200 ease-out
               hover:scale-110 active:scale-95
               ${hoverBgColor || 'hover:bg-accent/30'}
               ${color || 'text-muted-foreground hover:text-foreground'}`}
    style={{
      // @ts-expect-error - WebkitAppRegion is valid in Electron
      WebkitAppRegion: "no-drag",
    }}
  >
    {icon}
  </button>
);

interface FloatContentProps {
  onModeChange?: (mode: IslandMode) => void;
}

// --- 1. FLOAT STATE: 三个功能图标 - 录音、截图、全屏 ---
// 紧凑胶囊设计：完美的圆角胶囊，图标靠近边缘，黄金比例布局
export const FloatContent: React.FC<FloatContentProps> = ({ onModeChange }) => (
  <motion.div
    variants={fadeVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    className="w-full h-full flex items-center justify-center relative"
  >
    {/* 胶囊容器 - 统一背景，完美圆角，填满整个窗口 */}
    <div className="w-full h-full rounded-full bg-card/95 backdrop-blur-md
                    border-2 border-border/60 shadow-xl
                    flex items-center justify-between px-5">
      {/* 录音按钮 - 红色 */}
      <IconButton
        icon={<Mic size={16} strokeWidth={2.5} />}
        title="开始录音"
        color="text-red-500 hover:text-red-400"
        hoverBgColor="hover:bg-red-500/10"
        onClick={() => {
          // TODO: 触发录音功能，可能会切换到形态2
          console.log("Start recording");
        }}
      />

      {/* 截图按钮 - 绿色 */}
      <IconButton
        icon={<Camera size={16} strokeWidth={2.5} />}
        title="截图"
        color="text-green-500 hover:text-green-400"
        hoverBgColor="hover:bg-green-500/10"
        onClick={() => {
          // TODO: 触发截图功能，可能会切换到形态2
          console.log("Take screenshot");
        }}
      />

      {/* 全屏按钮 - 蓝色，点击进入形态3 */}
      <IconButton
        icon={<Hexagon size={16} strokeWidth={2.5} />}
        title="展开"
        color="text-primary hover:text-primary/80"
        hoverBgColor="hover:bg-primary/10"
        onClick={() => {
          // 切换到侧边栏模式（形态3）
          onModeChange?.(IslandMode.SIDEBAR);
        }}
      />
    </div>
  </motion.div>
);

// --- 2. POPUP STATE: FreeTodo 风格的通知弹窗 ---
interface PopupContentProps {
  todos: { id: number; name: string }[];
  onOpenSidebar?: () => void;
}

export const PopupContent: React.FC<PopupContentProps> = ({ todos, onOpenSidebar }) => {
  const todoCount = todos.length;

  return (
  <motion.div
    variants={fadeVariants}
    initial="initial"
    animate="animate"
    exit="exit"
    className="w-full h-full flex items-center justify-center relative"
  >
    {/* 弹窗容器 - 与 FloatContent 相同的背景样式 */}
    <div className="w-full h-full rounded-[32px] bg-card/95 backdrop-blur-md
                    border-2 border-border/60 shadow-xl
                    p-4 flex items-center gap-4 relative overflow-hidden">
      {/* Background Accent */}
      <div className="absolute -left-4 top-0 w-24 h-full bg-linear-to-r from-primary/10 to-transparent blur-lg" />

      {/* Logo */}
      <div className="relative shrink-0 z-10">
        <div className="w-14 h-14 flex items-center justify-center">
          <Image
            src="/hi_dog2.png"
            alt="Free Todo Logo"
            width={56}
            height={56}
            className="object-contain"
          />
        </div>
        <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-emerald-500 border-2 border-card/95 rounded-full z-10 flex items-center justify-center">
          <CheckCircle2 size={10} className="text-white" />
        </div>
      </div>

      {/* Message Content */}
      <div className="flex flex-col flex-1 min-w-0 justify-center z-10">
        <div className="flex items-center justify-between mb-1">
          <span className="text-base font-semibold text-foreground tracking-tight">
            待办提醒
          </span>
          <span className="text-[10px] text-muted-foreground font-medium">刚刚</span>
        </div>
        <p className="text-sm text-muted-foreground leading-snug line-clamp-2">
          {todoCount > 0
            ? `已识别出 ${todoCount} 条待办，点击查看详情`
            : "已识别出新的待办，点击查看详情"}
        </p>
        {todoCount > 0 && (
          <div className="mt-1.5 max-h-16 overflow-hidden">
            <div className="flex flex-wrap gap-1.5">
              {todos.map((todo) => (
                <span
                  key={todo.id}
                  className="px-2 py-0.5 rounded-full bg-accent/70 border border-border/60 text-[11px] text-foreground/90 max-w-[140px] truncate"
                  title={todo.name}
                >
                  {todo.name || "未命名待办"}
                </span>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 mt-2.5">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent border border-border hover:bg-accent/80 transition-colors cursor-pointer"
          >
            <MessageCircle size={12} className="text-primary" />
            <span className="text-[11px] text-muted-foreground font-medium">查看详情</span>
          </button>
        </div>
      </div>
    </div>
  </motion.div>
  );
};
