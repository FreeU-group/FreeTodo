# FreeTodo Electron 桌面应用

这是 FreeTodo 的 Electron 桌面客户端版本，将 Next.js 应用打包为跨平台桌面应用。

## 🚀 快速开始

### 1. 安装依赖

```bash
cd free-todo-frontend
pnpm install
```

### 2. 开发模式

启动带有热更新的 Electron 开发模式：

```bash
pnpm electron:dev
```

这将：
- 启动 Next.js 开发服务器（http://localhost:3000）
- 打开 Electron 窗口
- 支持热模块替换（HMR）

### 3. 打包应用

#### 打包当前平台（快速测试）

```bash
pnpm electron:pack
```

这将在 `dist` 目录生成未打包的应用程序，可以快速测试但不生成安装包。

#### 生成安装包

打包所有平台：
```bash
pnpm electron:dist
```

打包特定平台：
```bash
# macOS
pnpm electron:dist:mac

# Windows
pnpm electron:dist:win

# Linux
pnpm electron:dist:linux
```

## 📦 打包产物

打包后的文件位于 `dist` 目录：

### macOS
- `FreeTodo-{version}.dmg` - DMG 安装镜像
- `FreeTodo-{version}-mac.zip` - ZIP 压缩包
- `mac/FreeTodo.app` - 应用程序包

### Windows
- `FreeTodo-{version}-x64.exe` - 64位安装程序
- `FreeTodo-{version}-ia32.exe` - 32位安装程序
- `FreeTodo-{version}-x64-portable.exe` - 便携版

### Linux
- `FreeTodo-{version}.AppImage` - AppImage 格式
- `FreeTodo-{version}.deb` - Debian/Ubuntu 包
- `FreeTodo-{version}.rpm` - RedHat/Fedora 包

## 🎨 自定义图标

应用使用 `public/logo.png` 作为图标源文件。

要生成各平台图标：

```bash
node scripts/generate-icons.js
```

或手动生成（详见 `electron/ICONS_README.md`）。

## ⚙️ 配置

### 后端 API 地址

默认连接到 `http://localhost:8000`。

修改方式：
1. **环境变量**：设置 `NEXT_PUBLIC_API_URL`
   ```bash
   NEXT_PUBLIC_API_URL=http://api.example.com:8000 pnpm electron:dev
   ```

2. **配置文件**：修改 `next.config.mjs`

### Electron 配置

编辑 `electron-builder.json` 可以自定义：
- 应用名称和 ID
- 打包目标平台
- 安装程序选项
- 文件包含/排除规则

### 主进程配置

编辑 `electron/main.js` 可以调整：
- 窗口大小和属性
- 开发工具开关
- 菜单栏
- 应用行为

## 🏗️ 技术架构

```
┌─────────────────────────────────────┐
│         Electron 主进程             │
│  - 启动 Next.js 开发服务器           │
│  - 管理应用窗口                     │
│  - 处理系统事件                     │
└────────────┬────────────────────────┘
             │
             ├──────────────┐
             ↓              ↓
    ┌─────────────┐  ┌──────────────┐
    │ Next.js     │  │  BrowserWindow│
    │ Dev Server  │  │  (渲染进程)   │
    │ :3000       │←─┤  加载网页     │
    └─────────────┘  └───────┬───────┘
             ↓               │
    ┌─────────────────────────┘
    │
    ↓
┌──────────────────┐
│   外部后端 API   │
│  (lifetrace)     │
└──────────────────┘
```

## 📁 文件结构

```
free-todo-frontend/
├── electron/                    # Electron 相关文件
│   ├── main.js                 # 主进程入口
│   ├── preload.js              # 预加载脚本
│   ├── entitlements.mac.plist  # macOS 权限配置
│   ├── icon.png                # Linux 图标
│   ├── icon.icns               # macOS 图标（需生成）
│   ├── icon.ico                # Windows 图标（需生成）
│   └── ICONS_README.md         # 图标生成指南
├── scripts/
│   └── generate-icons.js       # 图标生成脚本
├── electron-builder.json       # 打包配置
├── package.json                # 包含 Electron 脚本
├── app/                        # Next.js 应用
├── components/                 # React 组件
├── lib/                        # 工具库
└── public/                     # 静态资源
```

## 🔧 开发提示

### 调试

开发模式下会自动打开 Chrome DevTools。也可以通过菜单 `视图 > 开发者工具` 手动打开。

### 热更新

修改前端代码后，Electron 窗口会自动刷新（Next.js HMR）。

修改 Electron 主进程代码（`electron/main.js`）后，需要重启应用。

### 端口冲突

如果 3000 端口被占用，可以修改：
```bash
PORT=3001 pnpm electron:dev
```

### 性能优化

开发模式下启动较慢是正常的（需要启动 Next.js）。生产打包后启动会更快。

## 🐛 常见问题

### Q: 启动后窗口白屏
A: 等待 Next.js 服务器启动（约 5-10 秒）。检查终端是否有错误信息。

### Q: 找不到后端 API
A: 确保后端服务已启动，或修改 `NEXT_PUBLIC_API_URL` 环境变量。

### Q: 打包失败
A:
1. 检查是否安装了所有依赖
2. macOS 打包需要 Xcode 命令行工具
3. Windows 打包在 macOS 上需要额外配置
4. 首次打包会下载平台工具，需要网络连接

### Q: 应用图标不显示
A: 确保已生成对应平台的图标文件（.icns/.ico/.png）。参考 `electron/ICONS_README.md`。

### Q: 应用体积太大
A:
- 开发模式打包包含完整的 Node.js 和 Next.js
- 可以考虑切换到静态导出模式减小体积
- 使用 electron-builder 的压缩选项

## 📝 待办事项

- [ ] 添加自动更新功能（electron-updater）
- [ ] 实现应用托盘图标
- [ ] 添加全局快捷键
- [ ] 集成系统通知
- [ ] 支持离线模式
- [ ] 添加应用签名和公证（macOS）
- [ ] 实现自定义协议（freetodo://）

## 🤝 贡献

如有问题或建议，请提交 Issue 或 Pull Request。

## 📄 许可证

与主项目保持一致。
