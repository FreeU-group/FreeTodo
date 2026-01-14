# LifeTrace / Free Todo Frontend 技术实现文档：Dynamic Island + Panel + Electron Window

> 目标读者：需要理解/维护「灵动岛（Dynamic Island）」与「Panel 模式」在 Electron 中的渲染架构、窗口行为、点击穿透、以及模式切换细节的开发者。
>
> 范围：`free-todo-frontend`（Next.js/React 渲染进程） + `free-todo-frontend/electron`（Electron 主进程）。

---

## 1. 需求与设计原则

### 1.1 核心需求

- **灵动岛（Dynamic Island）**：悬浮在屏幕之上，支持拖拽、悬停展开、右键菜单等交互。
- **左下角 N 徽章**（通知/全局入口）：与灵动岛一样，属于**全局常驻**组件。
- **Panel 模式**：右侧出现可拖动/可调整尺寸的面板；左侧留出透明区域用于全局悬浮层显示与点击透传。
- **Fullscreen 模式**：窗口最大化显示完整页面内容。
- **模式切换**：FLOAT ↔ PANEL ↔ FULLSCREEN 时，全局悬浮层（灵动岛 + N 徽章）必须保持“屏幕坐标意义上的稳定”，不应被 Panel 的布局或窗口尺寸变化“挤进 Panel 内”。

### 1.2 设计原则（非常关键）

- **“全局悬浮层”与“内容层（Panel/Fullscreen）”解耦**：
  - 全局悬浮层使用 `position: fixed` + 超高 `z-index`，并尽量避免被任何模式样式影响。
  - 内容层（PanelWindow/页面）可以在不同模式下切换布局与背景，但不能改变悬浮层的定位上下文。

- **Electron 窗口尺寸影响“绝对坐标系”**：
  - 在 Electron 里，所有 DOM 都在同一个 `BrowserWindow` 的坐标系中。
  - **如果把窗口宽度从“屏幕宽”变成“Panel 宽”（例如 ~500px）**，那么任何 `position: fixed` 的元素虽然仍是“fixed”，但它的可见区域与定位上下文仍然是这个变窄的窗口——视觉上就像“全局元素被挤进 Panel”。
  - 因此，Panel 模式需要一种“右侧内容 + 左侧透明空间”的窗口策略，或在 FULLSCREEN → PANEL 时避免把窗口缩到 Panel 宽。

### 1.3 相关代码文件结构总览

```text
free-todo-frontend/
├── app/
│   └── page.tsx                          # HomePage：统一管理模式、PanelWindow 状态、点击穿透调用入口
├── components/
│   ├── dynamic-island/                   # 灵动岛三种模式的前端实现
│   │   ├── DynamicIsland.tsx             # 主组件（协调 FLOAT / PANEL / FULLSCREEN）
│   │   ├── DynamicIslandProvider.tsx     # Provider，用于检测 Electron 环境
│   │   ├── PanelFeatureContext.tsx       # Panel 模式功能 Context
│   │   ├── PanelTitleBar.tsx             # Panel 模式标题栏
│   │   ├── PanelContent.tsx              # Panel 模式内容区域（含 BottomDock）
│   │   ├── PanelSelectorMenu.tsx         # Panel 模式右键菜单
│   │   ├── FloatContent.tsx              # FLOAT 模式内容
│   │   ├── FullscreenControlBar.tsx      # FULLSCREEN 模式顶部控制栏
│   │   ├── ContextMenu.tsx               # FLOAT 模式右键菜单
│   │   ├── ResizeHandle.tsx              # Panel 模式窗口边缘缩放把手
│   │   ├── electron-api.ts               # 渲染进程使用的 Electron API 封装
│   │   ├── ElectronTransparentScript.tsx # 透明窗口辅助脚本
│   │   ├── TransparentBody.tsx           # 透明 body 包装器
│   │   ├── types.ts                      # IslandMode 等类型定义
│   │   └── hooks/
│   │       ├── useDynamicIslandClickThrough.ts # 灵动岛自身点击穿透管理（渲染层）
│   │       ├── useDynamicIslandDrag.ts         # FLOAT 模式拖拽
│   │       ├── useDynamicIslandHover.ts        # FLOAT 模式悬停展开/收起
│   │       └── useDynamicIslandLayout.ts       # 三种模式下的布局计算
│   └── layout/                         # PanelWindow + 多 panel 布局
│       ├── PanelWindow.tsx             # Panel 模式右侧窗口容器（含左侧透明走廊）
│       ├── PanelRegion.tsx             # 可复用的 panel 区域（panel 栏 + BottomDock）
│       ├── PanelContainer.tsx          # 单个 panel 容器
│       ├── PanelContent.tsx            # PanelRegion 内部的业务内容渲染
│       ├── BottomDock.tsx              # Panel 底部 dock（功能切换）
│       ├── ResizeHandle.tsx            # panel 之间的垂直拖拽把手
│       └── AppHeader.tsx               # 顶部 header（包含模式切换按钮）
├── lib/
│   ├── hooks/
│   │   └── useElectronClickThrough.ts  # 统一调用 Electron setIgnoreMouseEvents 的 hook
│   └── store/
│       ├── dynamic-island-store.ts     # mode / isEnabled 等灵动岛全局状态
│       └── ui-store/                   # 面板开关、panel 宽度等 UI 状态
└── electron/
    ├── ipc-handlers.ts                 # 主进程 IPC 处理器（collapse/expand/expand-full + 动画）
    └── window-manager.ts               # BrowserWindow 创建与管理
```

---

## 2. 组件与分层架构（Renderer）

### 2.1 渲染层级（推荐心智模型）

在渲染进程里，我们把 UI 拆为两层：

1) **Global Overlay Layer（全局悬浮层）**
   - 灵动岛（`components/dynamic-island/DynamicIsland.tsx`）
   - N 徽章（通常来自通知系统/全局组件，原则上也应处于 overlay 语义中）
   - 特性：`position: fixed`、非常高的 `z-index`、可根据区域控制 `pointer-events`

2) **Content Layer（内容层）**
   - PanelWindow（`components/panel/PanelWindow.tsx`）右侧固定面板
   - Fullscreen 页面（`app/page.tsx` 中的 “shouldShowPage” 逻辑）
   - 特性：背景色/圆角/布局随模式变化；点击交互主要发生在此层

### 2.2 HomePage（应用模式的“总调度”）

文件：`app/page.tsx`

- **模式来源**：`useDynamicIslandStore()`（Zustand 全局状态）
  - `mode`：`FLOAT | PANEL | FULLSCREEN`
- **页面是否渲染**：
  - `shouldShowPage = !isElectron || mode === PANEL || mode === FULLSCREEN`
  - 即：在 Electron 且 FLOAT 时，内容页可以隐藏，只保留悬浮层语义。
- **PanelWindow 状态**：
  - `panelWindowWidth / panelWindowHeight / panelWindowPosition / isResizingPanel / isDraggingPanel` 等都在 `HomePage` 管理，传给 `PanelWindow`。
- **点击穿透总控**：
  - `useElectronClickThrough(...)` 统一根据模式控制 Electron 的 `setIgnoreMouseEvents` 与渲染层 CSS。

> 结论：`HomePage` 是“模式→窗口/交互策略”的统一入口，避免多个组件各自调用 IPC 造成冲突。

---

## 3. 灵动岛（Dynamic Island）的实现

文件：`components/dynamic-island/DynamicIsland.tsx`

### 3.1 固定为“全局悬浮层”的关键点

- **布局计算固定使用 FLOAT 模式逻辑**：
  - `const layoutMode = IslandMode.FLOAT;`
  - 即：即使外部 `mode` 是 PANEL/FULLSCREEN，也用 FLOAT 的定位策略（吸边、展开宽度、hover）来计算 `left/right/top/bottom`。
  - 目的：避免 Panel/Fullscreen 的布局逻辑改变灵动岛在屏幕上的稳定性。

- **容器样式强制固定**：
  - 通过 `useEffect` + `requestAnimationFrame` + `setTimeout` 反复确保父容器拥有：
    - `position: fixed`
    - `z-index: 1000002`（高于 PanelWindow 的 `1000001`）
    - `pointer-events: none`（容器本身不吃事件；内部可交互区域再控制 pointer-events）
    - `top/left/right/bottom = 0` 形成“全屏覆盖层”
    - `opacity: 1`、`visibility: visible`
  - 目的：防止模式切换时其它逻辑（尤其是 Panel/Fullscreen 的透明背景策略）意外改写 overlay 的定位/可见性。

### 3.2 拖拽与吸边（Drag + Snap）

- 相关 Hook：
  - `useDynamicIslandDrag`
  - `useDynamicIslandLayout`
  - `useDynamicIslandHover`
  - `useDynamicIslandClickThrough`

核心思路：
- 拖拽过程中更新 `position {x, y}`（屏幕坐标意义）
- `useDynamicIslandLayout` 根据 `position` 判断靠左/靠右并进行吸边：
  - 靠右时使用 `right: 7` 固定贴边
  - 靠左时 `left` 会 clamp 到 `[0, windowWidth - islandWidth]`，避免出界
- 这样可以保证窗口大小变化或模式切换时，灵动岛仍尽量保持靠边策略稳定。

---

## 4. Panel 模式的实现（PanelWindow + Resize/Drag）

文件：`components/panel/PanelWindow.tsx`

### 4.1 PanelWindow 的 DOM 与视觉结构

PanelWindow 在渲染上有两块：

- **左侧透明穿透区域（占位层）**
  - `div.fixed.inset-y-0.left-0`
  - 宽度：`calc(100vw - panelWidth - 32px)`
  - `pointerEvents: none`，仅用于视觉/布局占位，配合 Electron 的点击穿透实现“点到透明区域穿透到系统”。

- **右侧 Panel 窗体（真正可交互）**
  - `div[data-panel-window].fixed ...`
  - `right: panelWindowRight`，`top` 以 40px 起始并叠加拖动偏移
  - 高度：`panelWindowHeight > 0 ? panelWindowHeight + 48 : calc(100vh - 40px)`
    - 48px 对应 `AppHeader` 标题栏高度
  - `z-index`：
    - React style 里是 `999999`，但 ref 回调里强制设为 `1000001`
    - 留出 `1000002` 给灵动岛 overlay
  - ref 回调里用 `setProperty(..., 'important')` 强制：
    - `opacity/background/visibility/display/position/z-index`
  - 目的：Panel 模式下经常存在透明背景、opacity、CSS 注入等变化，PanelWindow 需要“保证自己始终不透明并可见”。

### 4.2 Panel 宽度/高度调整

- PanelWindow 四周有 resize handle（上/下/左/右），统一调用：
  - `onPanelResizeStart(e, side)`
- 具体“拖动→计算新尺寸→更新状态”的逻辑在 `HomePage` 搭配 hooks：
  - `usePanelResize`
  - `usePanelWindowResize`
  - `usePanelWindowDrag`
  - `usePanelWindowStyles`

目标：
- Renderer 内部更新 `panelWindowWidth/panelWindowHeight`（仅影响 PanelWindow DOM）
- Electron 主进程是否同步 resize `BrowserWindow`：取决于当前策略（见第 5 节）

---

## 5. Electron 窗口策略（Main Process）

文件：`electron/ipc-handlers.ts`

### 5.1 为什么“窗口尺寸”会影响灵动岛/徽章？

因为灵动岛和 N 徽章**本质上仍然是同一个 BrowserWindow 里的 DOM**。

- 当 FULLSCREEN（最大化）时：窗口坐标系 ≈ 屏幕，`position: fixed` 的 overlay 看起来“全屏悬浮”。
- 如果从 FULLSCREEN 切到 PANEL 时把窗口缩小为 ~500px：
  - overlay 的可见区域也被限制到这个窄窗口内
  - 视觉上就像“灵动岛和 N 徽章被挤进 Panel”

### 5.2 三种模式下的窗口行为（当前实现）

#### FLOAT（悬浮小岛）

- 由 IPC `collapse-window` 执行：
  - 如果窗口当前是 maximized，会先 `unmaximize()`，等待系统动画完成，再通过 `animateWindowBounds` 平滑过渡到原始（小岛）尺寸。
  - 动画前会向 `webContents.insertCSS` 注入 `opacity: 0` + `pointer-events: none`，避免尺寸变化时内容闪现。
- 最终：
  - `win.setAlwaysOnTop(true)`
  - `win.setIgnoreMouseEvents(true, { forward: true })`（整窗点击穿透）

#### PANEL（右侧面板）

- 由 IPC `expand-window` 执行（注意：这是“窗口层面”的 Panel 展开）：
  - 如果当前 maximized，会先 `unmaximize()` 再继续（避免最大化状态下 `setBounds` 行为不稳定）。
  - 计算一个**比 Panel 更宽**的窗口宽度：
    - `panelWidth`（内容区宽）
    - `overlayGutter`（左侧透明区，给灵动岛/N 徽章）
    - `expandedWidth = panelWidth + overlayGutter`
  - `endBounds.x` 放在屏幕右侧，使 Panel 内容区在右边，左侧留透明空间。
  - 通过 `insertCSS` 注入圆角与透明背景：
    - `border-radius: 16px`
    - `body/#__next background: transparent`
  - `win.setBackgroundColor("#00000000")` 保持窗口透明底
  - `win.setIgnoreMouseEvents(false)`（由 renderer 再根据鼠标位置做动态穿透，见 6.3）

> 重点：PANEL 模式窗口不是“只等于 Panel 宽度”，而是“Panel + 左侧透明走廊（overlayGutter）”，让全局 overlay 有空间保持在原位置。

#### FULLSCREEN（最大化）

- 由 IPC `expand-window-full` 执行：
  - `win.maximize()`（交给 OS 做平滑动画）
  - `insertCSS` 清理 Panel 的圆角/clip-path：恢复为矩形
  - `win.setIgnoreMouseEvents(false)`（整窗可交互）
  - 窗口背景色不硬编码：由 renderer 通过 `setWindowBackgroundColor` 根据主题动态设置（见 6.1）

---

## 6. 透明背景、点击穿透与“只让 Panel 可点击”

文件：`lib/hooks/useElectronClickThrough.ts`

### 6.1 背景色/透明度管理

#### FULLSCREEN

- 目标：内容必须可见，有背景色，不透明。
- 做法：
  - 移除 Panel 模式下注入的 `panel-mode-opacity-fix`
  - 将 `html/body/#__next` 的背景设置为 `oklch(var(--background))`
  - 同步调用 `electronAPI.setWindowBackgroundColor(backgroundColor)`，把 Electron 窗口底色与当前主题一致（避免透明窗口下的黑底/灰底穿透感）。

#### PANEL

- 目标：窗口整体透明，但 PanelWindow 不透明、可见。
- 做法：
  - 先移除 FULLSCREEN 可能残留的 `background-color/background`
  - 注入 `panel-mode-opacity-fix`：
    - `html, body, #__next` → `background: transparent`
    - `[data-panel-window]` → `background: white; opacity: 1; visibility: visible`
  - 额外通过 DOM 直接 setProperty，确保立即生效（避免 React/CSS 注入时序导致闪烁）。

#### FLOAT

- 目标：整窗透明。
- 做法：
  - 移除 `panel-mode-opacity-fix`
  - `setWindowBackgroundColor("#00000000")`
  - `html/body/#__next` 背景强制透明

### 6.2 点击穿透策略（核心）

Electron 只有一个窗口，但我们想实现：

- FLOAT：整窗都“穿透”
- FULLSCREEN：整窗都“可交互”
- PANEL：只有 PanelWindow 区域可交互，其余透明区域穿透到系统

对应实现：

- FLOAT：
  - `setIgnoreMouseEvents(true, { forward: true })`

- FULLSCREEN：
  - `setIgnoreMouseEvents(false)`，并通过 interval 防御性地恢复（避免某些情况下被其它逻辑改回穿透）

- PANEL：
  - 监听 `mousemove`，根据鼠标是否落在 `[data-panel-window]` 的 `getBoundingClientRect()` 内部：
    - inside → `setIgnoreMouseEvents(false)`（允许点击）
    - outside → `setIgnoreMouseEvents(true, { forward: true })`（穿透）
  - 并做了边界包含（`<=`/`>=`），确保顶部 resize handle 区域也被视为 panel 内部。

### 6.3 为什么 PanelWindow 里要有“左侧透明占位 div”？

这不是点击穿透的“必要条件”（穿透由 Electron 决定），但它有两个好处：

- **明确视觉语义**：左侧就是透明走廊，不放内容。
- **避免布局误导**：让 PanelWindow 始终在右侧，且宽度变化时 left 区域自动收缩/扩张，减少“全局元素像进入 panel”的错觉。

---

## 7. 模式切换：入口、时序与关键坑位

### 7.1 入口：UI 按钮触发 onModeChange

- `AppHeader`：
  - Panel → Fullscreen：先 `expandWindowFull()` 再 `onModeChange(FULLSCREEN)`
  - Fullscreen → Panel：**只** `onModeChange(PANEL)`（不再主动缩窗）
- `FullscreenControlBar`：
  - Fullscreen → Panel：同样 **只** 切前端模式

### 7.2 之前的异常（FULLSCREEN → PANEL 全局元素“进 Panel/消失”）根因

根因不是 z-index，而是**窗口坐标系变化**：

- 之前从 FULLSCREEN 切到 PANEL 时，如果执行了“把窗口缩到 Panel 宽”的逻辑：
  - overlay（灵动岛/N）仍在同一窗口里，被限制在变窄的窗口坐标系中
  - 视觉上被挤进 Panel 或被遮挡/裁剪

### 7.3 现在的修复思路（两层保证）

1) **窗口层**：
   - Panel 模式采用 `panelWidth + overlayGutter` 的“宽窗策略”，给 overlay 留空间
   - Fullscreen → Panel UI 按钮不再直接调用缩窗（避免瞬间把坐标系切窄）

2) **DOM/CSS 层**：
   - DynamicIsland 强制 overlay 容器 `position: fixed`、`z-index: 1000002`
   - PanelWindow 强制 `z-index: 1000001` 且自身不透明
   - `useElectronClickThrough` 在 PANEL 时避免改动任何可能影响 fixed 定位上下文的属性，并先清理 FULLSCREEN 的背景残留

---

## 8. 渲染不影响灵动岛的关键约束清单（维护用）

当你未来要改 Panel/Fullscreen 样式或窗口策略时，请确保以下约束一直成立：

- **不要在 PANEL 模式把 BrowserWindow 宽度缩到仅 panelWidth**（除非你把 overlay 放到另一个独立窗口）。
- **DynamicIsland overlay 容器**必须：
  - `position: fixed`
  - `top/left/right/bottom: 0`
  - `z-index > PanelWindow`
  - 容器 `pointer-events: none`，交互区域再单独开 `pointer-events: auto`
- **PanelWindow**必须有独立的背景与可见性保障（避免透明/opacity 注入把它也变透明）。
- **click-through 逻辑**只在 PANEL 用“跟随鼠标 inside/outside panel rect”动态切换。
- **Fullscreen 背景**由 renderer 统一设置，并同步到 Electron `setWindowBackgroundColor`，避免窗口底色与主题不一致。

---

## 9. 常见问题（FAQ / Debug）

### 9.1 如果又出现“全局元素被挤进 Panel”

优先检查：

- Electron 窗口当前 bounds 宽度是否接近 panelWidth（~500）
  - 如果是：说明某处又触发了“缩窗到 panelWidth”的逻辑
- Panel 模式下 `overlayGutter` 是否过小（全局元素在左侧但被裁剪）
- `useElectronClickThrough` 是否对 `html/body/#__next` 写入了影响定位的样式（例如 `transform`、`filter`、`contain` 等会改变 fixed 行为的属性）

### 9.2 如果 Panel 可见但无法点击

- 检查 `mousemove` 是否正常触发
- 检查 `[data-panel-window]` rect 是否正确（特别是 top 偏移/height 计算）
- 检查是否被误设成 `setIgnoreMouseEvents(true)`

---

## 10. 后续演进建议（可选）

如果未来希望更强隔离（彻底不受窗口 resize 影响），可以考虑：

- **双窗口架构**：
  - 一个小的 always-on-top 透明 overlay window 专门渲染灵动岛/N
  - 一个普通 window 负责 Panel/Fullscreen 内容
  - 代价是 IPC/同步复杂度更高，但坐标系与 z-index 问题会更可控
