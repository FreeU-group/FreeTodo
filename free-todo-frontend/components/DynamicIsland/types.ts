export enum IslandMode {
  FLOAT = 'FLOAT',       // 1. 常驻悬浮窗 (Orb/Core)
  POPUP = 'POPUP',       // 2. 简洁弹窗 (Notification/Light Interaction)
  SIDEBAR = 'SIDEBAR',   // 3. 详细侧边栏 (Chat Interface)
  FULLSCREEN = 'FULLSCREEN' // 4. 全屏工作台 (显示 VoiceModulePanel)
}

// We can simplify dimensions logic as we will rely more on CSS classes for this layout
export interface IslandDimensions {
  className: string;
}

