# Repository Guidelines

This file mirrors the repo-level working rules from `AGENTS.md` for tools that only load `CLAUDE.md`.

## Project Structure & Module Organization
- `server/`: FastAPI backend for APIs, LLM orchestration, storage, jobs, and core services.
- `server/config/`: server runtime configuration. `config.yaml` is generated from `default_config.yaml`.
- `server/migrations/`: Alembic migrations for the backend database schema.
- `server/tests/`: backend test suite.
- `client/`: Python perception client for screen capture, OCR, and local sensing.
- `client/config/`: client runtime configuration. `config.yaml` is generated from `default_config.yaml`.
- `frontend/`: Next.js + React + TypeScript frontend, with Electron/Tauri desktop packaging support.
- `deploy/`: deployment assets such as Docker Compose configuration.
- `hardware/`: hardware integration code.
- `phone/`: mobile application code.
- `docs/`: living project documentation. Keep module overviews, architecture notes, usage guides, and collaboration-facing context here so future agents and developers can understand each area quickly.
- `.github/`: contribution docs, templates, and repository assets.

## Documentation First Workflow
- Always read the relevant files in `docs/` before making changes to a module, feature, or workflow. Treat `docs/` as required context, not optional reference material.
- Every commit must include a documentation change in `docs/`: either create a new doc for new functionality or update an existing doc for changed behavior. In most cases, updating an existing doc is preferred.
- Documentation updates should explain the current state of the module or workflow in practical terms: what it is for, how it is used, key interfaces, important constraints, and any behavior that changed.
- Keep docs written for collaborators. Prefer concise, scannable pages that help another developer or agent understand a module without re-reading the whole codebase.
- If code changes and documentation is not updated yet, the work is not complete and should not be committed.

## Build, Test, and Development Commands
Python environments:
- This repo has two separate Python projects with separate `uv` environments: `server/` and `client/`.
- Install server deps with `uv sync --directory server`.
- Install client deps with `uv sync --directory client`.
- Run server commands with `uv run --directory server ...`.
- Run client commands with `uv run --directory client ...`.
- Do not assume a repo-root `.venv` contains the correct dependencies for all modules.

Backend (`server/`):
- `uv sync --directory server` - install backend dependencies.
- `uv run --directory server python server.py` - start the FastAPI server.
- `uv run --directory server python agent_os.py` - start the AgentOS process used by Agno mode.
- `uv run --directory server ruff check .` - lint backend code.
- `uv run --directory server ruff format .` - format backend code.
- `uv run --directory server pytest` - run backend tests.

Client (`client/`):
- `uv sync --directory client` - install client dependencies.
- `uv run --directory client python sensor.py --center-url http://localhost:8001 --node-id MY-PC` - start the local perception client.
- `uv run --directory client ruff check .` - lint client code.
- `uv run --directory client pytest` - run client tests if present.

Frontend (`frontend/`):
- `pnpm --dir frontend install` - install frontend dependencies.
- `pnpm --dir frontend dev` - start the frontend dev server.
- `pnpm --dir frontend lint` - run frontend linting.
- `pnpm --dir frontend format` - format frontend files.
- `pnpm --dir frontend check` - run Biome checks.
- `pnpm --dir frontend type-check` - run TypeScript checks.

Packaging:
- `pnpm --dir frontend electron:build` - build the Electron app.
- `pnpm --dir frontend electron:build-win|mac|linux` - build Electron for a target platform.
- `pnpm --dir frontend tauri:dev` - run the Tauri dev flow.
- `pnpm --dir frontend tauri:build` - build the Tauri app.

## Coding Style & Naming Conventions
- Python: PEP 8, type hints, docstrings, and Ruff formatting with 4-space indentation and 100-char lines.
- TypeScript: Biome handles formatting and linting; prefer functional components and hooks-safe patterns.
- Naming: use Conventional Commit scopes such as `backend`, `client`, `frontend`, `ui`, and `config`.

## Testing Guidelines
- Backend tests live under `server/tests/`.
- Client tests should live under `client/tests/` if added later.
- Use `uv run --directory server pytest` for backend tests.
- Use `uv run --directory client pytest` for client tests when applicable.
- Use `pnpm --dir frontend type-check` and `pnpm --dir frontend check` as the current frontend validation baseline.

## Commit & Pull Request Guidelines
- Commit messages follow Conventional Commits.
- Example: `feat(frontend): add calendar drag and drop`.
- In worktrees, make small, frequent commits. After each small feature change and relevant checks pass, create a commit immediately.
- Treat each self-contained code change as its own commit so review and rollback stay simple.
- Before every commit, review the affected `docs/` page and stage a doc addition or update alongside the code change.
- If all pending changes are committed, notify the user or collaborating agent that the commit is done.
- PRs should include a clear description, linked issues such as `Closes #123`, testing notes, and screenshots for UI changes.
- Use the `.github` PR template when available.

## Parallel Worktrees (Required for Concurrent Tasks)
- When working on multiple tasks in parallel, always use `git worktree` so each task has its own working directory, dependencies, and commits.
- Do not hardcode absolute paths or project names. Derive paths from the git repo root.
- Default worktree base directory is `<repo-parent>/_worktrees/<repo-name>/<task-slug>`.
- Keep the main worktree clean; each task should use its own branch and worktree.
- Each task must create a brand-new branch and must not reuse an old one.
- Branch naming must follow `<type>/<user>/<short-task>`.
- `type` should be lowercase, such as `feat`, `chore`, `fix`, `hotfix`, or `refactor`.
- `user` should come from the current git username.
- `short-task` should be a short summary with at most 3 words.
- If a task name is provided, create the worktree first and then make changes in that worktree.
- Keep task branches in sync with the intended mainline branch.
- Do not assume the mainline branch is `main` or `master`.
- Do not assume the default remote is `origin`.
- Prefer syncing against a user-specified local mainline branch such as `dev`.
- If no mainline branch is specified, ask the user which local branch to track.

## Worktree Dependencies (Local Install)
- Each worktree should create and use its own environments.
- Backend: run `uv sync --directory server`.
- Client: run `uv sync --directory client`.
- Frontend: run `pnpm --dir frontend install`.
- Avoid sharing `.venv` or `node_modules` across worktrees.

## Integration When Main Is Dirty
- Keep coding in task worktrees and do not commit on a dirty main worktree.
- Create a clean integration worktree and cherry-pick task commits into it.
- Run checks from the integration worktree using its own dependencies before merging.

## Security & Configuration Tips
- Do not commit `server/config/config.yaml` or `client/config/config.yaml`.
- Do not commit runtime data, local databases, logs, or secrets.
- Keep API keys and secrets in local config files or environment variables only.
