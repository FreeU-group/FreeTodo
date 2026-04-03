# FreeTodo Portable（U 盘便携版）

> 把 FreeTodo 装进 U 盘，插上任意 Windows / Mac 电脑，双击就能用。

## 目录结构

```
portable/
├── Windows-Start.bat          Windows 一键启动
├── Windows-Stop.bat           Windows 一键停止
├── Mac-Start.command          Mac 一键启动（双击）
├── Mac-Stop.command           Mac 一键停止
├── Config.html                备用配置页（浏览器打开）
├── setup.bat                  Windows 构建脚本（开发者用）
├── setup.sh                   Mac 构建脚本（开发者用）
│
├── runtime/                   运行时（按平台隔离）
│   ├── win-x64/                  Windows: uv.exe, node/, python/, uv-cache/
│   ├── mac-arm64/                Mac Apple Silicon: uv, node/, python/, uv-cache/
│   └── mac-x64/                  Mac Intel: uv, node/, python/, uv-cache/
│
├── app/                       应用代码（跨平台共享）
│   ├── local-api/                后端源码 + .venv-{platform}/
│   ├── local-sensor/             感知客户端 + .venv-{platform}/
│   ├── scripts/                  辅助脚本
│   └── local-web/                Next.js standalone（JS/CSS 共享，sharp 按平台）
│
└── data/                      用户数据（跨平台共享）
    ├── config/                   server.env, client.env
    ├── data/                     SQLite, ChromaDB
    ├── logs/                     运行日志
    └── models/                   HuggingFace 模型缓存
```

## 构建步骤（开发者）

### 在 Windows 上构建

```batch
cd FreeTodo\portable
setup.bat
```

### 在 Mac 上构建

```bash
cd FreeTodo/portable
chmod +x setup.sh Mac-Start.command Mac-Stop.command
bash setup.sh
```

### 全平台 U 盘

要做一个同时支持 Windows + Mac 的 U 盘：
1. 在 Windows 机器上运行 `setup.bat`
2. 把 U 盘插到 Mac 上运行 `bash setup.sh`
3. 完成！两套运行时共存，源代码和数据共享

预计空间：~8-10 GB（Win + Mac 双平台）

## 使用方法

### Windows 用户
1. 双击 `Windows-Start.bat`
2. 浏览器自动打开，在前端界面配置 API Key
3. 停止：双击 `Windows-Stop.bat`

### Mac 用户
1. 双击 `Mac-Start.command`（首次可能需要右键→打开）
2. 浏览器自动打开
3. 停止：关闭终端窗口，或双击 `Mac-Stop.command`

## 跨机器使用

- 启动时自动检测 venv 路径是否匹配当前位置
- 不匹配则自动重建（优先用本地缓存，几乎不需联网）
- 数据（SQLite、config）完全跨平台通用

## 服务列表

| 服务 | 地址 | 说明 |
|------|------|------|
| Phoenix | http://127.0.0.1:6006 | 可观测性（可选） |
| Backend | http://127.0.0.1:8001 | 核心 API |
| AgentOS | http://127.0.0.1:8002 | Agent 框架 |
| Frontend | http://127.0.0.1:3001 | Web 界面 |
| Sensor | 后台运行 | 屏幕感知 |
| Signal | 后台运行 | 通知轮询 |
