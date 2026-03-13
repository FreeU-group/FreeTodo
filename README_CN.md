![FreeTodo Logo](.github/assets/free_todo_banner.png)

![GitHub stars](https://img.shields.io/github/stars/FreeU-group/FreeTodo?style=social) ![GitHub forks](https://img.shields.io/github/forks/FreeU-group/FreeTodo?style=social) ![GitHub issues](https://img.shields.io/github/issues/FreeU-group/FreeTodo) [![License](https://img.shields.io/badge/license-FreeU%20Community-blue.svg)](LICENSE) ![Python version](https://img.shields.io/badge/python-3.12-blue.svg) ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)

**语言**: [English](README.md) | [中文](README_CN.md)

[📖 文档](https://freeyou.club/lifetrace/introduction.html) • [🚀 快速开始](#快速开始) • [💡 功能特性](#核心功能) • [🔧 开发指南](#开发指南) • [🤝 贡献指南](#贡献)

# FreeTodo - 放手去做

## 项目概述

**FreeTodo** 是一款 AI 驱动的智能待办管理应用，帮助您高效管理任务、提升生产力、达成目标。通过对话式 AI 交互和智能任务拆分，FreeTodo 将复杂项目转化为可执行的行动步骤。

## 核心功能

### 🤖 AI 智能助手

- **智能任务拆分**：AI 自动将复杂任务分解为可管理的子任务，通过引导式问卷流程完成
- **智能任务提取**：从 AI 对话响应中提取可执行的待办事项
- **上下文感知建议**：AI 根据当前待办上下文提供任务建议
- **个人画像记忆**：Agno learning 构建用户画像与跨会话记忆

### ✅ 全面的任务管理

- **层级任务结构**：支持父子任务关系，无限层级嵌套
- **优先级与状态**：四级优先级（紧急/高/中/低）和多种状态
- **标签与分类**：使用自定义标签组织待办，便于筛选
- **截止日期管理**：设置截止日期，可视化提醒
- **丰富备注**：为每个待办添加详细备注和描述

### 📅 多视图日历

- **日/周/月视图**：灵活的日历视图，可视化您的日程安排
- **拖拽排期**：轻松拖拽待办到日历时间槽进行排期
- **快速创建待办**：直接从日历时间槽创建待办

### 🎨 现代化用户界面

- **多面板布局**：可自定义的面板排列（待办 + 聊天 + 详情）
- **深色/浅色主题**：精美主题，多种配色方案
- **国际化支持**：完整支持中英文
- **响应式设计**：适配各种屏幕尺寸

### 💻 桌面应用

- **Electron 应用**：Windows 和 macOS 原生桌面体验
- **系统集成**：原生通知和系统托盘支持

## 系统架构

FreeTodo 采用**分布式多模块**架构，包含三大核心组件：

- **Server**（`server/`）：FastAPI (Python) — 中心节点，部署在云端或本地服务器，负责 LLM 处理、数据存储和业务 API
- **Client**（`client/`）：Python 感知守护进程 — 轻量级感知代理，运行在本地设备上，负责屏幕截图、OCR 识别和数据转发
- **Frontend**（`frontend/`）：Next.js (React + TypeScript) — 现代化 Web 界面，支持 Electron 桌面应用

辅助模块：

- **Phone**（`phone/`）：Flutter 移动端应用
- **Hardware**（`hardware/`）：硬件设备集成（omi、omiGlass 等）
- **Deploy**（`deploy/`）：Docker Compose 部署配置
- **数据层**：SQLite + ChromaDB（用于 AI 功能）

## 快速开始

### 环境要求

**Server & Client**（Python）:

- Python 3.12
- 支持的操作系统：Windows、macOS、Linux

**Frontend**（Node.js）:

- Node.js 20+
- pnpm 包管理器

### 安装依赖

本项目使用 [uv](https://github.com/astral-sh/uv) 进行 Python 依赖管理。每个模块拥有独立的运行环境。

**安装 uv:**

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

> **注意**：安装完成后，`uv` 可能无法在当前终端中立即使用。要在当前会话中激活它：
>
> - **Windows (PowerShell)**：运行 `$env:Path = "$env:USERPROFILE\.local\bin;$env:Path"` 来刷新 PATH
> - **macOS/Linux**：运行 `exec $SHELL` 来重新初始化 shell 会话，或重新打开终端
>
> 或者，您也可以直接打开一个新的终端窗口，`uv` 将自动可用。

**分别安装各模块依赖：**

```bash
# Server 依赖
uv sync --directory server

# Client 依赖
uv sync --directory client

# Frontend 依赖
pnpm --dir frontend install
```

### 一键启动全部服务

开发时可通过脚本一次性启动 **Server + AgentOS + Frontend**：

**macOS/Linux**

```bash
chmod +x scripts/start_all.sh
./scripts/start_all.sh
```

**Windows（PowerShell）**
这里目前还没有调试好。

```powershell
.\scripts\start_all.ps1
```

该脚本会打开三个终端窗口分别运行各服务。

### 分步启动服务

**1. 启动 Server**（中心节点）：

```bash
uv run --directory server python server.py
uv run --directory server python agent_os.py
```

**2. 启动 Client**（感知守护进程，可选）：

```bash
uv run --directory client python sensor.py --center-url http://localhost:8001 --node-id MY-PC
```

**3. 启动 Frontend**：

```bash
pnpm --dir frontend dev
```

实际的前端地址和后端连接状态会在控制台显示。服务启动后，在浏览器中访问控制台显示的前端地址（通常为 `http://localhost:3001`）开始使用 FreeTodo！

### Docker 部署

也可以通过 Docker 部署 Server：

```bash
# 构建 Server 镜像
make build-server

# 使用 Docker Compose 启动服务
make start

# 查看日志
make logs
```

## 📋 待办事项与路线图

> 📖 **完整路线图**：查看详细的 [项目路线图](.github/ROADMAP_CN.md) 了解 FreeU 项目的完整愿景和发展规划。

### 🎯 FreeU 整体项目路线图

#### 1. LifeTrace（v0.2 已完成）
- ✓ **电脑活动流构建**：通过截图生成个人活动流
- 🔮 **未来规划**：音频获取、视频环境、智能设备集成、本地大模型优化

#### 2. Free Todo（v0.1 当前进行中）
- 🚧 **当前聚焦**：打造极致的 To-Do List
- 🎯 **核心使命**：固定用户意图、形成个人上下文整理，为主动服务打下基础

#### 3. 主动服务阶段（未来规划）
- 基于 LifeTrace 数据和 Free Todo 意图提供主动服务

---

### 🚧 Free Todo 近期计划（专注输入层）

**目标**：尽可能从用户生活中获取各种各样的信息并收集为 Todo

- 🎨 **UI 灵动岛**
  - ☐ 控制语音输入和截图定时任务开关
  - ☐ 提供便捷窗口访问 Todo 列表和对话界面

- 🤖 **Agent 开发**
  - 🚧 开发 AI 工具调度能力
  - ☐ 从基础对话升级为支持多工具调用的智能 Agent

---

### 📐 Free Todo 三层次路线图

#### 输入层：减轻输入负担，意念流般的捕获
- ☐ 语音输入（灵动岛、快捷键呼出）
- ☐ 多模态输入（文字、截图、语音）
- ☑ 社交软件集成（微信、飞书等 todo 捕获）
- ☑ 智能消息 todo 提取

#### 中间处理层：从"混沌"到"秩序"
- ☑ AI 任务拆分（"大石头"变"小石子"）
- ☑ AI 意图补全 / 任务详情补全
- ☐ 自动分类与组织
- ☐ 任务优先级智能规划
- ☑ Todo 上下文构建
- ☑ 个人画像与记忆（Agno Learning）

#### 输出层：心理安全感 + 温暖可靠的秘书伙伴
- ☐ AI 秘书人格化
- ☐ 日程提醒（目前正在做）
- ☐ 任务专注模式（只显示部分任务）
- ☐ 已完成任务强化（功劳簿化）
- ☐ 逾期任务重新规划

---

### 🔬 开发中功能

Free Todo 的面板开关栏里有一些正在开发中的面板，这些面板展示了我们未来的功能方向，供社区参考和了解。

**🤝 社区参与**：我们非常欢迎社区成员参与进来！
- 🎨 **面板贡献**：贡献自己的面板设计或提出改进建议
- 🤖 **Agent 算法贡献**：贡献新的 Agent 算法，我们积极合入！

---

### ✅ 最近完成

- ☑ **AI 任务拆分** - 通过问卷流程实现智能任务分解
- ☑ **多面板界面** - 可自定义面板的灵活布局
- ☑ **日历集成** - 支持拖拽的日/周/月视图
- ☑ **Agno 记忆学习** - 个人画像与跨会话记忆

---

> 💡 **想要贡献？** 查看我们的[贡献指南](#贡献)并选择任何你感兴趣的待办事项！

## 开发指南

### Git Hooks（Pre-commit）

本仓库使用共享的 `.githooks/` 目录。运行 `free-todo-frontend` 里的 `pnpm install` 或
一键安装脚本时会自动配置 Hooks。若你只是手动 clone 而未执行上述步骤，则每个
clone/worktree 需要手动执行一次：

```bash
# macOS/Linux
bash scripts/setup_hooks_here.sh

# Windows（PowerShell）
powershell -ExecutionPolicy Bypass -File scripts/setup_hooks_here.ps1
```

> **注意**：不要在此仓库里运行 `pre-commit install`。仓库使用 `core.hooksPath`，因此 `pre-commit install` 会拒绝执行。

更多细节请见： [.github/PRE_COMMIT_GUIDE_CN.md](.github/PRE_COMMIT_GUIDE_CN.md)

### 项目结构

```
├── server/                     # Server — 中心节点（FastAPI 后端）
│   ├── server.py               # FastAPI 应用入口
│   ├── agent_os.py             # AgentOS 入口（Agno Agent 服务）
│   ├── pyproject.toml          # Server Python 依赖
│   ├── Dockerfile              # Docker 构建文件
│   ├── config/                 # 配置文件
│   ├── core/                   # 核心框架（模块注册、依赖注入等）
│   ├── routers/                # API 路由处理器（约 30 个模块）
│   ├── schemas/                # Pydantic 请求/响应模型
│   ├── services/               # 业务逻辑服务层
│   ├── repositories/           # 数据访问层（Repository 模式）
│   ├── storage/                # 数据存储层
│   ├── llm/                    # LLM 和 AI 服务
│   ├── memory/                 # 记忆管理（Agno Learning）
│   ├── perception/             # 感知数据处理
│   ├── jobs/                   # 后台任务
│   ├── migrations/             # 数据库迁移（Alembic）
│   ├── observability/          # 可观测性与链路追踪
│   └── util/                   # 工具函数
├── client/                     # Client — 感知守护进程（轻量级感知代理）
│   ├── sensor.py               # 主入口，屏幕截图 / OCR 采集
│   ├── pyproject.toml          # Client Python 依赖
│   ├── config/                 # 客户端配置
│   ├── perception/             # 感知模型与逻辑
│   ├── proactive_ocr/          # 主动 OCR 引擎（macOS/Windows）
│   └── util/                   # 工具函数
├── frontend/                   # Frontend — Web 与桌面 UI（Next.js + Electron）
│   ├── app/                    # Next.js 应用目录
│   ├── apps/                   # 功能模块
│   │   ├── todo-list/          # 待办列表模块
│   │   ├── todo-detail/        # 待办详情模块
│   │   ├── chat/               # AI 聊天模块
│   │   ├── calendar/           # 日历模块
│   │   ├── settings/           # 设置模块
│   │   └── ...                 # 其他模块
│   ├── components/             # React 组件
│   ├── lib/                    # 工具和服务
│   ├── electron/               # Electron 桌面应用封装
│   └── package.json            # 前端依赖
├── phone/                      # 移动端应用（Flutter）
├── hardware/                   # 硬件设备集成（omi、omiGlass）
├── deploy/                     # Docker Compose 部署
│   └── compose.yaml            # 容器编排配置
├── docs/                       # 架构与设计文档
├── scripts/                    # 工具脚本（启动、hooks、构建）
├── .github/                    # GitHub 资源、规范、CI
├── .githooks/                  # 仓库内 Git hooks
├── makefile                    # Docker 构建与部署快捷命令
├── LICENSE                     # FreeU Community License 许可证
├── README.md                   # 英文 README
└── README_CN.md                # 中文 README（本文件）
```

## 贡献

FreeTodo 社区的存在离不开像您这样的众多友善志愿者。我们欢迎所有对社区的贡献，并很高兴欢迎您的加入。

**最近的贡献：**

![GitHub contributors](https://img.shields.io/github/contributors/FreeU-group/LifeTrace) ![GitHub commit activity](https://img.shields.io/github/commit-activity/m/FreeU-group/LifeTrace) ![GitHub last commit](https://img.shields.io/github/last-commit/FreeU-group/LifeTrace)

### 📚 贡献指南

我们提供了完整的贡献指南帮助您开始：

- **[贡献指南](.github/CONTRIBUTING_CN.md)** - 完整的贡献流程和规范
- **[后端开发规范](.github/BACKEND_GUIDELINES_CN.md)** - Python/FastAPI 编码规范
- **[前端开发规范](.github/FRONTEND_GUIDELINES_CN.md)** - TypeScript/React 编码规范

### 🚀 快速开始贡献

1. **🍴 Fork 项目** - 创建您自己的仓库副本
2. **🌿 创建功能分支** - `git checkout -b feature/amazing-feature`
3. **💾 提交您的更改** - `git commit -m 'feat: 添加某个很棒的功能'`
4. **📤 推送到分支** - `git push origin feature/amazing-feature`
5. **🔄 创建 Pull Request** - 提交您的更改以供审核

### 🎯 您可以贡献的领域

- 🐛 **错误报告** - 帮助我们识别和修复问题
- 💡 **功能请求** - 建议新功能
- 📝 **文档** - 改进指南和教程
- 🧪 **测试** - 编写测试并提高覆盖率
- 🎨 **UI/UX** - 增强用户界面
- 🔧 **代码** - 实现新功能和改进

### 🔰 开始贡献

- 查看我们的 **[贡献指南](.github/CONTRIBUTING_CN.md)** 了解详细说明
- 寻找标记为 `good first issue` 或 `help wanted` 的问题
- 后端开发请遵循 **[后端开发规范](.github/BACKEND_GUIDELINES_CN.md)**
- 前端开发请遵循 **[前端开发规范](.github/FRONTEND_GUIDELINES_CN.md)**
- 在 Issues 和 Pull Requests 中加入我们的社区讨论

我们感谢所有贡献，无论大小！🙏

## 加入我们的社区

与我们和其他 FreeTodo 用户联系！扫描下方二维码加入我们的社区群组：

<table>
  <tr>
    <th>微信群</th>
    <th>飞书群</th>
    <th>小红书</th>
  </tr>
  <tr>
    <td align="center">
      <img src=".github/assets/wechat.png" alt="微信二维码" width="200"/>
      <br/>
      <em>扫码加入微信群</em>
    </td>
    <td align="center">
      <img src=".github/assets/feishu.png" alt="飞书二维码" width="200"/>
      <br/>
      <em>扫码加入飞书群</em>
    </td>
    <td align="center">
      <img src=".github/assets/xhs.jpg" alt="小红书二维码" width="200"/>
      <br/>
      <em>关注我们的小红书</em>
    </td>
  </tr>
</table>

## 文档

我们使用 deepwiki 管理文档，请参考此[**网站**](https://deepwiki.com/FreeU-group/LifeTrace/6.2-deployment-and-setup)。

## Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=FreeU-group/FreeTodo&type=Timeline)](https://www.star-history.com/#FreeU-group/FreeTodo&Timeline)

## 许可证

版权所有 © 2026 FreeU.org

FreeTodo 采用 **FreeU Community License** 许可证，该许可证基于 Apache License 2.0，并附加了关于商业使用的条件。

有关详细的许可证条款，请参阅 [LICENSE](LICENSE) 文件。
