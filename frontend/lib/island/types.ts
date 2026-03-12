/**
 * Island 动态岛类型定义
 */

/**
 * 动态岛模式枚举
 */
export enum IslandMode {
  /** 悬浮小窗 - 始终可见的小药丸形状 (180×48px) */
  FLOAT = "FLOAT",
  /** 弹出通知 - 中等大小的通知卡片 (340×110px) */
  POPUP = "POPUP",
  /** 侧边栏 - 侧边面板 (400px 宽, ~500px 高) */
  SIDEBAR = "SIDEBAR",
  /** 全屏 - 全屏显示 */
  FULLSCREEN = "FULLSCREEN",
}

/**
 * 各模式对应的窗口尺寸配置
 */
export const ISLAND_SIZES: Record<IslandMode, { width: number; height: number }> = {
  [IslandMode.FLOAT]: { width: 200, height: 56 }, // 紧凑胶囊设计，黄金比例布局
  [IslandMode.POPUP]: { width: 380, height: 120 },
  [IslandMode.SIDEBAR]: { width: 420, height: 700 },
  [IslandMode.FULLSCREEN]: { width: 0, height: 0 }, // 全屏时使用屏幕尺寸
};

/**
 * SIDEBAR 模式各栏数的窗口尺寸配置
 */
export const SIDEBAR_COLUMN_SIZES: Record<1 | 2 | 3, { width: number; height: number }> = {
  1: { width: 420, height: 700 },   // 单栏（现有）
  2: { width: 800, height: 700 },   // 双栏
  3: { width: 1200, height: 700 },  // 三栏
};

/**
 * Island 窗口配置
 */
export const ISLAND_WINDOW_CONFIG = {
  /** 默认初始模式 */
  defaultMode: IslandMode.FLOAT,
  /** 距离屏幕右边缘的距离 */
  marginRight: 20,
  /** 距离屏幕顶部的距离 */
  marginTop: 20,
  /** 窗口背景色（透明） */
  backgroundColor: "#00000000",
};
