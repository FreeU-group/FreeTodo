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
- **Electron App**: Native desktop experience on Windows & macOS
- **System Integration**: Native notifications and system tray support

## System Architecture

FreeTodo adopts a **frontend-backend separation** architecture:

- **Backend**: FastAPI (Python) - Provides RESTful API (located in `lifetrace/` directory)
- **Frontend**: Next.js (React + TypeScript) - Modern web interface (located in `free-todo-frontend/` directory)
- **Data Layer**: SQLite + ChromaDB (for AI features)

## Quick Start

### Environment Requirements

**Backend**:

- Python 3.12
- Supported OS: Windows, macOS
- Optional: CUDA support (for GPU acceleration)

**Frontend**:

- Node.js 20+
- pnpm package manager

### Install Dependencies

This project uses [uv](https://github.com/astral-sh/uv) for fast and reliable dependency management.

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

**Install dependencies and sync environment:**

```bash
# Sync dependencies from pyproject.toml and uv.lock
uv sync

# Activate the virtual environment
# macOS/Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate
```

### Start the Backend Service

> **Note**: On first run, the system will automatically create `config.yaml` from `default_config.yaml` if it doesn't exist. You can customize your settings by editing `lifetrace/config/config.yaml`.

**Start the server:**

```bash
python -m lifetrace.server
```

> **Customize Prompts**: If you want to modify AI prompts for different features, you can edit `lifetrace/config/prompt.yaml`.

The backend service will automatically find an available port starting from `8001` (or `8100` for build version). If the default port is occupied, it will automatically use the next available port and display the actual port in the console.

- **Default Backend Port**: `http://localhost:8001`
- **API Documentation**: The actual API docs URL will be displayed in the console (typically `http://localhost:8001/docs`)

### Start the Frontend Service

The frontend is required to use FreeTodo. Start the frontend development server:

```bash
cd free-todo-frontend

pnpm install
pnpm dev
```

The frontend development server will:
- Automatically find an available port starting from `3001` (default port for development)
- Automatically detect the running FreeTodo backend port by checking the `/health` endpoint
- Set up API proxy to the detected backend port

The actual frontend URL and backend connection status will be displayed in the console. Once both services are running, open your browser and navigate to the displayed frontend URL (typically `http://localhost:3001`) to enjoy FreeTodo! 🎉

> **Note**: If ports are occupied, both frontend and backend will automatically find the next available ports. The console will show the actual ports being used.

For more details, see: [free-todo-frontend/README.md](free-todo-frontend/README.md)

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

---

> 💡 **Want to contribute?** Check out our [Contributing Guidelines](#contributing) and pick up any TODO item that interests you!

## Development Guide

### Project Structure

```
├── .github/                    # GitHub repository assets
│   ├── assets/                 # Static assets (images for README)
│   ├── BACKEND_GUIDELINES.md   # Backend development guidelines
│   ├── FRONTEND_GUIDELINES.md  # Frontend development guidelines
│   ├── CONTRIBUTING.md         # Contributing guidelines
│   └── ...                     # Other GitHub repository files
├── lifetrace/                  # Backend modules (FastAPI)
│   ├── server.py               # Web API service entry point
│   ├── config/                 # Configuration files
│   │   ├── config.yaml         # Main configuration (auto-generated)
│   │   ├── default_config.yaml # Default configuration template
│   │   ├── prompt.yaml         # AI prompt templates
│   │   └── rapidocr_config.yaml# OCR configuration
│   ├── routers/                # API route handlers
│   │   ├── chat.py             # Chat interface endpoints
│   │   ├── todo.py             # Todo endpoints
│   │   ├── task.py             # Task management endpoints
│   │   └── ...                 # Other endpoints
│   ├── schemas/                # Pydantic data models
│   ├── services/               # Business logic service layer
│   ├── repositories/           # Data access layer
│   ├── storage/                # Data storage layer
│   ├── llm/                    # LLM and AI services
│   ├── jobs/                   # Background jobs
│   ├── util/                   # Utility functions
│   └── data/                   # Runtime data (generated)
│       ├── lifetrace.db        # SQLite database
│       ├── vector_db/          # Vector database storage
│       └── logs/               # Application logs
├── free-todo-frontend/         # Frontend application (Next.js) ⭐
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
│   ├── electron/               # Electron desktop app
│   ├── package.json            # Frontend dependencies
│   └── README.md               # Frontend documentation
├── pyproject.toml              # Python project configuration
├── uv.lock                     # uv lock file
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
