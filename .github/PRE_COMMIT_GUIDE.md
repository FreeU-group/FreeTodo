# Pre-commit Usage Guide

## Overview

This project uses [pre-commit](https://pre-commit.com/) to automatically run code checks and formatting before Git commits, ensuring code quality and style consistency.

Pre-commit will automatically check and fix the following issues on each `git commit`:
- YAML file syntax checking
- TOML file syntax checking
- JSON file syntax checking
- End-of-file newline fixing
- Trailing whitespace removal
- Python code linting (ruff)
- Python code formatting (ruff-format)
- Frontend code checking (Biome)
- Frontend TypeScript type checking
- **Frontend code line count check** (max 500 lines of effective code per file)
- **Backend code line count check** (max 500 lines of effective code per file)

---

## Installation & Configuration

### 1. Install pre-commit Dependencies

#### Using uv (Recommended)

```bash
# Sync pre-commit dependencies from pyproject.toml
uv sync --group dev
```

### 2. Configure Git Hooks (Repo-Local)

This repo uses a shared `.githooks/` directory (repo-local) instead of `pre-commit install`.
Configure `core.hooksPath` once per clone/worktree:

```bash
git config core.hooksPath .githooks
```

**Note**: After `core.hooksPath` is set, `pre-commit install` will refuse to run. This is expected.

### 3. (Optional) Warm Up Hooks

```bash
pre-commit run --all-files
```
---

## Repo Hooks (Post-checkout)

The repo still ships a `post-checkout` hook under `.githooks/`, but worktree dependency
linking is disabled. Install dependencies locally in each worktree.

## Usage

### Automatic Trigger (Recommended)

Pre-commit will automatically run on each commit:

```bash
git add .
git commit -m "your commit message"
```

If checks pass, the commit succeeds; if checks fail, the commit is blocked and you need to fix the issues and commit again.

> **Note**: The repo hook prefers `pre-commit` if available, and falls back to `uv run pre-commit` when `uv` is installed.

**Example Output**:
```
check-yaml........................................................Passed
check-toml........................................................Passed
check-json........................................................Passed
end-of-file-fixer................................................Passed
trailing-whitespace..............................................Passed
ruff.............................................................Passed
ruff-format......................................................Passed
biome-check......................................................Passed
[main abc123] your commit message
 1 file changed, 3 insertions(+)
```

### Manual Execution

#### Run All Checks

```bash
pre-commit run --all-files
```

#### Run Specific Checks

```bash
# Check specific files only
pre-commit run --files path/to/file.py

# Run ruff check only
pre-commit run ruff --all-files

# Run ruff format only
pre-commit run ruff-format --all-files

# Run Biome check only
pre-commit run biome-check --all-files

# Run frontend code line count check only
pre-commit run check-frontend-code-lines --all-files

# Run Python code line count check only
pre-commit run check-python-code-lines --all-files

# Run Tauri Rust code line count check only
pre-commit run check-tauri-rust-code-lines --all-files
```

#### View Detailed Output

```bash
pre-commit run --all-files -v
```

---

## Common Scenarios

### Scenario 1: Code Line Count Exceeds Limit

If you see an error like this when committing:

```
Check frontend TS/TSX code lines (max 500)............................Failed
❌ The following files exceed 500 lines:
  apps/chat/components/ChatPanel.tsx -> 623 lines
```

**Solution**:

1. Split the oversized file into smaller modules/components
2. Extract common logic into separate utility files
3. Consider if there's duplicate code that can be abstracted

**Note**: Line count statistics **exclude** empty lines and comment lines, counting only effective code lines.

### Scenario 2: Check Failed on Commit

If you see an error like this when committing:

```
Trailing whitespace..............................................Failed
- hook id: trailing-whitespace
- args: [--markdown-linebreak-ext=md]

Some files have trailing whitespace, please remove them.
```

**Solution**:

1. Fix and re-add files:
   ```bash
   git add path/to/file.py
   ```

2. Commit again:
   ```bash
   git commit -m "your message"
   ```

### Scenario 3: Skip Checks (Emergency)

**Not recommended**, use only in emergencies:

```bash
git commit -m "emergency fix" --no-verify
```
---

## Configuration

The `.pre-commit-config.yaml` file in the project root contains all check configurations:

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v6.0.0
    hooks:
      - id: check-yaml
        exclude: pnpm-lock.yaml
      - id: check-toml
      - id: check-json
      - id: end-of-file-fixer
      - id: trailing-whitespace
        args: [--markdown-linebreak-ext=md]
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.12.10
    hooks:
      # Run the linter.
      - id: ruff
        language_version: python3.12
        files: ^server/
        types_or: [ python, pyi ]
        args: [ --fix ]
      # Run the formatter.
      - id: ruff-format
        language_version: python3.12
        files: ^server/
        types_or: [ python, pyi ]
  # Biome for frontend (JavaScript/TypeScript)
  - repo: https://github.com/biomejs/pre-commit
    rev: "v0.6.1"
    hooks:
      - id: biome-check
        additional_dependencies: ["@biomejs/biome@2.3.13"]
        files: ^frontend/

  # Local hooks
  - repo: local
    hooks:
      # TypeScript type checking
      - id: tsc-frontend
        name: TypeScript type check (frontend)
        entry: bash -c 'cd frontend && pnpm run type-check'
        language: system
        files: ^frontend/.*\.(ts|tsx)$
        pass_filenames: false

      # Frontend code line count check (max 500 lines of effective code)
      - id: check-frontend-code-lines
        name: Check frontend TS/TSX/JS/JSX code lines (max 500)
        entry: node frontend/scripts/check_code_lines.js --include apps,components,electron,lib,scripts --exclude .next,.turbo,.vercel,build,coverage,dist,dist-electron,node_modules,out,lib/generated,apps/crawler/CrawlerDetailPanel.tsx,apps/crawler/store.ts,apps/todo-intent/TodoIntentPanel.tsx,lib/store/audio-recording-store.ts
        language: system
        files: ^(frontend|scripts)/.*\.(ts|tsx|js|jsx)$
        pass_filenames: true

      # Backend code line count check (max 500 lines of effective code)
      - id: check-python-code-lines
        name: Check Python code lines (max 500)
        entry: uv run --project server --no-sync python server/scripts/check_code_lines.py --include server,client,scripts --exclude .venv,server/.venv,server/__pycache__,server/dist,server/migrations/versions,client/.venv,client/__pycache__,client/dist,client/build
        language: system
        files: ^(server|client|scripts)/.*\.py$
        pass_filenames: true

      # Tauri Rust code line count check (max 500 lines of effective code)
      - id: check-tauri-rust-code-lines
        name: Check Tauri Rust code lines (max 500)
        entry: node frontend/scripts/check_rust_code_lines.js --include src-tauri/src --exclude src-tauri/.tauri-lint-dist,src-tauri/gen,src-tauri/target
        language: system
        files: ^frontend/src-tauri/.*\.rs$
        pass_filenames: true
```

**Key Configuration**:
- `files: ^(server|client|scripts)/` - Only check Python files in `server/`, `client/`, and `scripts/`
- `files: ^(frontend|scripts)/` - Only check frontend files in `frontend/` and `scripts/`
- `files: ^frontend/src-tauri/` - Only check Tauri Rust files in `frontend/src-tauri/`
- `language_version: python3.12` - Specify Python version
- `args: [ --fix ]` - Automatically fix fixable issues
- `additional_dependencies` - Specify dependency version for Biome
- `pass_filenames: true/false` - Whether to pass the list of staged files to the script
  - `true`: Script only checks passed files (code line count check uses this mode, only checking staged files)
  - `false`: Script determines its own check scope (TypeScript type check uses this mode, needs to check the entire project)

---

## Troubleshooting

### Issue: pre-commit: command not found

**Cause**: Virtual environment not activated or pre-commit not installed

**Solution**:
```bash
# Activate virtual environment
source .venv/bin/activate

# Using uv run
uv run pre-commit --version
```

### Issue: Checks not triggered on commit

**Cause**: Hooks not configured or `.githooks` missing

**Solution**:
```bash
# Ensure hooksPath is set
git config --get core.hooksPath

# Reconfigure hooksPath (in repo root)
git config core.hooksPath .githooks
```

### Issue: pre-commit install fails with core.hooksPath

**Cause**: This repo uses `.githooks/` via `core.hooksPath`, so `pre-commit install` will refuse.

**Solution**:
```bash
# Do not run pre-commit install. Use:
pre-commit run --all-files
```

### Issue: Checks are too slow

**Optimization Methods**:

1. Only check changed files:
   ```bash
   pre-commit run
   ```

2. Use parallel execution:
   ```bash
   pre-commit run --all-files --jobs 4
   ```

---

## Best Practices

1. ✅ **Run checks before each commit**
   ```bash
   pre-commit run --all-files
   ```

2. ✅ **Update check tools regularly**
   ```bash
   pre-commit autoupdate
   ```

3. ✅ **Ensure all team members have hooks configured when collaborating**
   ```bash
   git clone <repo>
   cd <repo>
   uv sync --group dev
   git config core.hooksPath .githooks
   pre-commit run --all-files
   ```

4. ✅ **Don't use `--no-verify` unless it's an emergency**

5. ✅ **Maintain consistent Python code style**

---

## Code Line Count Check Rules

### Rule Description

To maintain code readability and maintainability, the project limits the effective code lines per file:

- **Frontend (TS/TSX)**: Max 500 lines of effective code per file
- **Backend (Python)**: Max 500 lines of effective code per file
- **Tauri Rust**: Max 500 lines of effective code per file

### Counting Rules

Line count statistics **exclude** the following:
- Empty lines (lines that are empty strings after `trim()`/`strip()`)
- Comment lines:
  - Frontend: Lines starting with `//`, `/*`, `*`, `*/`
  - Backend: Lines starting with `#`

### Check Scope

**Frontend Check Directories** (adjustable via parameters):
- Include: `apps/`, `components/`, `electron/`, `lib/`, `scripts/`
- Exclude: `.next/`, `.turbo/`, `.vercel/`, `build/`, `coverage/`, `dist/`, `dist-electron/`, `node_modules/`, `out/`, `lib/generated/`, plus specific allowlisted oversized files

**Backend Check Directories** (adjustable via parameters):
- Include: `server/`, `client/`, `scripts/`
- Exclude: `.venv/`, `server/.venv/`, `server/__pycache__/`, `server/dist/`, `server/migrations/versions/`, `client/.venv/`, `client/__pycache__/`, `client/dist/`, `client/build/`

**Tauri Rust Check Directories** (adjustable via parameters):
- Include: `src-tauri/src/`
- Exclude: `src-tauri/.tauri-lint-dist/`, `src-tauri/gen/`, `src-tauri/target/`

### Manual Check Execution

The script supports two execution modes:

**Mode 1: Scan Entire Directory (Standalone Execution)**

```bash
# Check all frontend TS/TSX/JS/JSX files
node frontend/scripts/check_code_lines.js

# Check all Python files in server/client/scripts
uv run --project server --no-sync python server/scripts/check_code_lines.py

# Check all Tauri Rust files
node frontend/scripts/check_rust_code_lines.js

# Use custom parameters
node frontend/scripts/check_code_lines.js --include apps,components,electron,lib,scripts --exclude .next,.turbo,dist,node_modules,lib/generated --max 600
uv run --project server --no-sync python server/scripts/check_code_lines.py --include server,client,scripts --exclude .venv,server/.venv,server/__pycache__,client/.venv --max 600
node frontend/scripts/check_rust_code_lines.js --include src-tauri/src --exclude src-tauri/.tauri-lint-dist,src-tauri/gen,src-tauri/target --max 600
```

**Mode 2: Check Specific Files (Pre-commit Mode)**

```bash
# Check only specified files
node frontend/scripts/check_code_lines.js frontend/apps/chat/ChatPanel.tsx frontend/apps/todo/TodoList.tsx
uv run --project server --no-sync python server/scripts/check_code_lines.py server/routers/chat.py server/services/todo.py
node frontend/scripts/check_rust_code_lines.js frontend/src-tauri/src/backend.rs frontend/src-tauri/src/main.rs
```

> **Note**: During `git commit`, pre-commit automatically passes staged files, checking only these files instead of the entire directory.

### Solutions for Exceeding Limits

When a file's code line count exceeds the limit, consider:

1. **Split Files**: Split large files into multiple smaller files by functional modules
2. **Extract Common Logic**: Abstract duplicate code into independent utility functions/components
3. **Use Composition Pattern**: Split complex components into multiple sub-components
4. **Evaluate Comment Volume**: Add appropriate comments (not counted in lines) to explain complex logic

---

## Resources

- [Pre-commit Official Documentation](https://pre-commit.com/)
- [Ruff Documentation](https://docs.astral.sh/ruff/)
- [Python Style Guide (PEP 8)](https://peps.python.org/pep-0008/)

---

## FAQ

**Q: Will Pre-commit modify my code?**
A: Yes! Ruff will automatically fix fixable issues such as unnecessary imports, unused variables, etc. Review your changes and commit again.

**Q: Can I use different pre-commit configurations on different branches?**
A: Yes! `.pre-commit-config.yaml` can be adjusted per branch.

**Q: What programming languages does Pre-commit support?**
A: This project configuration supports Python (via Ruff) and JavaScript/TypeScript (via Biome). The Pre-commit framework itself supports multiple languages, including Go, Rust, etc.

**Q: How do I add custom checks?**
A: Modify the `.pre-commit-config.yaml` file and add new repositories or hooks.

**Q: Can the code line count check threshold be adjusted?**
A: Yes! Modify the `entry` parameter of the corresponding hook in `.pre-commit-config.yaml` and add `--max <number>`. For example: `--max 600` adjusts the limit to 600 lines.

**Q: Why are certain directories not checked?**
A: To avoid checking auto-generated code (such as Orval-generated API code), some directories are excluded from the check scope. You can adjust the exclusion list via the `--exclude` parameter.

---

## Contact

If you encounter issues or need help, please:
1. Check the troubleshooting section of this guide
2. Run `pre-commit run --all-files -v` to view detailed errors
3. Check project Issues or submit a new Issue

---

**Happy Coding! 🎉**
