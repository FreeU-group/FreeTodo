# LifeTrace 悬浮球

一个基于 Electron 的桌面日程管理应用，以悬浮球的形式呈现。

## 技术栈

- **Electron**: 桌面应用框架
- **React 19**: UI 框架
- **TypeScript**: 类型安全
- **Vite**: 构建工具

## 开发

### 安装依赖

```bash
npm install
# 或
pnpm install
```

### 运行开发环境

```bash
npm run dev
```

这会同时启动 Vite 开发服务器（端口 5174）和 Electron 应用。

### 构建

### 开发构建（仅编译，不打包）

```bash
npm run build:vite
npm run build:electron
```

### 打包成 exe 文件

**完整打包流程：**

```bash
# 1. 先确保所有依赖已安装
pnpm install

# 2. 执行完整构建（编译 + 打包）
pnpm run build
```

打包完成后，exe 文件会在 `release` 目录下：
- `LifeTrace-桌宠-0.1.0-setup.exe` - 安装程序（需要安装）
- `LifeTrace-桌宠-0.1.0-portable.exe` - **便携版（推荐）**，直接双击运行即可

**便携版特点：**
- 无需安装，双击即可运行
- 悬浮球会自动出现在屏幕右下角
- 无边框、透明背景、始终置顶
- 不显示在任务栏
- 鼠标悬停显示关闭按钮
- 右键菜单可关闭应用

## 修复 Electron 安装问题

如果遇到 "Electron failed to install correctly" 错误，可以尝试：

```bash
# 方法 1: 重新安装 Electron
pnpm rebuild electron

# 方法 2: 完全清理后重新安装
rm -rf node_modules pnpm-lock.yaml
pnpm install

# 方法 3: 使用国内镜像（已配置 .npmrc）
# 如果还是失败，可以手动下载 Electron 二进制文件
```

## 图标配置（可选）

如果需要自定义应用图标，请将图标文件放在 `build/icon.ico`：
- 推荐尺寸：256x256 像素
- 格式：ICO（包含多个尺寸：16x16, 32x32, 48x48, 256x256）
- 如果没有图标，electron-builder 会使用默认图标

## 窗口配置

- 窗口大小: 64x64 像素（圆形悬浮球）
- 无边框、透明背景
- 始终置顶
- 不显示在任务栏
- 默认位置: 屏幕右下角
- 使用 logo.png 作为悬浮球图标
- 鼠标悬停时放大并显示关闭按钮
- 支持拖拽移动（未来功能）

## 端口配置

- 开发服务器端口: **5174**（与 frontend 的 3000 端口区分）

## 功能特性

- ✅ 悬浮球显示（使用 logo.png）
- ✅ 鼠标悬停放大效果
- ✅ 关闭按钮（悬停时显示）
- ✅ 右键菜单关闭
- ✅ 透明背景、始终置顶

## 未来计划

- [ ] 拖拽移动悬浮球
- [ ] 点击悬浮球打开日程管理界面
- [ ] 日程管理功能（增删改查）
- [ ] 列表视图显示日程
- [ ] 与截图数据库的关联
- [ ] 活动映射功能

