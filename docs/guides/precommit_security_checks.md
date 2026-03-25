# Pre-commit Security Checks

## Current Python Security Hook

- Pre-commit now enables a local `bandit` hook for Python files under `server/`, `client/`, `cli/`, and `scripts/`.
- The hook runs from repo root with the server toolchain via `uv run --project server --no-sync bandit -c bandit.yaml`.
- `bandit.yaml` excludes generated or local runtime directories such as `.venv`, `build`, `dist`, and migration version folders.

## Current Python Line-count Hook

- The Python line-count hook also covers `server/`, `client/`, `cli/`, and `scripts/`.
- It excludes local environment and build folders such as `server/.venv`, `client/.venv`, `cli/.venv`, `build/`, and `dist/`.

## Usage

- Run all security checks with `pre-commit run bandit --all-files`.
- Run Bandit directly with `uv run --project server --no-sync bandit -c bandit.yaml -r server scripts`.
- Fix or explicitly document acceptable findings before committing backend changes.
