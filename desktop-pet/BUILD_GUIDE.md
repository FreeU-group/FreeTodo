# 打包指南

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

如果遇到 Electron 安装失败，执行：

```bash
pnpm rebuild electron
```

### 2. 打包应用

```bash
pnpm run build
```

这个命令会：
1. 编译 Electron 主进程代码（TypeScript → JavaScript）
2. 构建前端应用（React + Vite）
3. 打包成 Windows exe 文件

### 3. 运行打包后的应用

打包完成后，在 `release` 目录下会生成两个文件：

- **`LifeTrace-桌宠-0.1.0-portable.exe`** ⭐ **推荐使用**
  - 便携版，无需安装
  - 双击即可运行
  - 窗口会自动出现在屏幕右下角

- `LifeTrace-桌宠-0.1.0-setup.exe`
  - 安装程序版本
  - 需要安装到系统
  - 可以创建桌面快捷方式

## 窗口特性

打包后的应用具有以下特性：

- ✅ 窗口大小：300x400 像素（桌宠级别）
- ✅ 无边框、透明背景
- ✅ 始终置顶
- ✅ 不显示在任务栏
- ✅ 自动定位到屏幕右下角

## 开发模式

如果需要开发调试：

```bash
pnpm run dev
```

这会启动：
- Vite 开发服务器（http://localhost:5174）
- Electron 窗口（自动加载开发服务器）

## 常见问题

### Q: Electron 安装失败怎么办？

A: 尝试以下方法：

```bash
# 方法 1: 重新构建 Electron
pnpm rebuild electron

# 方法 2: 完全清理后重装
rm -rf node_modules pnpm-lock.yaml
pnpm install

# 方法 3: 检查网络连接（Electron 需要下载二进制文件）
```

### Q: 打包后的 exe 无法运行？

A: 检查以下几点：

1. 确保所有依赖都已正确安装
2. 检查 `dist` 和 `dist-electron` 目录是否存在
3. 查看控制台错误信息

### Q: 如何自定义应用图标？

A: 将图标文件放在 `build/icon.ico`：
- 格式：ICO
- 推荐尺寸：256x256 像素
- 包含多个尺寸（16x16, 32x32, 48x48, 256x256）

如果没有图标文件，electron-builder 会使用默认图标。

### Q: 如何修改窗口大小？

A: 编辑 `electron/main.ts` 中的窗口配置：

```typescript
const mainWindow = new BrowserWindow({
  width: 300,  // 修改这里
  height: 400, // 修改这里
  // ...
});
```

然后重新打包即可。

