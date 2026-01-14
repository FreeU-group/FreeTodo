# Backend Development Quick Commands (lifetrace version)

## Tech Stack Information

- **Framework**: FastAPI + Uvicorn (async web framework)
- **Language**: Python 3.12
- **ORM**: SQLAlchemy 2.x + SQLModel
- **Database Migration**: Alembic
- **Data Validation**: Pydantic 2.x
- **Configuration Management**: Dynaconf (supports YAML hot reload)
- **Logging**: Loguru
- **Scheduler**: APScheduler (background task scheduling)
- **OCR**: RapidOCR (local OCR recognition)
- **Vector Database**: ChromaDB (optional, for semantic search)
- **Text Embedding**: sentence-transformers (optional)
- **LLM**: OpenAI-compatible API
- **Package Manager**: uv (recommended)
- **Code Quality**: Ruff (lint/format/check)

---

## 🏗️ Project Architecture

```
lifetrace/
├── server.py                 # FastAPI application entry point
├── config/                   # Configuration files directory
│   ├── config.yaml          # User configuration
│   ├── default_config.yaml  # Default configuration
│   └── prompt.yaml          # LLM Prompt templates
├── routers/                  # API routing layer
├── services/                 # Business service layer
├── repositories/             # Data access layer (Repository pattern)
├── schemas/                  # Pydantic data models
├── storage/                  # Data storage layer (SQLAlchemy models)
├── llm/                      # LLM and AI services
├── jobs/                     # Background tasks
├── core/                     # Core dependencies and lazy-loaded services
└── util/                     # Utility functions
```

### Layered Architecture Overview

- **Router Layer**: Handles HTTP requests, parameter validation, calls Service layer
- **Service Layer**: Business logic, orchestrates multiple Repository operations
- **Repository Layer**: Data access abstraction, encapsulates database queries
- **Schema Layer**: Request/response Pydantic models
- **Storage Layer**: SQLAlchemy ORM model definitions

---

## 🔧 Route Development

### Creating New API Routes

Create new routes in the `lifetrace/routers/` directory:
- Use `APIRouter` to define route prefixes and tags
- Follow RESTful API design principles
- Use dependency injection to get database sessions
- Add complete type annotations and docstrings

### RESTful Route Conventions

- `GET /api/{resource}` - Get list
- `GET /api/{resource}/{id}` - Get single resource
- `POST /api/{resource}` - Create resource
- `PUT /api/{resource}/{id}` - Full update
- `PATCH /api/{resource}/{id}` - Partial update
- `DELETE /api/{resource}/{id}` - Delete resource

### Registering Routes

Import and register new routes in `server.py`:
- Use `app.include_router(xxx.router)` to register
- Routes organized by functional modules

---

## 📦 Data Models

### Pydantic Schema Conventions

Create data models in the `lifetrace/schemas/` directory:
- Use Pydantic v2 syntax
- Distinguish models for different scenarios: `Create`, `Update`, `Response`, etc.
- Use `Field()` to add validation rules and descriptions
- Enable `model_config = ConfigDict(from_attributes=True)` to support ORM conversion

### Common Model Patterns

- `{Resource}Create` - Request body for creation
- `{Resource}Update` - Request body for updates (fields typically Optional)
- `{Resource}Response` - API response format
- `{Resource}List` - List response (includes pagination info)

### SQLAlchemy Model Conventions

Define database tables in `lifetrace/storage/models.py`:
- Use SQLAlchemy 2.x declarative syntax
- Add indexes for commonly queried fields
- Use relationships to define table associations
- Add `created_at` and `updated_at` timestamp fields

---

## 🗄️ Repository Layer

### Creating Repositories

Create data access classes in the `lifetrace/repositories/` directory:
- Inherit or implement interfaces defined in `interfaces.py`
- Encapsulate all database query logic
- Use async methods (`async def`)
- Support parameterized queries to prevent SQL injection

### Repository Naming Conventions

- `sql_{resource}_repository.py` - SQL database implementation
- Class names use `{Resource}Repository` format

---

## 🎯 Service Layer

### Creating Services

Create business services in the `lifetrace/services/` directory:
- Implement complex business logic
- Orchestrate multiple Repository operations
- Handle transaction boundaries
- Call external services (LLM, OCR, etc.)

### Service Conventions

- Class names use `{Resource}Service` format
- Get Repository instances through dependency injection
- Use custom Exception classes for business exceptions
- Add detailed logging

---

## 🤖 LLM Services

### LLM Client Usage

The project uses OpenAI-compatible APIs, encapsulated via `llm/llm_client.py`:
- Supports Alibaba Cloud Tongyi Qianwen, OpenAI, Claude, etc.
- Configuration managed through the `llm` section in `config/config.yaml`
- Supports streaming responses (SSE)

### RAG Service

`llm/rag_service.py` provides Retrieval-Augmented Generation:
- Smart time parsing (e.g., "last week", "yesterday")
- Hybrid retrieval strategy (vector search + full-text search)
- Context compression and ranking

### Prompt Management

Prompt templates are stored in `config/prompt.yaml`:
- Use YAML format for easy maintenance
- Support variable interpolation
- Organized by functional modules

---

## ⏰ Background Tasks

### Task Scheduling

Use APScheduler to manage background tasks:
- Tasks defined in `lifetrace/jobs/` directory
- Managed uniformly through `job_manager.py`
- Supports scheduled tasks and interval tasks

### Task Types

- **recorder**: Screen recorder, scheduled screenshots
- **ocr**: OCR processor, processes screenshots awaiting recognition

---

## ⚙️ Configuration Management

### Configuration File Structure

- `config/default_config.yaml` - Default configuration (do not modify)
- `config/config.yaml` - User configuration (overrides default values)
- Uses Dynaconf to support configuration hot reload

### Accessing Configuration

Access through the `settings` object in `util/settings.py`:
- `settings.server.port` - Access nested configuration
- `settings.get("key", default)` - Access with default value

### Configuration Hot Reload

The following configurations support hot reload (no restart required):
- LLM configuration
- Recording configuration
- OCR configuration

---

## 📝 Logging

### Using Loguru

Import logger from `util/logging_config.py`:
- `logger.info()` - General information
- `logger.warning()` - Warning information
- `logger.error()` - Error information
- `logger.debug()` - Debug information

### Logging Conventions

- Critical operations must be logged
- Exceptions must log full stack traces
- Sensitive information (API Keys, etc.) must be sanitized
- Use structured logging for easier analysis

---

## 🗃️ Database Migration

### Using Alembic

The project uses Alembic to manage database migrations:
- Configuration file: `alembic.ini`
- Migration scripts: `migrations/versions/`

### Common Commands

- `alembic revision --autogenerate -m "description"` - Generate migration script
- `alembic upgrade head` - Apply all migrations
- `alembic downgrade -1` - Rollback one version
- `alembic history` - View migration history

---

## 🧪 Code Quality

### Ruff Checking and Formatting

The project uses Ruff for code checking and formatting:
- `uv run ruff check .` - Check code
- `uv run ruff check --fix .` - Auto-fix issues
- `uv run ruff format .` - Format code

### Code Standards

- Follow PEP 8 style guide
- Maximum 100 characters per line
- Maximum 500 lines per file (warning threshold 700 lines)
- Maximum 50 statements per function
- Cyclomatic complexity should not exceed 15

---

## 🔐 Error Handling

### HTTP Exceptions

Use FastAPI's `HTTPException`:
- `400` - Request parameter error
- `404` - Resource not found
- `422` - Validation error (automatically handled by Pydantic)
- `500` - Internal server error

### Exception Handling Conventions

- Catch specific exceptions, avoid catching all exceptions
- Log errors with context
- Return user-friendly error messages
- Do not expose sensitive information to clients

---

## 🚀 Performance Optimization

### Database Query Optimization

- Use `selectinload` to avoid N+1 queries
- Add indexes for commonly queried fields
- Use pagination to limit returned data
- Use batch operations instead of looping single operations

### Async Processing

- Use `async/await` for I/O operations
- Use async sessions for database queries
- Use async clients for external API calls

### Lazy Loading

- Large services (vector service, OCR) use lazy loading
- Initialize on-demand through `core/lazy_services.py`
- Avoid loading all dependencies at startup

---

## 📡 API and Frontend Interaction

### Naming Style Conversion

Backend uses `snake_case`, frontend uses `camelCase`:
- Frontend fetcher automatically converts
- Backend Schema uniformly uses `snake_case`
- OpenAPI Schema automatically generated by FastAPI

### Frontend Code Generation

Frontend uses Orval to automatically generate API code from OpenAPI Schema:
- After backend API changes, frontend runs `pnpm orval` to regenerate
- Ensure OpenAPI Schema is complete and accurate

---

## 📋 Dependency Management

### Using uv

The project uses uv as package manager:
- `uv sync` - Sync dependencies
- `uv add <package>` - Add dependency
- `uv remove <package>` - Remove dependency
- `uv run <command>` - Run command in virtual environment

### Dependency Groups

- Main dependencies: `dependencies` in `pyproject.toml`
- Development dependencies: `dependency-groups.dev`
- Optional dependencies: `dependency-groups.vector` (vector search functionality)

---

## 🔍 Debugging and Troubleshooting

### Starting Development Server

- `python -m lifetrace.server` - Direct start
- `uvicorn lifetrace.server:app --reload` - Hot reload mode

### API Documentation

- Swagger UI: `http://localhost:8001/docs`
- ReDoc: `http://localhost:8001/redoc`
- OpenAPI JSON: `http://localhost:8001/openapi.json`

### Log Viewing

- Log files located at `lifetrace/data/logs/`
- View via API: `GET /api/logs`
- Adjust log level: modify `logging.level` in `config/config.yaml`

---

## ✅ Code Review Checklist

Before submitting code, ensure:

- [ ] Code follows PEP 8 style guide
- [ ] Running `uv run ruff check .` produces no errors
- [ ] Running `uv run ruff format .` to format code
- [ ] All functions and classes have type annotations
- [ ] All public functions and classes have docstrings
- [ ] Appropriate error handling has been added
- [ ] Parameterized queries are used to prevent SQL injection
- [ ] Necessary logging has been added
- [ ] Relevant documentation has been updated
- [ ] API changes are reflected in OpenAPI Schema
