# 灵动岛组件 (Dynamic Island)

全局灵动岛组件，支持多种显示模式，并与音频模块联动。

## 功能特性

1. **多种显示模式**
   - `FLOAT`: 常驻悬浮窗（右下角小窗口）
   - `POPUP`: 简洁弹窗（通知样式）
   - `SIDEBAR`: 详细侧边栏（录音控制面板）
   - `FULLSCREEN`: 全屏工作台（显示完整的 VoiceModulePanel）

2. **录音控制**
   - 在 FLOAT 模式下点击可开始/停止录音
   - 实时显示录音状态和波形
   - 与 `useAppStore` 联动

3. **窗口控制**
   - 支持透明窗口（Electron）
   - 支持点击穿透（鼠标事件穿透到桌面）
   - 支持窗口置顶
   - 自动管理鼠标事件捕获

## 使用方法

### 启动方式

#### 方式 1：开发模式（默认启用灵动岛）

```bash
# 在 free-todo-frontend 目录下
pnpm electron:dev
```

**注意**：开发模式下默认启用灵动岛模式（透明窗口）。

#### 方式 2：禁用灵动岛模式

```bash
# PowerShell
$env:ENABLE_DYNAMIC_ISLAND="false"; pnpm electron:dev

# CMD
set ENABLE_DYNAMIC_ISLAND=false && pnpm electron:dev

# Bash
ENABLE_DYNAMIC_ISLAND=false pnpm electron:dev
```

#### 方式 3：生产模式启用

```bash
# PowerShell
$env:ENABLE_DYNAMIC_ISLAND="true"; pnpm electron:dev

# CMD
set ENABLE_DYNAMIC_ISLAND=true && pnpm electron:dev

# Bash
ENABLE_DYNAMIC_ISLAND=true pnpm electron:dev
```

### 键盘快捷键

- `1`: 切换到 FLOAT 模式
- `2`: 切换到 POPUP 模式
- `3`: 切换到 SIDEBAR 模式
- `4`: 切换到 FULLSCREEN 模式
- `Escape`: 退出当前模式（全屏→侧边栏→悬浮窗）

### 代码集成

组件已自动集成到 `app/layout.tsx`，通过 `DynamicIslandProvider` 全局渲染。

## 文件结构

```
components/DynamicIsland/
├── DynamicIsland.tsx          # 主组件
├── IslandContent.tsx          # 各模式的内容组件
├── DynamicIslandProvider.tsx  # 客户端包装组件
├── types.ts                   # 类型定义
└── index.ts                   # 导出
```

## 状态管理

使用 `useDynamicIslandStore` 管理全局状态：

```typescript
import { useDynamicIslandStore } from '@/lib/store/dynamic-island-store';
import { IslandMode } from '@/components/DynamicIsland';

const { mode, setMode, isEnabled, toggleEnabled } = useDynamicIslandStore();
```

## Electron 配置

### 透明窗口

在 `electron/main.ts` 中，当启用灵动岛模式时：
- `frame: false` - 无边框
- `transparent: true` - 透明背景
- `alwaysOnTop: true` - 窗口置顶
- `skipTaskbar: true` - 不显示在任务栏

### IPC 通信

已添加 `set-ignore-mouse-events` IPC 处理器，用于控制点击穿透。

## 注意事项

1. **透明窗口模式**：仅在 Electron 环境中生效，浏览器中会显示为普通窗口
2. **录音功能**：需要与 `VoiceModulePanel` 的录音服务配合使用
3. **性能**：全屏模式会渲染完整的 `VoiceModulePanel`，注意性能影响
4. **开发模式**：默认启用灵动岛模式，如需禁用请设置环境变量
