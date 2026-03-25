![FreeTodo Logo](.github/assets/free_todo_banner.png)

![GitHub stars](https://img.shields.io/github/stars/FreeU-group/FreeTodo?style=social) ![GitHub forks](https://img.shields.io/github/forks/FreeU-group/FreeTodo?style=social) ![GitHub issues](https://img.shields.io/github/issues/FreeU-group/FreeTodo) [![License](https://img.shields.io/badge/license-FreeU%20Community-blue.svg)](LICENSE) ![Python version](https://img.shields.io/badge/python-3.12-blue.svg) ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)

**Language**: [English](README.md) | [中文](README_CN.md)

[📖 Documentation](https://freeyou.club/lifetrace/introduction.html) • [🚀 Quick Start](#quick-start) • [💡 Features](#core-features) • [🔧 Development](#development-guide) • [🤝 Contributing](#contributing)

# FreeTodo - Just Do It.

## Project Overview

**FreeTodo** is an AI-powered intelligent todo management application that helps you efficiently manage tasks, boost productivity, and achieve your goals. Through conversational AI interaction and smart task breakdown, FreeTodo transforms complex projects into actionable steps.

## Core Features

### 🤖 AI Smart Assistant
- **Intelligent Task Breakdown**: AI automatically decomposes complex tasks into manageable subtasks with a guided questionnaire flow
- **Smart Task Extraction**: Extract actionable todos from AI conversation responses
- **Context-Aware Suggestions**: AI provides task recommendations based on your current todo context
- **Personal Profile Memory**: Agno learning builds user profiles and long-term memory across sessions

### ✅ Comprehensive Task Management
- **Hierarchical Tasks**: Support for parent-child task relationships with unlimited nesting
- **Priority & Status**: Four priority levels (urgent/high/medium/low) and multiple status states
- **Tags & Categories**: Organize todos with custom tags for easy filtering
- **Deadline Management**: Set deadlines with visual reminders
- **Rich Notes**: Add detailed notes and descriptions to each todo

### 📅 Multi-View Calendar
- **Day/Week/Month Views**: Flexible calendar views to visualize your schedule
- **Drag & Drop Scheduling**: Easily drag todos to calendar slots to schedule them
- **Quick Todo Creation**: Create todos directly from calendar time slots

### 🎨 Modern User Interface
- **Multi-Panel Layout**: Customizable panel arrangement (Todos + Chat + Detail)
- **Dark/Light Themes**: Beautiful themes with multiple color schemes
- **Internationalization**: Full support for English and Chinese
- **Responsive Design**: Optimized for various screen sizes

### 💻 Desktop Application
- **Tauri App**: Web-mode desktop shell with a bundled Next.js frontend
- **System Integration**: Native notifications and system tray support

## System Architecture

FreeTodo adopts a **distributed multi-module** architecture with three core components:

- **Server** (`server/`): FastAPI (Python) - Center node deployed on cloud or local server, handling LLM processing, data storage, and business APIs
- **Client** (`client/`): Python perception daemon - Lightweight sensing agent running on local devices for screen capture, OCR recognition, and data forwarding
- **Frontend** (`frontend/`): Next.js (React + TypeScript) - Modern web interface with Tauri desktop packaging support

Desktop packaging notes:

- Recommended Tauri packaging command: `pnpm --dir frontend build:tauri:web:script:full`
- Packaging guide: `frontend/src-tauri/PACKAGING_GUIDE.md`

Supporting modules:

- **Phone** (`phone/`): Flutter mobile application
- **Hardware** (`hardware/`): Hardware device integration (omi, omiGlass, etc.)
- **Deploy** (`deploy/`): Docker Compose deployment configuration
- **Data Layer**: SQLite + ChromaDB (for AI features)

## Quick Start

### Environment Requirements

**Server & Client** (Python):

- Python 3.12
- Supported OS: Windows, macOS, Linux

**Frontend** (Node.js):

- Node.js 20+
- pnpm package manager

### Install Dependencies

This project uses [uv](https://github.com/astral-sh/uv) for Python dependency management. Each module has its own independent environment.

**Install uv:**

```bash
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"
```

> **Note**: After installation, `uv` may not be immediately available in the current terminal. To activate it in the current session:
>
> - **Windows (PowerShell)**: Run `$env:Path = "$env:USERPROFILE\.local\bin;$env:Path"` to refresh PATH
> - **macOS/Linux**: Run `exec $SHELL` to reinitialize your shell session, or restart your terminal
>
> Alternatively, you can simply open a new terminal window and `uv` will be available automatically.

**Install dependencies for each module:**

```bash
# Server dependencies
uv sync --directory server

# Client dependencies
uv sync --directory client

# Frontend dependencies
pnpm --dir frontend install
```

### Configure Environment Variables

Copy `.env.example` to `.env` for each module, then fill in your configuration:

```bash
# Server environment
cp server/.env.example server/.env

# Frontend environment
cp frontend/.env.example frontend/.env

# Client environment (for perception daemon)
cp client/.env.example client/.env
```

Edit `server/.env` and fill in the required keys:

```bash
# LLM API Key (required — AI features won't work without it)
LIFETRACE_LLM__API_KEY=your-api-key

# ASR speech recognition (optional)
LIFETRACE_AUDIO__ASR__API_KEY=your-asr-api-key

# Tavily search (optional)
LIFETRACE_TAVILY__API_KEY=your-tavily-api-key

# Gemini image generation for diary illustrations (optional)
LIFETRACE_BANNA2__API_KEY=your-gemini-api-key
```

> **Note**: `LIFETRACE_LLM__API_KEY` is **required**. By default the LLM base URL points to Alibaba Cloud DashScope (`qwen-plus`). You can switch to any OpenAI-compatible provider by changing `LIFETRACE_LLM__BASE_URL` and `LIFETRACE_LLM__MODEL`.

The Frontend `.env` defaults to `NEXT_PUBLIC_API_URL=http://localhost:8001`, which works for local development with no changes needed.

The Client `.env` sets the center node URL. For local development the default `CENTER_URL=http://localhost:8001` works as-is. For cloud deployment, change it to your server's public address. If `--center-url` is passed on the command line, it takes precedence over the `.env` value.

### Start All Services (One-Click)

For development, you can start **Server + AgentOS + Frontend** with a single script:

**macOS/Linux**

```bash
chmod +x scripts/start_all.sh
./scripts/start_all.sh
```

**Windows (PowerShell)**

```powershell
.\scripts\start_all.ps1
```

This starts all services (Server + AgentOS + Frontend + Client) in the background, with logs written to `.run-logs/`.

**Check service status:**

```bash
# macOS/Linux
bash scripts/status_all.sh

# Windows (PowerShell)
.\scripts\status_all.ps1
```

**Stop all services:**

```bash
# macOS/Linux
bash scripts/stop_all.sh

# Windows (PowerShell)
.\scripts\stop_all.ps1
```

### Start Services Separately

**1. Start the Server** (center node):

```bash
uv run --directory server python server.py
uv run --directory server python agent_os.py
```

**2. Start the Client** (perception daemon, optional):

```bash
# Uses CENTER_URL from client/.env by default
uv run --directory client python sensor.py

# Or specify the center URL explicitly
uv run --directory client python sensor.py --center-url http://localhost:8001 --node-id MY-PC
```

**3. Start the Frontend**:

```bash
pnpm --dir frontend dev
```

The actual frontend URL and backend connection status will be displayed in the console. Once both services are running, open your browser and navigate to the displayed frontend URL (typically `http://localhost:3001`) to enjoy FreeTodo!

### Deployment Guides

For detailed step-by-step deployment instructions, see:

- **[Local Deployment Guide](docs/guides/deployment/deploy_in_local.md)** — Deploy all services (Server + Frontend + Client) on your local machine, no Docker required
- **[Cloud Deployment Guide](docs/guides/deployment/deploy_in_cloud.md)** — Deploy Server to a cloud server with Docker, connect Frontend & Client from local machines

Quick Docker deployment (cloud):

```bash
# Build server image
make build-server

# Start services with Docker Compose
make start

# View logs
make logs
```

## 📋 TODO & Roadmap

> 📖 **Full Roadmap**: Check out the detailed [Project Roadmap](.github/ROADMAP.md) to learn about the complete vision and development plan of the FreeU project.

### 🎯 FreeU Overall Project Roadmap

#### 1. LifeTrace (v0.2 Completed)
- ✓ **Computer Activity Flow Construction**: Generate personal activity flows through screenshots
- 🔮 **Future Plans**: Audio acquisition, video environment, smart device integration, local LLM optimization

#### 2. Free Todo (v0.1 Currently In Progress)
- 🚧 **Current Focus**: Building the ultimate To-Do List
- 🎯 **Core Mission**: Fix user intentions, form personal context organization, lay the foundation for proactive services

#### 3. Proactive Service Phase (Future Planning)
- Provide proactive services based on LifeTrace data and Free Todo intentions

---

### 🚧 Free Todo Recent Plans (Focus on Input Layer)

**Goal**: Collect as much information as possible from users' daily lives and gather it as Todos

- 🎨 **UI Dynamic Island**
  - ☐ Control voice input and screenshot scheduled task switches
  - ☐ Provide convenient windows to access Todo list and conversation interface

- 🤖 **Agent Development**
  - 🚧 Develop AI tool scheduling capability
  - ☐ Upgrade from basic conversation to intelligent Agent supporting multiple tool calls

---

### 📐 Free Todo Three-Layer Roadmap

#### Input Layer: Reduce Input Burden, Thought-Stream-Like Capture
- ☐ Voice input (Dynamic Island, hotkey activation)
- ☐ Multimodal input (text, screenshots, voice)
- ☑ Social software integration (WeChat, Feishu todo capture)
- ☑ Intelligent message todo extraction

#### Intermediate Processing Layer: From "Chaos" to "Order"
- ☑ AI task breakdown ("big rocks" into "small stones")
- ☑ AI intent completion / task detail completion
- ☐ Automatic classification and organization
- ☐ Intelligent task priority planning
- ☑ Todo context construction
- ☑ Personal profile & memory (Agno Learning)

#### Output Layer: Psychological Security + Warm, Reliable Secretary Partner
- ☐ AI secretary personification
- ☐ Schedule reminders (currently in progress)
- ☐ Task focus mode (display only partial tasks)
- ☐ Completed task reinforcement (merit ledger)
- ☐ Overdue task re-planning

---

### 🔬 Features in Development

Free Todo's panel switch bar contains some panels that are currently under development. These panels showcase our future feature directions for community reference and understanding.

**🤝 Community Participation**: We warmly welcome community members to participate!
- 🎨 **Panel Contributions**: Contribute your own panel designs or propose improvement suggestions
- 🤖 **Agent Algorithm Contributions**: Contribute new Agent algorithms, we actively merge them!

---

### ✅ Recently Completed

- ☑ **AI Task Breakdown** - Intelligent task decomposition with questionnaire flow
- ☑ **Multi-Panel Interface** - Flexible layout with customizable panels
- ☑ **Calendar Integration** - Day/Week/Month views with drag-and-drop
- ☑ **Agno Learning Memory** - Personal profile and long-term memory across sessions

---

> 💡 **Want to contribute?** Check out our [Contributing Guidelines](#contributing) and pick up any TODO item that interests you!

## Development Guide

### Git Hooks (Pre-commit)

This repo uses a shared `.githooks/` directory. Hooks are configured automatically when you run
`pnpm install` in `frontend` or use the install scripts. If you cloned the repo without
running those, run the setup script once per clone/worktree:

```bash
# macOS/Linux
bash scripts/setup_hooks_here.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts/setup_hooks_here.ps1
```

> **Note**: Do not run `pre-commit install` here. The repo uses `core.hooksPath` and `pre-commit install` will refuse when it is set.

For details, see: [.github/PRE_COMMIT_GUIDE.md](.github/PRE_COMMIT_GUIDE.md)

### Project Structure

```
├── server/                     # Server — Center node (FastAPI backend)
│   ├── server.py               # FastAPI application entry point
│   ├── agent_os.py             # AgentOS entry point (Agno Agent service)
│   ├── pyproject.toml          # Server Python dependencies
│   ├── Dockerfile              # Docker build file
│   ├── config/                 # Configuration files
│   ├── core/                   # Core framework (module registry, DI, etc.)
│   ├── routers/                # API route handlers (~30 modules)
│   ├── schemas/                # Pydantic request/response models
│   ├── services/               # Business logic service layer
│   ├── repositories/           # Data access layer (Repository pattern)
│   ├── storage/                # Data storage layer
│   ├── llm/                    # LLM and AI services
│   ├── memory/                 # Memory management (Agno Learning)
│   ├── perception/             # Perception data processing
│   ├── jobs/                   # Background jobs
│   ├── migrations/             # Database migrations (Alembic)
│   ├── observability/          # Observability & tracing
│   └── util/                   # Utility functions
├── client/                     # Client — Perception daemon (lightweight sensing agent)
│   ├── sensor.py               # Main entry point for screen/OCR capture
│   ├── pyproject.toml          # Client Python dependencies
│   ├── config/                 # Client configuration
│   ├── perception/             # Perception models & logic
│   ├── proactive_ocr/          # Proactive OCR engine (macOS/Windows)
│   └── util/                   # Utility functions
├── frontend/                   # Frontend — Web & Desktop UI (Next.js + Electron)
│   ├── app/                    # Next.js app directory
│   ├── apps/                   # Feature modules
│   │   ├── todo-list/          # Todo list module
│   │   ├── todo-detail/        # Todo detail module
│   │   ├── chat/               # AI chat module
│   │   ├── calendar/           # Calendar module
│   │   ├── settings/           # Settings module
│   │   └── ...                 # Other modules
│   ├── components/             # React components
│   ├── lib/                    # Utilities and services
│   ├── electron/               # Electron desktop app wrapper
│   └── package.json            # Frontend dependencies
├── phone/                      # Mobile application (Flutter)
├── hardware/                   # Hardware device integration (omi, omiGlass)
├── deploy/                     # Docker Compose deployment
│   └── compose.yaml            # Container orchestration config
├── docs/                       # Architecture & design documents
├── scripts/                    # Utility scripts (startup, hooks, build)
├── .github/                    # GitHub assets, guidelines, CI
├── .githooks/                  # Repo-local git hooks
├── makefile                    # Docker build & deploy shortcuts
├── LICENSE                     # FreeU Community License
├── README.md                   # This file (English)
└── README_CN.md                # Chinese README
```

## Contributing

The FreeTodo community is possible thanks to thousands of kind volunteers like you. We welcome all contributions to the community and are excited to welcome you aboard.

**Recent Contributions:**

![GitHub contributors](https://img.shields.io/github/contributors/FreeU-group/LifeTrace) ![GitHub commit activity](https://img.shields.io/github/commit-activity/m/FreeU-group/LifeTrace) ![GitHub last commit](https://img.shields.io/github/last-commit/FreeU-group/LifeTrace)

### 📚 Contributing Guidelines

We have comprehensive contributing guidelines to help you get started:

- **[Contributing Guidelines](.github/CONTRIBUTING.md)** - Complete guide on how to contribute
- **[Backend Development Guidelines](.github/BACKEND_GUIDELINES.md)** - Python/FastAPI coding standards
- **[Frontend Development Guidelines](.github/FRONTEND_GUIDELINES.md)** - TypeScript/React coding standards

### 🚀 Quick Start for Contributors

1. **🍴 Fork the project** - Create your own copy of the repository
2. **🌿 Create a feature branch** - `git checkout -b feature/amazing-feature`
3. **💾 Commit your changes** - `git commit -m 'feat: add some amazing feature'`
4. **📤 Push to the branch** - `git push origin feature/amazing-feature`
5. **🔄 Create a Pull Request** - Submit your changes for review

### 🎯 Areas Where You Can Contribute

- 🐛 **Bug Reports** - Help us identify and fix issues
- 💡 **Feature Requests** - Suggest new functionality
- 📝 **Documentation** - Improve guides and tutorials
- 🧪 **Testing** - Write tests and improve coverage
- 🎨 **UI/UX** - Enhance the user interface
- 🔧 **Code** - Implement new features and improvements

### 🔰 Getting Started

- Check out our **[Contributing Guidelines](.github/CONTRIBUTING.md)** for detailed instructions
- Look for issues labeled `good first issue` or `help wanted`
- Follow **[Backend Guidelines](.github/BACKEND_GUIDELINES.md)** for Python/FastAPI development
- Follow **[Frontend Guidelines](.github/FRONTEND_GUIDELINES.md)** for TypeScript/React development
- Join our community discussions in Issues and Pull Requests

We appreciate all contributions, no matter how small! 🙏

## Join Our Community

Connect with us and other FreeTodo users! Scan the QR codes below to join our community groups:

<table>
  <tr>
    <th>WeChat Group</th>
    <th>Feishu Group</th>
    <th>Xiaohongshu</th>
  </tr>
  <tr>
    <td align="center">
      <img src=".github/assets/wechat.png" alt="WeChat QR Code" width="200"/>
      <br/>
      <em>Scan to join WeChat group</em>
    </td>
    <td align="center">
      <img src=".github/assets/feishu.png" alt="Feishu QR Code" width="200"/>
      <br/>
      <em>Scan to join Feishu group</em>
    </td>
    <td align="center">
      <img src=".github/assets/xhs.jpg" alt="Xiaohongshu QR Code" width="200"/>
      <br/>
      <em>Follow us on Xiaohongshu</em>
    </td>
  </tr>
</table>

## Documentation

We use deepwiki to manage our docs, please refer to this [**website.**](https://deepwiki.com/FreeU-group/LifeTrace/6.2-deployment-and-setup)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=FreeU-group/FreeTodo&type=Timeline)](https://www.star-history.com/#FreeU-group/FreeTodo&Timeline)

## License

Copyright © 2026 FreeU.org

FreeTodo is licensed under the **FreeU Community License**, which is based on Apache License 2.0 with additional conditions regarding commercial usage.

For detailed license terms, please see the [LICENSE](LICENSE) file.
