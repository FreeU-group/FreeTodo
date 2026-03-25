# 一键安装（完整选项）

本文件包含主 README 中提到的一键安装完整说明。

## 环境要求
- Python 3.12+
- Node.js 20+
- Git
- Rust（仅 Tauri 构建需要）

## 基础用法

macOS/Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.sh | bash
```

Windows（PowerShell）：

```powershell
iwr -useb https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.ps1 | iex
```

## 默认值

`mode=tauri`、`variant=web`、`frontend=build`、`backend=script`。

注意：当前桌面打包流程只维护 **Web 模式 Tauri**，Island 和 PyInstaller 打包路径已不再维护。

## 可选环境变量

- `LIFETRACE_DIR`：安装目录（默认使用仓库名）
- `LIFETRACE_REPO`：仓库地址（默认 `https://github.com/FreeU-group/FreeTodo.git`）
- `LIFETRACE_REF`：分支或标签（默认 `main`，不稳定开发版使用 `dev`）
- `LIFETRACE_MODE`：`web`、`tauri` 或 `electron`
- `LIFETRACE_VARIANT`：使用 `web`
- `LIFETRACE_FRONTEND`：`build` 或 `dev`（`web` 默认 `dev`）
- `LIFETRACE_BACKEND`：`script` 或 `pyinstaller`
- `LIFETRACE_RUN`：`1`（默认）安装后自动运行，`0` 仅安装

## 示例

```bash
# Web 开发
curl -fsSL https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.sh | bash -s -- --mode web --frontend dev

# Tauri 开发
curl -fsSL https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.sh | bash -s -- --mode tauri --frontend dev

# Tauri 构建（推荐的 Web-only 打包流程）
curl -fsSL https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.sh | bash -s -- --mode tauri --frontend build --backend script

# 切换分支
curl -fsSL https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.sh | bash -s -- --ref dev
```

```powershell
# Web 开发
$env:LIFETRACE_MODE="web"; $env:LIFETRACE_FRONTEND="dev"; iwr -useb https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.ps1 | iex

# Tauri 开发
$env:LIFETRACE_MODE="tauri"; $env:LIFETRACE_FRONTEND="dev"; iwr -useb https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.ps1 | iex

# Tauri 构建（推荐的 Web-only 打包流程）
$env:LIFETRACE_MODE="tauri"; $env:LIFETRACE_FRONTEND="build"; $env:LIFETRACE_BACKEND="script"; iwr -useb https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.ps1 | iex

# 切换分支
$env:LIFETRACE_REF="dev"; iwr -useb https://raw.githubusercontent.com/FreeU-group/FreeTodo/main/scripts/install.ps1 | iex
```
