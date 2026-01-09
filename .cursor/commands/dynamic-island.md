# 灵动岛实现指南（Dynamic Island）

## 概述

灵动岛是一个悬浮 UI 组件，为 Electron 应用提供三种交互模式：
- **FLOAT 模式**：小型悬浮岛，可拖拽，悬停时展开
- **PANEL 模式**：可调整大小的面板窗口，显示单个功能
- **FULLSCREEN 模式**：全屏工作台，显示完整的应用功能

---

## 🚀 实现原理与技术栈

### 核心技术

- **React 19 + TypeScript**：组件化开发，类型安全
- **Framer Motion**：流畅的动画和布局过渡
- **Electron IPC**：主进程与渲染进程通信
- **CSS 注入**：动态修改窗口样式（透明度、圆角等）
- **窗口管理 API**：`setIgnoreMouseEvents`、`setAlwaysOnTop`、`setBounds` 等

### Electron IPC 通信机制

**IPC（Inter-Process Communication）** 是 Electron 中主进程（Main Process）和渲染进程（Renderer Process）之间通信的桥梁。

**为什么需要 IPC？**
- Electron 应用分为主进程和渲染进程，主进程负责窗口管理、系统 API 调用等，渲染进程负责 UI 渲染
- 出于安全考虑，渲染进程无法直接调用 Node.js API 和 Electron 窗口 API
- 需要通过 IPC 让渲染进程请求主进程执行窗口操作

**在灵动岛中的使用**：
- **渲染进程 → 主进程**：通过 `ipcRenderer.send()` 或 `ipcRenderer.invoke()` 发送请求
  - `collapse-window`：请求折叠窗口到 FLOAT 模式
  - `expand-window`：请求展开窗口到 PANEL 模式
  - `expand-window-full`：请求展开窗口到 FULLSCREEN 模式
  - `set-ignore-mouse-events`：请求设置点击穿透
  - `move-window`：请求移动窗口位置
- **主进程处理**：在 `electron/ipc-handlers.ts` 中注册处理器，执行实际的窗口操作
  - 调用 `BrowserWindow` API 修改窗口属性
  - 通过 `webContents.insertCSS()` 注入样式
  - 执行窗口动画过渡

**代码示例**：
```typescript
// 渲染进程（前端）
const api = getElectronAPI();
await api.electronAPI?.collapseWindow?.();

// 主进程（electron/ipc-handlers.ts）
ipcMain.handle("collapse-window", async () => {
  const win = windowManager.getWindow();
  // 执行窗口操作...
});
```

### 实现总结

灵动岛的实现通过以下技术组合完成：

1. **通过 Electron IPC 通信**，让前端渲染进程请求主进程执行窗口操作（调整大小、位置、属性等）
2. **通过 CSS 注入**，动态修改窗口样式（透明度、圆角、裁剪路径），实现视觉效果的平滑过渡
3. **通过窗口动画**，使用缓动函数和定时器，以约 60fps 的频率更新窗口边界，实现平滑的尺寸变化
4. **通过点击穿透管理**，在 FLOAT 模式下启用 `setIgnoreMouseEvents`，让窗口不阻挡桌面操作，同时通过 `forward: true` 保持鼠标事件检测
5. **通过 Framer Motion**，在前端实现组件布局的平滑动画，配合窗口动画实现整体过渡效果
6. **通过状态管理**，使用 Zustand store 管理模式状态，使用 React Context 在组件间共享功能状态
7. **通过自定义 Hooks**，将拖拽、悬停检测、布局计算等逻辑封装，保持代码模块化和可维护性

这种架构实现了窗口级别的动画（主进程控制）和组件级别的动画（渲染进程控制）的协同工作，创造出流畅的模式切换体验。

### 关键技术点

#### 1. 点击穿透（Click-Through）

**实现方式**：
- 使用 Electron 的 `setIgnoreMouseEvents(true, { forward: true })` API
- `forward: true` 允许鼠标移动事件仍能到达浏览器，用于检测悬停
- FLOAT 模式默认启用，悬停时禁用；PANEL/FULLSCREEN 模式禁用

**代码位置**：`hooks/useDynamicIslandClickThrough.ts`

```typescript
// 启用点击穿透
ipcRenderer.send("set-ignore-mouse-events", true, { forward: true });

// 禁用点击穿透
ipcRenderer.send("set-ignore-mouse-events", false);
```

#### 2. 窗口动画过渡

**实现方式**：
- 使用 `easeOutCubic` 缓动函数实现平滑过渡
- 通过 `setBounds()` 以约 60fps 的频率更新窗口边界
- 动画期间通过 CSS 注入控制透明度，避免内容闪现

**代码位置**：`electron/ipc-handlers.ts` 的 `animateWindowBounds` 函数

```typescript
// 缓动函数：easeOutCubic
function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

// 动画循环：约 60fps
setTimeout(animate, 16);
```

#### 3. 拖拽实现

**实现方式**：
- 完全手动实现，不依赖 Electron 的 `setMovable`
- 监听 `mousedown`、`mousemove`、`mouseup` 事件
- 实时更新 DOM 位置，拖拽结束后通过 Framer Motion 平滑移动到吸附位置
- 支持边缘吸附（50px 阈值）

**代码位置**：`hooks/useDynamicIslandDrag.ts`

**关键逻辑**：
1. `mousedown`：记录起始位置，禁用点击穿透
2. `mousemove`：计算新位置，限制在屏幕范围内
3. `mouseup`：计算吸附位置，通过 `setPosition` 触发 Framer Motion 动画

#### 4. 悬停检测

**实现方式**：
- 全局 `mousemove` 事件监听
- 使用 `getBoundingClientRect()` 检测鼠标是否在区域内
- 使用 `requestAnimationFrame` 节流，优化性能
- 10px 容差避免边缘抖动

**代码位置**：`hooks/useDynamicIslandHover.ts`

```typescript
// 节流处理
let rafId: number | null = null;
const throttledHandleMouseMove = (e: MouseEvent) => {
  if (rafId) return;
  rafId = requestAnimationFrame(() => {
    handleGlobalMouseMove(e);
    rafId = null;
  });
};
```

#### 5. 透明度恢复

**问题**：从 PANEL/FULLSCREEN 折叠到 FLOAT 时，窗口可能消失

**解决方案**：
- Electron 主进程在折叠时注入 `opacity: 0` CSS
- 前端在模式切换到 FLOAT 时，通过 `<style>` 标签注入 `opacity: 1 !important` 覆盖
- 使用 `useEffect` 监听模式变化，自动恢复透明度

**代码位置**：`DynamicIsland.tsx` 的 `useEffect` 钩子

```typescript
useEffect(() => {
  if (mode === IslandMode.FLOAT) {
    const style = document.createElement("style");
    style.id = "restore-opacity-float-mode";
    style.textContent = `
      html, body, #__next, #__next > div {
        opacity: 1 !important;
      }
    `;
    document.head.appendChild(style);
  }
}, [mode]);
```

#### 6. 窗口圆角实现

**实现方式**：
- 使用 `clip-path: inset(0 round 16px)` 实现完美圆角
- 通过 Electron 的 `insertCSS` API 注入样式
- 同时设置 `border-radius` 和 `overflow: hidden` 作为后备

**代码位置**：`electron/ipc-handlers.ts` 的 `expand-window` 处理器

```typescript
win.webContents.insertCSS(`
  html, body, #__next {
    border-radius: 16px !important;
    clip-path: inset(0 round 16px) !important;
  }
`);
```

#### 7. 布局计算

**实现方式**：
- 根据模式和状态（悬停、位置）计算布局属性
- FLOAT 模式：收起 36x36px，展开 135x48px
- PANEL 模式：100% x 100%，16px 圆角
- FULLSCREEN 模式：100vw x 100vh

**代码位置**：`hooks/useDynamicIslandLayout.ts`

#### 8. Framer Motion 动画

**实现方式**：
- 使用 `motion.div` 的 `layout` 属性实现自动布局动画
- 弹簧物理效果：`stiffness: 350, damping: 30, mass: 0.8`
- 拖拽结束后，通过更新 `position` 状态触发平滑移动

**代码示例**：
```typescript
<motion.div
  layout
  animate={layoutState}
  transition={{
    type: "spring",
    stiffness: 350,
    damping: 30,
    mass: 0.8,
  }}
/>
```

### 实现流程

#### FLOAT 模式初始化
1. 窗口创建时设置 `alwaysOnTop: true`、`resizable: false`、`movable: false`
2. 启用点击穿透：`setIgnoreMouseEvents(true, { forward: true })`
3. 设置高 z-index（999999）确保置顶
4. 监听全局鼠标移动，检测悬停

#### 模式切换流程
1. **FLOAT → PANEL**：
   - 调用 `expandWindow()` IPC
   - 主进程设置窗口可调整大小和可移动
   - 动画过渡到面板尺寸（500x80%屏幕高度）
   - 注入圆角 CSS
   - 禁用点击穿透
   - 前端切换模式状态

2. **PANEL → FLOAT**：
   - 调用 `collapseWindow()` IPC
   - 主进程注入 `opacity: 0` CSS
   - 动画过渡到原始边界
   - 启用点击穿透
   - 前端注入 `opacity: 1 !important` 恢复可见性
   - 前端切换模式状态

3. **PANEL → FULLSCREEN**：
   - 调用 `expandWindowFull()` IPC
   - 主进程最大化窗口
   - 设置 `resizable: false`、`movable: false`
   - 禁用点击穿透
   - 前端切换模式状态

---

## 🏗️ 项目架构

### 目录结构

```
components/dynamic-island/
├── DynamicIsland.tsx              # 主组件（382 行）
├── DynamicIslandProvider.tsx       # Provider 组件，用于检测 Electron 环境
├── PanelFeatureContext.tsx         # Context，用于在 Panel 模式中共享当前功能
├── PanelTitleBar.tsx               # Panel 模式标题栏组件
├── PanelContent.tsx                # Panel 模式内容区域，包含底部 Dock
├── PanelSelectorMenu.tsx           # 右键菜单，用于功能选择
├── FloatContent.tsx                # FLOAT 模式内容（收起/展开状态）
├── FullscreenControlBar.tsx        # FULLSCREEN 模式顶部控制栏
├── ContextMenu.tsx                 # FLOAT 模式右键上下文菜单
├── ResizeHandle.tsx                # PANEL 模式自定义缩放把手
├── electron-api.ts                 # Electron API 封装
├── ElectronTransparentScript.tsx   # 透明窗口支持脚本
├── TransparentBody.tsx             # 透明 body 包装器
├── types.ts                         # 类型定义（IslandMode 枚举）
├── index.ts                         # 公共导出
└── hooks/                           # 自定义 Hooks
    ├── useDynamicIslandClickThrough.ts  # 点击穿透管理
    ├── useDynamicIslandDrag.ts          # 拖拽功能
    ├── useDynamicIslandHover.ts         # 悬停状态管理
    └── useDynamicIslandLayout.ts        # 布局计算
```

### 组件层次结构

```
DynamicIslandProvider
  └── DynamicIsland (mode: FLOAT | PANEL | FULLSCREEN)
      ├── FLOAT 模式:
      │   ├── FloatContent (收起/展开)
      │   └── ContextMenu (右键菜单)
      ├── PANEL 模式:
      │   ├── PanelFeatureProvider
      │   │   ├── PanelTitleBar
      │   │   └── PanelContent
      │   │       └── PanelSelectorMenu (右键菜单)
      │   └── ResizeHandle (8 个缩放把手)
      └── FULLSCREEN 模式:
          └── FullscreenControlBar
```

---

## 🎨 核心组件

### DynamicIsland.tsx

**用途**：主组件，协调所有三种模式。

**主要职责**：
- 模式切换逻辑（FLOAT ↔ PANEL ↔ FULLSCREEN）
- Electron API 集成（窗口缩放、折叠、展开）
- 模式转换后恢复透明度
- 键盘快捷键（1、4、5、Escape）
- 拖拽、悬停和上下文菜单的状态管理

**关键特性**：
- 使用 `suppressHydrationWarning` 防止水合错误
- 高 z-index（999999）确保始终置顶
- 切换到 FLOAT 模式时自动恢复透明度
- FLOAT 模式的点击穿透管理

### PanelFeatureContext.tsx

**用途**：Context，用于在 PanelTitleBar 和 PanelContent 之间共享当前功能状态。

**使用方式**：
```typescript
<PanelFeatureProvider>
  <PanelTitleBar />
  <PanelContent />
</PanelFeatureProvider>
```

### PanelTitleBar.tsx

**用途**：PANEL 模式的标题栏，显示当前功能名称和控制按钮。

**特性**：
- 显示当前功能图标和名称
- 全屏和折叠按钮
- 支持 WebkitAppRegion 拖拽
- 与 PanelFeatureContext 同步

### PanelContent.tsx

**用途**：PANEL 模式的内容区域，包含底部 Dock 用于功能切换。

**特性**：
- 底部 Dock 显示当前功能按钮
- 右键菜单用于功能选择
- 通过 `getAvailableFeatures()` 与设置面板开关同步
- 始终包含 "settings" 功能
- 鼠标移动时自动显示/隐藏 Dock

### FloatContent.tsx

**用途**：FLOAT 模式显示的内容（收起/展开状态）。

**状态**：
- **收起**：小图标（36x36px）
- **展开**：完整内容带按钮（135x48px）

### FullscreenControlBar.tsx

**用途**：FULLSCREEN 模式的顶部控制栏。

**特性**：
- 退出全屏按钮
- 折叠到灵动岛按钮
- 固定窗口（不可拖拽、不可调整大小）

---

## 🔧 自定义 Hooks

### useDynamicIslandClickThrough

**用途**：管理透明窗口的点击穿透行为。

**行为**：
- FLOAT 模式：默认启用点击穿透，悬停时禁用
- PANEL 模式：禁用点击穿透
- FULLSCREEN 模式：禁用点击穿透

### useDynamicIslandDrag

**用途**：处理 FLOAT 模式的拖拽功能。

**特性**：
- 手动拖拽实现
- 吸附到边缘（上、下、左、右）
- 位置持久化
- 点击按钮时阻止拖拽

### useDynamicIslandHover

**用途**：管理 FLOAT 模式的悬停状态。

**特性**：
- 全局鼠标移动检测
- 悬停时展开，离开时收起
- 使用 requestAnimationFrame 节流
- 尊重拖拽状态

### useDynamicIslandLayout

**用途**：计算不同模式的布局状态。

**布局**：
- **FLOAT**：收起（36x36）或展开（135x48），定位在边缘
- **PANEL**：全窗口（100% x 100%），圆角（16px）
- **FULLSCREEN**：全视口（100vw x 100vh）

---

## ⚡ Electron 集成

### 窗口管理

**IPC 处理器**（位于 `electron/ipc-handlers.ts`）：
- `collapse-window`：折叠到 FLOAT 模式
  - 转换期间设置透明度为 0
  - 动画化窗口边界
  - 启用点击穿透
  - 设置始终置顶
- `expand-window`：展开到 PANEL 模式
  - 使窗口可调整大小和可移动
  - 设置窗口边界
  - 禁用点击穿透
- `expand-window-full`：展开到 FULLSCREEN 模式
  - 最大化窗口
  - 设置 resizable=false，movable=false
  - 禁用点击穿透

### 窗口属性

**FLOAT 模式**：
- `alwaysOnTop: true`
- `resizable: false`
- `movable: false`
- `ignoreMouseEvents: true`（forward: true）

**PANEL 模式**：
- `alwaysOnTop: true`
- `resizable: true`
- `movable: true`
- `ignoreMouseEvents: false`

**FULLSCREEN 模式**：
- `alwaysOnTop: true`
- `resizable: false`
- `movable: false`
- `ignoreMouseEvents: false`

---

## 📦 状态管理

### 模式状态

由 `lib/store/dynamic-island-store.ts` 管理：
- `mode: IslandMode` - 当前模式（FLOAT、PANEL、FULLSCREEN）
- `isEnabled: boolean` - 是否启用灵动岛
- `setMode(mode)` - 切换模式

### 功能状态（Panel 模式）

由 `PanelFeatureContext` 管理：
- `currentFeature: PanelFeature` - 当前显示的功能
- `setCurrentFeature(feature)` - 切换功能

### 设置同步

Panel 模式底部 Dock 通过以下方式与设置同步：
- `useUiStore().getAvailableFeatures()` - 获取已启用且未分配的功能
- `useUiStore().isFeatureEnabled(feature)` - 检查功能是否启用
- Settings 功能始终包含在可用功能列表中

---

## 🔄 模式转换

### FLOAT → PANEL

1. 用户点击展开按钮或按 "4" 键
2. 调用 `expandWindow()` IPC
3. 窗口展开到面板大小
4. 模式切换到 PANEL
5. PanelContent 渲染当前功能

### PANEL → FULLSCREEN

1. 用户点击全屏按钮
2. 调用 `expandWindowFull()` IPC
3. 窗口最大化
4. 模式切换到 FULLSCREEN
5. FullscreenControlBar 渲染

### PANEL → FLOAT

1. 用户点击折叠按钮
2. 调用 `collapseWindow()` IPC
3. 窗口透明度设置为 0
4. 窗口动画到原始边界
5. 通过 CSS 注入恢复透明度
6. 模式切换到 FLOAT
7. 启用点击穿透

### FULLSCREEN → PANEL

1. 用户点击退出全屏按钮
2. 调用 `expandWindow()` IPC
3. 窗口调整到面板大小
4. 模式切换到 PANEL

### FULLSCREEN → FLOAT

1. 用户点击折叠按钮或按 Escape 键
2. 调用 `collapseWindow()` IPC
3. 与 PANEL → FLOAT 相同

---

## ⌨️ 键盘快捷键

- **1**：折叠到 FLOAT 模式
- **4**：展开到 PANEL 模式
- **5**：展开到 FULLSCREEN 模式
- **Escape**：从 PANEL/FULLSCREEN 折叠到 FLOAT

---

## 🎨 样式

### Z-Index 层级

- FLOAT 模式容器：`z-index: 999999`
- PANEL 模式容器：`z-index: 30`
- FULLSCREEN 控制栏：`z-index: 100010+`
- 缩放把手：`z-index: 50`（PANEL 模式）
- 上下文菜单：`z-index: 100-101`

### 动画

- **布局转换**：Framer Motion 弹簧动画
- **悬停展开**：平滑的宽度/高度转换
- **模式切换**：带弹簧物理效果的布局动画
- **Dock 显示/隐藏**：带 translateY 的弹簧动画

---

## 🔨 常见模式

### 添加新功能到 Panel 模式

1. 在 `lib/config/panel-config.ts` 中将功能添加到 `ALL_PANEL_FEATURES`
2. 将功能图标添加到 `FEATURE_ICON_MAP`
3. 在翻译文件（`messages/*.json`）中添加功能标签
4. 在 `apps/{feature}/` 中创建功能面板组件
5. 在 `PanelContent.tsx` 的渲染逻辑中添加功能分支

### 修改模式行为

1. 更新 `hooks/` 目录中对应的 hook
2. 如需要模式特定逻辑，更新 `DynamicIsland.tsx`
3. 如窗口行为改变，更新 Electron IPC 处理器
4. 测试所有模式转换

### 调试模式问题

1. 在 `useDynamicIslandStore()` 中检查 `mode` 状态
2. 在浏览器控制台中验证 Electron API 调用
3. 在 Electron DevTools 中检查窗口属性
4. 在 DOM 中检查透明度样式
5. 通过 Electron API 验证点击穿透状态

---

## ✅ 最佳实践

1. **始终恢复透明度**：切换到 FLOAT 模式时
2. **使用 Context 共享状态**：在 PanelTitleBar 和 PanelContent 之间
3. **与设置同步**：使用 `getAvailableFeatures()` 获取功能列表
4. **处理水合错误**：在需要的地方使用 `suppressHydrationWarning`
5. **节流鼠标事件**：使用 `requestAnimationFrame` 提升性能
6. **阻止按钮拖拽**：通过检查 `target.closest('button')`
7. **使用高 z-index**：FLOAT 模式确保可见性
8. **延迟点击穿透**：模式转换后允许渲染完成

---

## 📏 文件大小管理

- **DynamicIsland.tsx**：382 行（在 500 行限制内）
- 组件已拆分为独立文件：
  - `PanelFeatureContext.tsx`：Context 和 Provider
  - `PanelTitleBar.tsx`：标题栏组件
  - 其他组件已分离

---

## 📚 相关文件

- `lib/store/dynamic-island-store.ts`：模式状态管理
- `lib/store/ui-store/store.ts`：功能启用/禁用状态
- `lib/config/panel-config.ts`：功能定义和图标
- `electron/ipc-handlers.ts`：窗口管理 IPC 处理器
- `electron/window-manager.ts`：窗口创建和配置

---

## 🔍 调试和排查

### 常见问题

1. **灵动岛消失**：检查透明度样式，确保切换到 FLOAT 模式时恢复 `opacity: 1`
2. **无法拖拽**：检查 `ignoreMouseEvents` 状态和 `WebkitAppRegion` 设置
3. **模式切换失败**：检查 Electron IPC 处理器是否正确注册
4. **功能不同步**：检查 `getAvailableFeatures()` 和 `isFeatureEnabled()` 的实现

### 调试技巧

- 在浏览器控制台查看 Electron API 调用日志
- 使用 React DevTools 检查组件状态
- 在 Electron DevTools 中检查窗口属性
- 检查 DOM 中的样式注入（opacity、z-index 等）

---

## ⚠️ 当前问题与改进方向

### 模式切换存在的问题

目前模式切换存在以下问题，影响用户体验：

#### 1. 瞬变问题
- **现象**：模式切换时窗口尺寸变化过于突然，缺乏平滑过渡
- **影响**：视觉上不够自然，用户体验不佳

#### 2. 闪现其他尺寸的页面
- **现象**：在模式切换过程中，会短暂显示其他尺寸的页面内容
- **影响**：特别是从 PANEL 模式切换到 FLOAT 模式时，会先闪现全屏画面，然后才缩小到 FLOAT 尺寸
- **原因分析**：
  - 窗口尺寸变化和内容渲染不同步
  - CSS 注入时机不当，导致在窗口尺寸变化过程中内容可见
  - 前端模式状态切换时机与窗口动画不匹配

#### 3. 不自然的过渡
- **现象**：窗口从一种尺寸直接跳到另一种尺寸，而不是平滑过渡
- **影响**：缺乏连贯性，感觉不和谐

### 改进方向

接下来需要实现**模式切换的自然过渡**，主要改进方向：

1. **同步窗口动画与内容渲染**
   - 在窗口尺寸变化前，先隐藏或透明化内容
   - 确保窗口动画完成后再显示新尺寸的内容
   - 避免在动画过程中显示中间状态的内容

2. **优化 CSS 注入时机**
   - 在窗口动画开始前注入 `opacity: 0`，确保内容不可见
   - 在窗口动画完成后，再恢复内容可见性
   - 避免在窗口尺寸变化过程中内容闪现

3. **协调前端状态切换与窗口动画**
   - 前端模式状态切换应该在窗口动画开始前完成
   - 或者延迟到窗口动画完成后，确保视觉一致性
   - 使用 Promise 或回调确保时序正确

4. **改进动画实现**
   - 确保窗口边界动画平滑，无跳跃
   - 前端组件布局动画与窗口动画同步
   - 使用更合适的缓动函数，让过渡更自然

5. **处理 PANEL → FLOAT 的特殊情况**
   - 这是最明显的问题场景，需要特别处理
   - 在折叠动画开始前，确保内容已透明
   - 避免在窗口缩小过程中显示全屏内容
   - 可以考虑使用截图或遮罩层，在动画期间显示当前窗口的静态图像

### 技术实现要点

- **时序控制**：使用 `async/await` 确保操作顺序
- **状态同步**：窗口状态与前端状态保持一致
- **视觉连续性**：使用遮罩、截图或预渲染保持视觉连贯
- **性能优化**：避免不必要的重渲染和布局计算
