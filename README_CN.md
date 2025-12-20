![FreeU Logo](.github/assets/lifetrace_logo.png)

![GitHub stars](https://img.shields.io/github/stars/FreeU-group/LifeTrace?style=social) ![GitHub forks](https://img.shields.io/github/forks/FreeU-group/LifeTrace?style=social) ![GitHub issues](https://img.shields.io/github/issues/FreeU-group/LifeTrace) ![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg) ![Python version](https://img.shields.io/badge/python-3.13+-blue.svg) ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)

**语言**: [English](README.md) | [中文](README_CN.md)

[📖 文档](https://freeyou.club/lifetrace/introduction.html) • [🚀 快速开始](#快速开始) • [💡 功能特性](#核心功能) • [🔧 开发指南](#开发指南) • [🤝 贡献指南](#贡献)

# FreeU - 为您分忧

## 项目概述

`FreeU` 是一个基于 AI 的智能个人效率助手，致力于帮助用户更好地管理日常生活和工作。目前已完成两个核心模块：

- **FreeTodo（AI 待办）**：智能任务管理系统，支持 AI 辅助的待办事项创建、分解和跟踪
- **LifeTrace（活动记录）**：智能生活记录系统，通过自动截图、OCR 识别等技术记录和检索日常活动

## 核心功能

### FreeTodo - AI 待办
- **智能任务创建**：AI 辅助创建和分解任务
- **任务追踪**：实时跟踪任务进度和状态
- **上下文关联**：自动关联相关截图和活动上下文（正在完善中）

### LifeTrace - 活动记录
- **自动截图记录**：定时自动屏幕捕获，记录用户活动
- **智能 OCR 识别**：使用 RapidOCR 从截图中提取文本内容
- **智能事件管理**：基于上下文自动将截图聚合为智能事件
- **时间分配分析**：可视化展示应用使用时间分布，支持24小时分布图表和应用分类
- **信息回溯检索**：帮助用户回溯和检索过去重要的信息碎片

### 通用功能
- **Web API 服务**：提供完整的 RESTful API 接口
- **现代化前端**：支持多种主题和布局的 Web 界面

## 系统架构

FreeU 采用**前后端分离**架构：

- **后端**: FastAPI (Python) - 提供 RESTful API（位于 `lifetrace/` 目录）
- **前端**: Next.js (React + TypeScript) - 现代化 Web 界面（位于 `free-todo-frontend/` 目录）
- **数据层**: SQLite + ChromaDB

> ⚠️ **注意**: `frontend/` 目录是旧版前端，已弃用。请使用 `free-todo-frontend/` 作为新的前端。

详细架构说明请参考 [ARCHITECTURE.md](ARCHITECTURE.md)

## 快速开始

### 环境要求

**后端**:

- Python 3.13+
- 支持的操作系统：Windows、macOS
- 可选：CUDA 支持（用于 GPU 加速）

**前端**:

- Node.js 20+
- pnpm 包管理器

### 安装依赖

本项目使用 [uv](https://github.com/astral-sh/uv) 进行快速可靠的依赖管理。

**安装 uv:**

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

**安装依赖并同步环境:**

```bash
# 从 pyproject.toml 和 uv.lock 同步依赖
uv sync

# 激活虚拟环境
# macOS/Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate
```

### 启动后端服务

> **注意**：首次运行时，如果 `config.yaml` 不存在，系统会自动从 `default_config.yaml` 创建。您可以通过编辑 `lifetrace/config/config.yaml` 来自定义设置。

**启动服务器：**

```bash
python -m lifetrace.server
```

> **自定义提示词**：如果您想修改不同功能的 AI 提示词，可以编辑 `lifetrace/config/prompt.yaml` 文件。

后端服务将在 `http://localhost:8000` 启动。

- **API 文档**: `http://localhost:8000/docs`

### 启动前端服务

前端是使用 FreeU 的必需组件。启动前端开发服务器：

```bash
cd free-todo-frontend

pnpm install
pnpm dev
```

前端开发服务器将在 `http://localhost:3000` 启动，API 请求会自动代理到后端 `:8000`。

服务启动后，在浏览器中访问 `http://localhost:3000` 开始使用 FreeU！🎉

详细说明请参考：[free-todo-frontend/README.md](free-todo-frontend/README.md)

## 📋 待办事项与路线图

### 🚀 高优先级

- ☐ **用户体验改进**
  - ☐ 为高级用户实现键盘快捷键
  - ☐ 创建交互式入门教程

### 💡 未来计划

- ☐ **移动端与跨平台**
  - ☐ 开发移动配套应用
  - ☐ 添加平板优化界面
  - ☐ 创建 Web 版本

### ✅ 最近完成

- ☑ **FreeTodo 模块** - AI 智能待办管理系统
- ☑ **LifeTrace 模块** - 基础截图记录和 OCR 功能

---

> 💡 **想要贡献？** 查看我们的[贡献指南](#贡献)并选择任何你感兴趣的待办事项！

## 开发指南

### 项目结构

```
├── .github/                    # GitHub 仓库资源
│   ├── assets/                 # 静态资源（README 图片）
│   ├── BACKEND_GUIDELINES.md   # 后端开发规范
│   ├── FRONTEND_GUIDELINES.md  # 前端开发规范
│   ├── CONTRIBUTING.md         # 贡献指南
│   └── ...                     # 其他 GitHub 仓库文件
├── lifetrace/                  # 后端模块 (FastAPI)
│   ├── server.py               # Web API 服务入口
│   ├── config/                 # 配置文件
│   │   ├── config.yaml         # 主配置文件（自动生成）
│   │   ├── default_config.yaml # 默认配置模板
│   │   ├── prompt.yaml         # AI 提示词模板
│   │   └── rapidocr_config.yaml# OCR 配置
│   ├── routers/                # API 路由处理器
│   │   ├── activity.py         # 活动管理端点
│   │   ├── chat.py             # 聊天接口端点
│   │   ├── todo.py             # 待办事项端点
│   │   ├── task.py             # 任务管理端点
│   │   ├── screenshot.py       # 截图端点
│   │   └── ...                 # 其他端点
│   ├── schemas/                # Pydantic 数据模型
│   ├── services/               # 业务逻辑服务层
│   ├── repositories/           # 数据访问层
│   ├── storage/                # 数据存储层
│   ├── llm/                    # LLM 和 AI 服务
│   ├── jobs/                   # 后台任务
│   ├── util/                   # 工具函数
│   ├── models/                 # OCR 模型文件
│   └── data/                   # 运行时数据（自动生成）
│       ├── lifetrace.db        # SQLite 数据库
│       ├── screenshots/        # 截图存储
│       ├── vector_db/          # 向量数据库存储
│       └── logs/               # 应用日志
├── free-todo-frontend/         # 新前端应用 (Next.js) ⭐
│   ├── app/                    # Next.js 应用目录
│   ├── apps/                   # 功能模块
│   │   ├── todo-list/          # 待办列表模块
│   │   ├── todo-detail/        # 待办详情模块
│   │   ├── chat/               # AI 聊天模块
│   │   ├── activity/           # 活动记录模块
│   │   ├── calendar/           # 日历模块
│   │   ├── settings/           # 设置模块
│   │   └── ...                 # 其他模块
│   ├── components/             # React 组件
│   ├── lib/                    # 工具和服务
│   ├── electron/               # Electron 桌面应用
│   ├── package.json            # 前端依赖
│   └── README.md               # 前端文档
├── frontend/                   # 旧前端应用（已弃用）⚠️
├── pyproject.toml              # Python 项目配置
├── uv.lock                     # uv 锁定文件
├── LICENSE                     # Apache 2.0 许可证
├── README.md                   # 英文 README
└── README_CN.md                # 中文 README（本文件）
```

## 贡献

FreeU 社区的存在离不开像您这样的众多友善志愿者。我们欢迎所有对社区的贡献，并很高兴欢迎您的加入。

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

与我们和其他 FreeU 用户联系！扫描下方二维码加入我们的社区群组：

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

[![Star History Chart](https://api.star-history.com/svg?repos=FreeU-group/LifeTrace&type=Timeline)](https://www.star-history.com/#FreeU-group/LifeTrace&Timeline)

## 许可证

版权所有 © 2025 FreeU.org

本仓库的内容受以下许可证约束：

• 计算机软件根据 [Apache License 2.0](LICENSE) 许可。
• 本项目中学习资源版权所有 © 2025 FreeU.org

### Apache License 2.0

根据 Apache License 2.0 版（"许可证"）授权；
除非遵守许可证，否则您不得使用此文件。
您可以在以下位置获取许可证副本：

    http://www.apache.org/licenses/LICENSE-2.0

除非适用法律要求或书面同意，否则根据许可证分发的软件是基于
"按原样"分发的，不附带任何明示或暗示的保证或条件。
有关许可证下的特定语言管理权限和限制，请参阅许可证。
