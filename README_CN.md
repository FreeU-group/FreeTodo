
![LifeTrace Logo](.github/assets/lifetrace_logo.png)

![GitHub stars](https://img.shields.io/github/stars/FreeU-group/LifeTrace?style=social) ![GitHub forks](https://img.shields.io/github/forks/FreeU-group/LifeTrace?style=social) ![GitHub issues](https://img.shields.io/github/issues/FreeU-group/LifeTrace) ![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg) ![Python version](https://img.shields.io/badge/python-3.13+-blue.svg) ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)

**语言**: [English](README.md) | [中文](README_CN.md)

[📖 文档](https://freeyou.club/lifetrace/introduction.html) • [🚀 快速开始](#快速开始) • [💡 功能特性](#核心功能) • [🔧 开发指南](#开发指南) • [🤝 贡献指南](#贡献)

# LifeTrace - 智能生活记录系统

## 项目概述

`LifeTrace` 是一个基于 AI 的智能生活记录系统，可以自动管理您的个人任务上下文。通过自动截图、OCR 文本识别、向量检索和多模态搜索等技术，LifeTrace 帮助您记录、组织和检索日常活动轨迹。

## 核心功能

- **自动截图记录**：定时自动屏幕捕获，记录用户活动
- **智能 OCR 识别**：使用 RapidOCR 从截图中提取文本内容
- **智能事件管理**：基于上下文自动将截图聚合为智能事件
- **时间分配分析**：可视化展示应用使用时间分布，支持24小时分布图表和应用分类
- **信息回溯检索**：帮助用户回溯和检索过去重要的信息碎片
- **Web API 服务**：提供完整的 RESTful API 接口
- **前端集成**：支持与各种前端框架集成

## 系统架构

LifeTrace 采用**前后端分离**架构：

- **后端**: FastAPI (Python) - 提供 RESTful API
- **前端**: Next.js (React + TypeScript) - 现代化 Web 界面
- **数据层**: SQLite + ChromaDB

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

前端是使用 LifeTrace 的必需组件。启动前端开发服务器：

```bash
cd frontend

pnpm install
pnpm dev
```

前端开发服务器将在 `http://localhost:3000` 启动，API 请求会自动代理到后端 `:8000`。

服务启动后，在浏览器中访问 `http://localhost:3000` 开始使用 LifeTrace！🎉

详细说明请参考：[frontend/README.md](frontend/README.md)

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

- ☑ **核心基础设施** - 基础截图记录和 OCR 功能

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
├── lifetrace/                  # 核心后端模块
│   ├── server.py               # Web API 服务
│   ├── alembic/                # 数据库迁移工具
│   │   ├── env.py              # Alembic 环境配置
│   │   ├── script.py.mako      # 迁移脚本模板
│   │   └── README              # Alembic 文档
│   ├── alembic.ini             # Alembic 配置文件
│   ├── config/                 # 配置文件
│   │   ├── config.yaml         # 主配置文件（自动生成）
│   │   ├── default_config.yaml # 默认配置模板
│   │   ├── prompt.yaml         # AI 提示词模板
│   │   └── rapidocr_config.yaml# OCR 配置
│   ├── routers/                # API 路由处理器
│   │   ├── behavior.py         # 用户行为端点
│   │   ├── chat.py             # 聊天接口端点
│   │   ├── config.py           # 配置端点
│   │   ├── context.py          # 上下文管理端点
│   │   ├── cost_tracking.py    # 成本追踪端点
│   │   ├── dependencies.py     # 路由依赖项
│   │   ├── event.py            # 事件管理端点
│   │   ├── health.py           # 健康检查端点
│   │   ├── logs.py             # 日志管理端点
│   │   ├── ocr.py              # OCR 服务端点
│   │   ├── project.py          # 项目管理端点
│   │   ├── rag.py              # RAG 服务端点
│   │   ├── scheduler.py        # 调度器端点
│   │   ├── screenshot.py       # 截图端点
│   │   ├── search.py           # 搜索端点
│   │   ├── system.py           # 系统端点
│   │   ├── task.py             # 任务管理端点
│   │   ├── time_allocation.py  # 时间分配端点
│   │   └── vector.py           # 向量服务端点
│   ├── schemas/                # Pydantic 数据模型
│   │   ├── chat.py             # 聊天模型
│   │   ├── config.py           # 配置模型
│   │   ├── context.py          # 上下文模型
│   │   ├── event.py            # 事件模型
│   │   ├── project.py          # 项目模型
│   │   ├── screenshot.py       # 截图模型
│   │   ├── search.py           # 搜索模型
│   │   ├── stats.py            # 统计模型
│   │   ├── system.py           # 系统模型
│   │   ├── task.py             # 任务模型
│   │   └── vector.py           # 向量模型
│   ├── storage/                # 数据存储层
│   │   ├── __init__.py         # 存储模块初始化
│   │   ├── database_base.py    # 基础数据库操作
│   │   ├── database.py         # 主数据库操作
│   │   ├── models.py           # SQLAlchemy 模型
│   │   ├── chat_manager.py     # 聊天数据管理
│   │   ├── context_manager.py  # 上下文数据管理
│   │   ├── event_manager.py    # 事件数据管理
│   │   ├── ocr_manager.py      # OCR 数据管理
│   │   ├── project_manager.py  # 项目数据管理
│   │   ├── screenshot_manager.py # 截图数据管理
│   │   ├── stats_manager.py    # 统计数据管理
│   │   └── task_manager.py     # 任务数据管理
│   ├── llm/                    # LLM 和 AI 服务
│   │   ├── llm_client.py       # LLM 客户端封装
│   │   ├── event_summary_service.py # 事件摘要
│   │   ├── rag_service.py      # RAG 服务
│   │   ├── retrieval_service.py# 检索服务
│   │   ├── context_builder.py  # 上下文构建
│   │   ├── vector_service.py   # 向量操作
│   │   └── vector_db.py        # 向量数据库
│   ├── jobs/                   # 后台任务
│   │   ├── job_manager.py      # 任务管理
│   │   ├── ocr.py              # OCR 处理任务
│   │   ├── recorder.py         # 屏幕录制任务
│   │   ├── scheduler.py        # 任务调度器
│   │   ├── task_context_mapper.py # 任务上下文映射
│   │   ├── task_summary.py     # 任务摘要
│   │   └── clean_data.py       # 数据清理任务
│   ├── util/                   # 工具函数
│   │   ├── app_utils.py        # 应用工具
│   │   ├── config.py           # 配置工具
│   │   ├── config_watcher.py   # 配置文件监听器
│   │   ├── llm_config_handler.py # LLM 配置处理器
│   │   ├── logging_config.py   # 日志配置
│   │   ├── prompt_loader.py    # 提示词加载工具
│   │   ├── query_parser.py     # 查询解析
│   │   ├── token_usage_logger.py # Token 使用跟踪
│   │   └── utils.py            # 通用工具
│   ├── models/                 # OCR 模型文件
│   │   ├── ch_PP-OCRv4_det_infer.onnx
│   │   ├── ch_PP-OCRv4_rec_infer.onnx
│   │   └── ch_ppocr_mobile_v2.0_cls_infer.onnx
│   ├── devlog/                 # 开发日志
│   │   ├── AUTO_ASSOCIATION_*.md
│   │   ├── CONFIG_CHANGE_*.md
│   │   ├── CONTEXT_MANAGEMENT_API.md
│   │   ├── PROJECT_*.md
│   │   ├── TASK_*.md
│   │   └── ...
│   └── data/                   # 运行时数据（自动生成）
│       ├── lifetrace.db        # SQLite 数据库
│       ├── scheduler.db        # 调度器数据库
│       ├── screenshots/        # 截图存储
│       ├── vector_db/          # 向量数据库存储
│       └── logs/               # 应用日志
├── frontend/                   # 前端应用 (Next.js)
│   ├── app/                    # Next.js 应用目录
│   │   ├── page.tsx            # 主页
│   │   ├── layout.tsx          # 根布局
│   │   ├── globals.css         # 全局样式
│   │   ├── app-usage/          # 应用使用页面
│   │   ├── cost-tracking/      # 成本追踪页面
│   │   ├── time-allocation/    # 时间分配页面
│   │   ├── project-management/ # 项目和任务管理
│   │   │   ├── page.tsx        # 项目列表
│   │   │   └── [id]/           # 项目详情
│   │   │       ├── page.tsx    # 项目概览
│   │   │       └── tasks.tsx   # 任务管理
│   │   └── scheduler/          # 调度器页面
│   ├── components/             # React 组件
│   │   ├── common/             # 通用组件
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Loading.tsx
│   │   │   ├── MessageContent.tsx
│   │   │   ├── Pagination.tsx
│   │   │   ├── ScreenshotIdButton.tsx
│   │   │   ├── SettingsModal.tsx
│   │   │   └── ThemeToggle.tsx
│   │   ├── context/            # 上下文组件
│   │   │   ├── ContextCard.tsx
│   │   │   └── ContextList.tsx
│   │   ├── layout/             # 布局组件
│   │   ├── project/            # 项目组件
│   │   ├── screenshot/         # 截图组件
│   │   ├── search/             # 搜索组件
│   │   │   └── SearchBar.tsx
│   │   ├── task/               # 任务组件
│   │   └── ui/                 # UI 组件
│   ├── lib/                    # 工具和服务
│   │   ├── api.ts              # API 客户端
│   │   ├── types.ts            # TypeScript 类型
│   │   ├── utils.ts            # 工具函数
│   │   ├── toast.ts            # 消息提示
│   │   ├── context/            # React 上下文
│   │   └── store/              # 状态管理
│   ├── devlog/                 # 前端开发日志
│   ├── public/                 # 静态资源
│   │   └── app-icons/          # 应用图标
│   ├── package.json            # 前端依赖
│   ├── pnpm-lock.yaml          # pnpm 锁定文件
│   ├── next.config.ts          # Next.js 配置
│   ├── tsconfig.json           # TypeScript 配置
│   └── README.md               # 前端文档
├── pyproject.toml              # Python 项目配置
├── uv.lock                     # uv 锁定文件
├── LICENSE                     # Apache 2.0 许可证
├── README.md                   # 英文 README
└── README_CN.md                # 中文 README（本文件）
```

## 贡献

LifeTrace 社区的存在离不开像您这样的众多友善志愿者。我们欢迎所有对社区的贡献，并很高兴欢迎您的加入。

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

与我们和其他 LifeTrace 用户联系！扫描下方二维码加入我们的社区群组：

<table>
  <tr>
    <th>微信群</th>
    <th>飞书群</th>
    <th>小红书</th>
  </tr>
  <tr>
    <td align="center">
      <img src=".github/assets/wechat.jpg" alt="微信二维码" width="200"/>
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

版权所有 © 2025 LifeTrace.org

本仓库的内容受以下许可证约束：

• 计算机软件根据 [Apache License 2.0](LICENSE) 许可。
• 本项目中学习资源版权所有 © 2025 LifeTrace.org

### Apache License 2.0

根据 Apache License 2.0 版（"许可证"）授权；
除非遵守许可证，否则您不得使用此文件。
您可以在以下位置获取许可证副本：

    http://www.apache.org/licenses/LICENSE-2.0

除非适用法律要求或书面同意，否则根据许可证分发的软件是基于
"按原样"分发的，不附带任何明示或暗示的保证或条件。
有关许可证下的特定语言管理权限和限制，请参阅许可证。
