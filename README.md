![FreeU Logo](.github/assets/lifetrace_logo.png)

![GitHub stars](https://img.shields.io/github/stars/FreeU-group/LifeTrace?style=social) ![GitHub forks](https://img.shields.io/github/forks/FreeU-group/LifeTrace?style=social) ![GitHub issues](https://img.shields.io/github/issues/FreeU-group/LifeTrace) ![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg) ![Python version](https://img.shields.io/badge/python-3.13+-blue.svg) ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)

**Language**: [English](README.md) | [中文](README_CN.md)

[📖 Documentation](https://freeyou.club/lifetrace/introduction.html) • [🚀 Quick Start](#quick-start) • [💡 Features](#core-features) • [🔧 Development](#development-guide) • [🤝 Contributing](#contributing)

# FreeU - Your Personal AI Assistant

## Project Overview

`FreeU` is an AI-powered personal productivity assistant designed to help users better manage their daily life and work. Currently, two core modules have been completed:

- **FreeTodo (AI Todo)**: An intelligent task management system with AI-assisted todo creation, decomposition, and tracking
- **LifeTrace (Activity Recording)**: An intelligent life recording system that captures and retrieves daily activities through automatic screenshots, OCR recognition, and more

## Core Features

### FreeTodo - AI Todo
- **Smart Task Creation**: AI-assisted task creation and decomposition
- **Task Tracking**: Real-time tracking of task progress and status
- **Context Association**: Automatic association with related screenshots and activity context (Under Construction)

### LifeTrace - Activity Recording
- **Automatic Screenshot Recording**: Timed automatic screen capture to record user activities
- **Intelligent OCR Recognition**: Uses RapidOCR to extract text content from screenshots
- **Smart Event Management**: Automatically aggregate screenshots into intelligent events based on context
- **Time Allocation Analysis**: Visualize app usage time distribution with 24-hour charts and app categorization
- **Information Retrieval**: Help users trace back and retrieve important information fragments from the past

### Common Features
- **Web API Service**: Provides complete RESTful API interfaces
- **Modern Frontend**: Web interface with multiple themes and layouts

## System Architecture

FreeU adopts a **frontend-backend separation** architecture:

- **Backend**: FastAPI (Python) - Provides RESTful API (located in `lifetrace/` directory)
- **Frontend**: Next.js (React + TypeScript) - Modern web interface (located in `free-todo-frontend/` directory)
- **Data Layer**: SQLite + ChromaDB

> ⚠️ **Note**: The `frontend/` directory is the legacy frontend and has been deprecated. Please use `free-todo-frontend/` as the new frontend.

## Quick Start

### Environment Requirements

**Backend**:

- Python 3.13+
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

The backend service will start at `http://localhost:8000`.

- **API Documentation**: `http://localhost:8000/docs`

### Start the Frontend Service

The frontend is required to use FreeU. Start the frontend development server:

```bash
cd free-todo-frontend

pnpm install
pnpm dev
```

The frontend development server will start at `http://localhost:3000`, with API requests automatically proxied to backend `:8000`.

Once both services are running, open your browser and navigate to `http://localhost:3000` to enjoy FreeU! 🎉

For more details, see: [free-todo-frontend/README.md](free-todo-frontend/README.md)

## 📋 TODO & Roadmap

### 🚀 High Priority

- ☐ **User Experience Improvements**
  - ☐ Implement keyboard shortcuts for power users
  - ☐ Create interactive onboarding tutorial

### 💡 Future Ideas

- ☐ **Mobile & Cross-Platform**
  - ☐ Develop mobile companion app
  - ☐ Add tablet-optimized interface
  - ☐ Create web-based version

### ✅ Recently Completed

- ☑ **FreeTodo Module** - AI-powered smart todo management system
- ☑ **LifeTrace Module** - Basic screenshot recording and OCR functionality

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
│   │   ├── activity.py         # Activity management endpoints
│   │   ├── chat.py             # Chat interface endpoints
│   │   ├── todo.py             # Todo endpoints
│   │   ├── task.py             # Task management endpoints
│   │   ├── screenshot.py       # Screenshot endpoints
│   │   └── ...                 # Other endpoints
│   ├── schemas/                # Pydantic data models
│   ├── services/               # Business logic service layer
│   ├── repositories/           # Data access layer
│   ├── storage/                # Data storage layer
│   ├── llm/                    # LLM and AI services
│   ├── jobs/                   # Background jobs
│   ├── util/                   # Utility functions
│   ├── models/                 # OCR model files
│   └── data/                   # Runtime data (generated)
│       ├── lifetrace.db        # SQLite database
│       ├── screenshots/        # Screenshot storage
│       ├── vector_db/          # Vector database storage
│       └── logs/               # Application logs
├── free-todo-frontend/         # New frontend application (Next.js) ⭐
│   ├── app/                    # Next.js app directory
│   ├── apps/                   # Feature modules
│   │   ├── todo-list/          # Todo list module
│   │   ├── todo-detail/        # Todo detail module
│   │   ├── chat/               # AI chat module
│   │   ├── activity/           # Activity recording module
│   │   ├── calendar/           # Calendar module
│   │   ├── settings/           # Settings module
│   │   └── ...                 # Other modules
│   ├── components/             # React components
│   ├── lib/                    # Utilities and services
│   ├── electron/               # Electron desktop app
│   ├── package.json            # Frontend dependencies
│   └── README.md               # Frontend documentation
├── frontend/                   # Legacy frontend application (Deprecated) ⚠️
├── pyproject.toml              # Python project configuration
├── uv.lock                     # uv lock file
├── LICENSE                     # Apache 2.0 License
├── README.md                   # This file (English)
└── README_CN.md                # Chinese README
```

## Contributing

The FreeU community is possible thanks to thousands of kind volunteers like you. We welcome all contributions to the community and are excited to welcome you aboard.

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

Connect with us and other FreeU users! Scan the QR codes below to join our community groups:

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

[![Star History Chart](https://api.star-history.com/svg?repos=FreeU-group/LifeTrace&type=Timeline)](https://www.star-history.com/#FreeU-group/LifeTrace&Timeline)

## License

Copyright © 2025 FreeU.org

The content of this repository is bound by the following licenses:

• The computer software is licensed under the [Apache License 2.0](LICENSE).
• The learning resources in this project are copyright © 2025 FreeU.org

### Apache License 2.0

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
