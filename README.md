![LifeTrace Logo](.github/assets/lifetrace_logo.png)

![GitHub stars](https://img.shields.io/github/stars/FreeU-group/LifeTrace?style=social) ![GitHub forks](https://img.shields.io/github/forks/FreeU-group/LifeTrace?style=social) ![GitHub issues](https://img.shields.io/github/issues/FreeU-group/LifeTrace) ![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg) ![Python version](https://img.shields.io/badge/python-3.13+-blue.svg) ![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green.svg)

**Language**: [English](README.md) | [中文](README_CN.md)

[📖 Documentation](https://freeyou.club/lifetrace/introduction.html) • [🚀 Quick Start](#quick-start) • [💡 Features](#core-features) • [🔧 Development](#development-guide) • [🤝 Contributing](#contributing)

# LifeTrace - Intelligent Life Recording System

## Project Overview

`LifeTrace` is an AI-based intelligent life recording system that can automatically manage your personal task context. Through technologies such as automatic screenshots, OCR text recognition, vector retrieval, and multimodal search, LifeTrace helps you record, organize, and retrieve daily activity traces.

## Core Features

- **Automatic Screenshot Recording**: Timed automatic screen capture to record user activities
- **Intelligent OCR Recognition**: Uses RapidOCR to extract text content from screenshots
- **Smart Event Management**: Automatically aggregate screenshots into intelligent events based on context
- **Time Allocation Analysis**: Visualize app usage time distribution with 24-hour charts and app categorization
- **Information Retrieval**: Help users trace back and retrieve important information fragments from the past
- **Web API Service**: Provides complete RESTful API interfaces
- **Frontend Integration**: Supports integration with various frontend frameworks

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

<<<<<<< HEAD
### Database Migration

**Apply database migrations (first time skip this step):**

```bash
# Navigate to lifetrace directory
cd lifetrace

# Apply all migrations to the latest version
alembic upgrade head
```

### Start the Backend Service

=======
>>>>>>> e605d4d (feat(doc): add contributing, frontend and backend guidelines.)
**Start the server:**

```bash
python -m lifetrace.server
```

> **Customize Prompts**: If you want to modify AI prompts for different features, you can edit `lifetrace/config/prompt.yaml`.

The backend service will start at `http://localhost:8000`.

### Start the Frontend Service

The frontend is required to use LifeTrace. Start the frontend development server:

```bash
cd frontend

pnpm install
pnpm dev
```

The frontend development server will start at `http://localhost:3000`, with API requests automatically proxied to backend `:8000`.

Once both services are running, open your browser and navigate to `http://localhost:3000` to enjoy LifeTrace! 🎉

For more details, see: [frontend/README.md](frontend/README.md)

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

- ☑ **Core Infrastructure** - Basic screenshot recording and OCR functionality

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
├── lifetrace/                  # Core backend modules
│   ├── server.py               # Web API service
│   ├── alembic/                # Database migration tool
│   │   ├── env.py              # Alembic environment config
│   │   ├── script.py.mako      # Migration script template
│   │   └── README              # Alembic documentation
│   ├── alembic.ini             # Alembic configuration
│   ├── config/                 # Configuration files
│   │   ├── config.yaml         # Main configuration (auto-generated)
│   │   ├── default_config.yaml # Default configuration template
│   │   ├── prompt.yaml         # AI prompt templates
│   │   └── rapidocr_config.yaml# OCR configuration
│   ├── routers/                # API route handlers
│   │   ├── behavior.py         # User behavior endpoints
│   │   ├── chat.py             # Chat interface endpoints
│   │   ├── config.py           # Configuration endpoints
│   │   ├── context.py          # Context management endpoints
│   │   ├── cost_tracking.py    # Cost tracking endpoints
│   │   ├── dependencies.py     # Router dependencies
│   │   ├── event.py            # Event management endpoints
│   │   ├── health.py           # Health check endpoints
│   │   ├── logs.py             # Log management endpoints
│   │   ├── ocr.py              # OCR service endpoints
│   │   ├── project.py          # Project management endpoints
│   │   ├── rag.py              # RAG service endpoints
│   │   ├── scheduler.py        # Scheduler endpoints
│   │   ├── screenshot.py       # Screenshot endpoints
│   │   ├── search.py           # Search endpoints
│   │   ├── system.py           # System endpoints
│   │   ├── task.py             # Task management endpoints
│   │   ├── time_allocation.py  # Time allocation endpoints
│   │   └── vector.py           # Vector service endpoints
│   ├── schemas/                # Pydantic data models
│   │   ├── chat.py             # Chat models
│   │   ├── config.py           # Config models
│   │   ├── context.py          # Context models
│   │   ├── event.py            # Event models
│   │   ├── project.py          # Project models
│   │   ├── screenshot.py       # Screenshot models
│   │   ├── search.py           # Search models
│   │   ├── stats.py            # Statistics models
│   │   ├── system.py           # System models
│   │   ├── task.py             # Task models
│   │   └── vector.py           # Vector models
│   ├── storage/                # Data storage layer
│   │   ├── __init__.py         # Storage module init
│   │   ├── database_base.py    # Base database operations
│   │   ├── database.py         # Main database operations
│   │   ├── models.py           # SQLAlchemy models
│   │   ├── chat_manager.py     # Chat data management
│   │   ├── context_manager.py  # Context data management
│   │   ├── event_manager.py    # Event data management
│   │   ├── ocr_manager.py      # OCR data management
│   │   ├── project_manager.py  # Project data management
│   │   ├── screenshot_manager.py # Screenshot data management
│   │   ├── stats_manager.py    # Statistics data management
│   │   └── task_manager.py     # Task data management
│   ├── llm/                    # LLM and AI services
│   │   ├── llm_client.py       # LLM client wrapper
│   │   ├── event_summary_service.py # Event summarization
│   │   ├── rag_service.py      # RAG service
│   │   ├── retrieval_service.py# Retrieval service
│   │   ├── context_builder.py  # Context building
│   │   ├── vector_service.py   # Vector operations
│   │   └── vector_db.py        # Vector database
│   ├── jobs/                   # Background jobs
│   │   ├── job_manager.py      # Job management
│   │   ├── ocr.py              # OCR processing job
│   │   ├── recorder.py         # Screen recording job
│   │   ├── scheduler.py        # Job scheduler
│   │   ├── task_context_mapper.py # Task context mapping
│   │   ├── task_summary.py     # Task summarization
│   │   └── clean_data.py       # Data cleaning job
│   ├── util/                   # Utility functions
│   │   ├── app_utils.py        # Application utilities
│   │   ├── config.py           # Configuration utilities
│   │   ├── config_watcher.py   # Configuration file watcher
│   │   ├── llm_config_handler.py # LLM config handler
│   │   ├── logging_config.py   # Logging configuration
│   │   ├── prompt_loader.py    # Prompt loading utilities
│   │   ├── query_parser.py     # Query parsing
│   │   ├── token_usage_logger.py # Token usage tracking
│   │   └── utils.py            # General utilities
│   ├── models/                 # OCR model files
│   │   ├── ch_PP-OCRv4_det_infer.onnx
│   │   ├── ch_PP-OCRv4_rec_infer.onnx
│   │   └── ch_ppocr_mobile_v2.0_cls_infer.onnx
│   ├── devlog/                 # Development logs
│   │   ├── AUTO_ASSOCIATION_*.md
│   │   ├── CONFIG_CHANGE_*.md
│   │   ├── CONTEXT_MANAGEMENT_API.md
│   │   ├── PROJECT_*.md
│   │   ├── TASK_*.md
│   │   └── ...
│   └── data/                   # Runtime data (generated)
│       ├── lifetrace.db        # SQLite database
│       ├── scheduler.db        # Scheduler database
│       ├── screenshots/        # Screenshot storage
│       ├── vector_db/          # Vector database storage
│       └── logs/               # Application logs
├── frontend/                   # Frontend application (Next.js)
│   ├── app/                    # Next.js app directory
│   │   ├── page.tsx            # Home page
│   │   ├── layout.tsx          # Root layout
│   │   ├── globals.css         # Global styles
│   │   ├── app-usage/          # App usage page
│   │   ├── cost-tracking/      # Cost tracking page
│   │   ├── time-allocation/    # Time allocation page
│   │   ├── project-management/ # Project & task management
│   │   │   ├── page.tsx        # Projects list
│   │   │   └── [id]/           # Project details
│   │   │       ├── page.tsx    # Project overview
│   │   │       └── tasks.tsx   # Task management
│   │   └── scheduler/          # Scheduler page
│   ├── components/             # React components
│   │   ├── common/             # Common components
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Input.tsx
│   │   │   ├── Loading.tsx
│   │   │   ├── MessageContent.tsx
│   │   │   ├── Pagination.tsx
│   │   │   ├── ScreenshotIdButton.tsx
│   │   │   ├── SettingsModal.tsx
│   │   │   └── ThemeToggle.tsx
│   │   ├── context/            # Context components
│   │   │   ├── ContextCard.tsx
│   │   │   └── ContextList.tsx
│   │   ├── layout/             # Layout components
│   │   ├── project/            # Project components
│   │   ├── screenshot/         # Screenshot components
│   │   ├── search/             # Search components
│   │   │   └── SearchBar.tsx
│   │   ├── task/               # Task components
│   │   └── ui/                 # UI components
│   ├── lib/                    # Utilities and services
│   │   ├── api.ts              # API client
│   │   ├── types.ts            # TypeScript types
│   │   ├── utils.ts            # Utility functions
│   │   ├── toast.ts            # Toast notifications
│   │   ├── context/            # React contexts
│   │   └── store/              # State management
│   ├── devlog/                 # Frontend development logs
│   ├── public/                 # Static assets
│   │   └── app-icons/          # Application icons
│   ├── package.json            # Frontend dependencies
│   ├── pnpm-lock.yaml          # pnpm lock file
│   ├── next.config.ts          # Next.js configuration
│   ├── tsconfig.json           # TypeScript configuration
│   └── README.md               # Frontend documentation
├── pyproject.toml              # Python project configuration
├── uv.lock                     # uv lock file
├── LICENSE                     # Apache 2.0 License
├── README.md                   # This file (English)
└── README_CN.md                # Chinese README
```

## Contributing

The LifeTrace community is possible thanks to thousands of kind volunteers like you. We welcome all contributions to the community and are excited to welcome you aboard.

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

Connect with us and other LifeTrace users! Scan the QR codes below to join our community groups:

<table>
  <tr>
    <th>WeChat Group</th>
    <th>Feishu Group</th>
    <th>Xiaohongshu</th>
  </tr>
  <tr>
    <td align="center">
      <img src=".github/assets/wechat.jpg" alt="WeChat QR Code" width="200"/>
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

## Document

We use deepwiki to manage our docs, please ref to this [**website.**](https://deepwiki.com/FreeU-group/LifeTrace/6.2-deployment-and-setup)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=FreeU-group/LifeTrace&type=Timeline)](https://www.star-history.com/#FreeU-group/LifeTrace&Timeline)

## License

Copyright © 2025 LifeTrace.org

The content of this repository is bound by the following licenses:

• The computer software is licensed under the [Apache License 2.0](LICENSE).
• The learning resources in this project are copyright © 2025 LifeTrace.org

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
