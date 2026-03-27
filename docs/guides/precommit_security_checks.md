# Pre-commit Security Checks

## Current Python Security Hook

- Pre-commit now enables a local `bandit` hook for Python files under `server/`, `client/`, `cli/`, and `scripts/`.
- The hook runs from repo root with the server toolchain via `uv run --project server --no-sync bandit -c bandit.yaml`.
- `bandit.yaml` excludes generated or local runtime directories such as `.venv`, `build`, `dist`, migration version folders, and test directories that intentionally use plain `assert`.

## Current Python Line-count Hook

- The Python line-count hook also covers `server/`, `client/`, `cli/`, and `scripts/`.
- It excludes local environment and build folders such as `server/.venv`, `client/.venv`, `cli/.venv`, `build/`, and `dist/`.

## Security Defaults

- The default bind host for local server and AgentOS settings is now `127.0.0.1`.
- Scripts that expose local helper APIs also default to loopback and require explicit override for external access.

## Usage

- Run all security checks with `pre-commit run bandit --all-files`.
- Run Bandit directly with `uv run --project server --no-sync bandit -c bandit.yaml -r server scripts`.
- Fix or explicitly document acceptable findings before committing backend changes.

## CI Alignment

- `.github/workflows/pre-commit.yml` now follows the current repo layout: `server/`, `client/`, `cli/`, `frontend/`, and `frontend/src-tauri/`.
- The GitHub Actions workflow runs the same active hook names as local pre-commit, including `bandit`, `check-python-code-lines`, `check-frontend-code-lines`, and `check-tauri-rust-code-lines`.
