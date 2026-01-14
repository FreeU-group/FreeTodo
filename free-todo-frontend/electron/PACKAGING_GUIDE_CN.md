# FreeTodo Electron 应用打包指南

本文档描述如何将 FreeTodo 应用（Next.js 前端 + Python 后端）打包为独立的桌面应用程序。

## 目录

- [快速开始](#快速开始)
- [系统要求](#系统要求)
- [打包流程](#打包流程)
- [构建产物](#构建产物)
- [日志文件](#日志文件)
- [故障排查](#故障排查)
- [常见问题](#常见问题)

## 快速开始

### macOS 打包

```bash
# 清理之前的构建产物（可选）
rm -rf dist-electron-app dist-electron .next

# 执行 Mac 打包
pnpm electron:build-mac
```

打包完成后，DMG 文件将生成在 `dist-electron-app/` 目录下：
- `FreeTodo-x.x.x-mac-arm64.dmg` - Apple Silicon Mac 版本
- `FreeTodo-x.x.x-mac-x64.dmg` - Intel Mac 版本

### Windows 打包

```bash
pnpm electron:build-win
```

### Linux 打包

```bash
pnpm electron:build-linux
```

## 系统要求

### macOS 打包要求

- **操作系统**: macOS 10.15 (Catalina) 或更高版本
- **架构支持**:
  - Apple Silicon (arm64) - M1/M2/M3 芯片
  - Intel (x64) - Intel 芯片
- **开发工具**:
  - Node.js 18+ 和 pnpm
  - Python 3.12
  - PyInstaller 6.0+

### 磁盘空间

- **构建过程**: 至少需要 10-15 GB 可用空间
- **最终 DMG**: 约 1-2 GB

## 打包流程

完整的打包流程（`pnpm electron:build-mac`）包含以下步骤：

### 1. Next.js 生产构建

```bash
pnpm build
```

**输出**:
- `.next/standalone/` - 独立的服务器文件
- `.next/static/` - 静态资源文件（CSS、JS chunks）
- `.next/server/` - 服务器端代码

### 2. 后端打包（PyInstaller）

```bash
pnpm backend:build
```

使用 PyInstaller 将 Python 后端打包为独立可执行文件。

**输出结构**:
```
dist-backend/
├── lifetrace              # 可执行文件（macOS/Linux）
├── _internal/             # Python 运行时和依赖
├── config/                # 配置文件
└── models/                # ONNX 模型文件
```

### 3. 解析符号链接

```bash
pnpm electron:resolve-symlinks
```

将 pnpm 在 `node_modules` 中创建的符号链接转换为实际文件，确保打包兼容性。

### 4. 复制缺失的依赖

```bash
pnpm electron:copy-missing-deps
```

复制 Next.js standalone 构建中可能缺失的运行时依赖：
- `styled-jsx`
- `@swc/helpers`
- `@next/env`
- `client-only`

### 5. 编译 Electron 主进程

```bash
pnpm electron:build-main
```

将 TypeScript 主进程代码编译到 `dist-electron/main.js`。

### 6. 打包应用

```bash
electron-builder --mac
```

使用 `electron-builder.yml` 配置创建平台特定的安装包。

## 构建产物

### 应用结构

```
FreeTodo.app/Contents/
├── MacOS/
│   └── FreeTodo              # Electron 可执行文件
├── Resources/
│   ├── app/
│   │   └── dist-electron/
│   │       └── main.js       # 主进程代码
│   ├── standalone/           # Next.js 服务器
│   │   ├── server.js
│   │   ├── node_modules/
│   │   ├── .next/
│   │   └── public/
│   └── backend/              # Python 后端
│       ├── lifetrace
│       ├── _internal/
│       ├── config/
│       └── models/
└── ...
```

### 用户数据目录

**macOS**: `~/Library/Application Support/FreeTodo/lifetrace-data/`
- `config/` - 用户配置文件
- `data/` - 数据库和截图
- `logs/` - 后端应用日志

## 日志文件

### 日志文件命名

前端和后端使用相同的命名规则：
- 格式：`YYYY-MM-DD-N.log`（N 是当天第几次启动，从 0 开始）
- 每次启动应用都会创建新的日志文件
- 时间戳使用 **UTC** 格式

### Electron 主进程日志

**位置**: `~/Library/Logs/FreeTodo/`

示例：`2026-01-11-0.log`、`2026-01-11-1.log`

包含内容：
- 应用启动信息
- 后端/前端服务器状态
- 进程标准输出/错误输出
- 健康检查结果

### 后端应用日志

**位置**: `~/Library/Application Support/FreeTodo/lifetrace-data/logs/`

示例：`2026-01-11-0.log`、`2026-01-11-0.error.log`

包含内容：
- FastAPI 服务器日志
- 后台任务状态
- 错误详情和堆栈信息

### 查看日志

```bash
# 查看最新的 Electron 日志
ls -lt ~/Library/Logs/FreeTodo/*.log | head -5
tail -100 ~/Library/Logs/FreeTodo/$(ls -t ~/Library/Logs/FreeTodo/*.log | head -1)

# 查看最新的后端日志
ls -lt ~/Library/Application\ Support/FreeTodo/lifetrace-data/logs/*.log | head -5
tail -100 "$(ls -t ~/Library/Application\ Support/FreeTodo/lifetrace-data/logs/*.log | head -1)"
```

## 故障排查

### 端口配置

应用使用**动态端口分配**：

| 模式 | 前端端口 | 后端端口 |
|------|---------|---------|
| DEV | 3001（默认） | 8001（默认） |
| Build | 3100（默认） | 8100（默认） |

如果默认端口被占用，会自动递增查找可用端口。

### 启动顺序

1. **后端服务器启动**
   - 查找后端可执行文件
   - 使用数据目录参数启动
   - 等待健康检查通过（最多 180 秒）

2. **前端服务器启动**
   - 启动 Next.js standalone 服务器
   - 等待服务器就绪（最多 30 秒）

3. **创建窗口**
   - 加载前端 URL
   - 显示应用窗口

### 检查后端状态

```bash
# 检查后端进程是否运行
ps aux | grep lifetrace

# 检查端口占用（Build 模式示例）
lsof -i :8100

# 测试健康端点
curl http://localhost:8100/health
```

### 检查前端状态

```bash
# 检查端口占用
lsof -i :3100

# 测试前端
curl http://localhost:3100
```

## 常见问题

### 问题 1: 后端可执行文件未找到

**症状**:
- 显示 "Backend executable not found" 错误
- 应用无法启动

**解决方案**:
1. 检查可执行文件是否存在：
   ```bash
   ls -la /Applications/FreeTodo.app/Contents/Resources/backend/lifetrace
   ```

2. 确保有执行权限：
   ```bash
   chmod +x /Applications/FreeTodo.app/Contents/Resources/backend/lifetrace
   ```

3. 重新构建后端：
   ```bash
   pnpm backend:build
   ```

### 问题 2: Next.js 服务器立即退出

**症状**:
- "Server exited unexpectedly with code 0"
- stdout/stderr 都是空的

**解决方案**:
1. 确保所有构建步骤都已执行：
   ```bash
   pnpm electron:resolve-symlinks
   pnpm electron:copy-missing-deps
   ```

2. 手动测试服务器：
   ```bash
   cd /Applications/FreeTodo.app/Contents/Resources/standalone
   PORT=3100 HOSTNAME=localhost NODE_ENV=production node server.js
   ```

3. 如果出现 "Cannot find module" 错误，将该模块添加到 `scripts/copy-missing-deps.js`

### 问题 3: API 500 错误

**症状**:
- 前端显示 "API error: 500"
- 请求无法到达后端

**常见原因**:
1. 后端未运行 - 检查日志
2. 端口不匹配 - 确保 `NEXT_PUBLIC_API_URL` 正确
3. 后端健康检查超时 - 增加超时时间或检查后端日志

### 问题 4: CSS/样式丢失

**症状**:
- 页面显示没有样式
- 只显示纯文本

**解决方案**:
检查 `.next/static` 是否已复制到 `standalone/.next/static`：
```bash
ls /Applications/FreeTodo.app/Contents/Resources/standalone/.next/static
```

### 问题 5: macOS 安全警告

**症状**:
- "无法打开，因为来自身份不明的开发者"

**解决方案**:

方法 1: 在系统设置中允许
- 系统设置 > 隐私与安全性 > 点击"仍要打开"

方法 2: 移除隔离属性
```bash
xattr -cr /Applications/FreeTodo.app
```

### 问题 6: 构建产物过大

**症状**:
- DMG 文件超过 2 GB

**这是正常的**，因为应用包含：
- 完整的 Python 运行时和依赖
- Node.js 运行时
- OCR 所需的 ONNX 模型

如需减小体积：
- 如果不需要 GPU，使用 CPU-only 版本的 PyTorch
- 在 `pyinstaller.spec` 中排除不需要的 Python 包

## 相关文件

### 前端相关
- `electron/main.ts` - Electron 主进程
- `electron-builder.yml` - electron-builder 配置
- `scripts/resolve-symlinks.js` - 符号链接解析脚本
- `scripts/copy-missing-deps.js` - 缺失依赖复制脚本
- `next.config.ts` - Next.js 配置

### 后端相关
- `lifetrace/scripts/build-backend.sh` - 后端构建脚本（macOS/Linux）
- `lifetrace/scripts/build-backend.ps1` - 后端构建脚本（Windows）
- `lifetrace/pyinstaller.spec` - PyInstaller 配置

---

**最后更新**: 2026-01-11
**适用版本**:
- Next.js 16.x
- Electron 39.x
- electron-builder 26.x
- PyInstaller 6.x
