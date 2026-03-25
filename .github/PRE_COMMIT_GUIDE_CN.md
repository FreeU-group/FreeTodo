# Pre-commit 使用指南

## 概述

本项目使用 [pre-commit](https://pre-commit.com/) 工具在 Git 提交前自动运行代码检查和格式化，确保代码质量和风格一致性。

Pre-commit 会在每次 `git commit` 时自动检查并修复以下问题：
- YAML 文件语法检查
- TOML 文件语法检查
- JSON 文件语法检查
- 文件末尾换行符修复
- 行尾空格删除
- Python 代码规范检查（ruff）
- Python 代码格式化（ruff-format）
- 前端代码检查（Biome）
- 前端 TypeScript 类型检查
- **前端代码行数检查**（单文件有效代码行数不超过 500 行）
- **后端代码行数检查**（单文件有效代码行数不超过 500 行）

---

## 安装与配置

### 1. 安装 pre-commit 依赖

#### 使用 uv（推荐）

```bash
# 同步pyproject.toml中的pre-commit依赖
uv sync --group dev
```

### 2. 配置 Git Hooks（仓库内）

本仓库使用共享的 `.githooks/` 目录（仓库内），不使用 `pre-commit install`。
每个 clone/worktree 配置一次即可：

```bash
git config core.hooksPath .githooks
```

**注意**：设置了 `core.hooksPath` 后，`pre-commit install` 会拒绝执行，这是预期行为。

### 3.（可选）预热检查

```bash
pre-commit run --all-files
```
---

## 仓库 Hook（post-checkout）

仓库仍保留 `.githooks/` 下的 `post-checkout` hook，但 worktree 依赖自动链接已停用。
请在每个 worktree 内单独安装依赖。

## 使用方法

### 自动触发（推荐）

每次提交代码时，pre-commit 会自动运行：

```bash
git add .
git commit -m "your commit message"
```

如果检查通过，提交成功；如果检查失败，提交会被阻止，修复后需重新提交。

> **注意**：仓库 hook 优先使用 `pre-commit`，若未找到则会回退到 `uv run pre-commit`（需要已安装 uv）。

**示例输出**：
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

### 手动运行

#### 运行所有检查

```bash
pre-commit run --all-files
```

#### 运行特定检查

```bash
# 仅检查特定文件
pre-commit run --files path/to/file.py

# 仅运行 ruff 检查
pre-commit run ruff --all-files

# 仅运行 ruff 格式化
pre-commit run ruff-format --all-files

# 仅运行 Biome 检查
pre-commit run biome-check --all-files

# 仅运行前端代码行数检查
pre-commit run check-frontend-code-lines --all-files

# 仅运行后端代码行数检查
pre-commit run check-backend-code-lines --all-files
```

#### 查看详细输出

```bash
pre-commit run --all-files -v
```

---

## 常见场景

### 场景1：代码行数超过限制

如果提交时看到类似以下错误：

```
Check frontend TS/TSX code lines (max 500)............................Failed
❌ 以下文件代码行数超过 500 行：
  apps/chat/components/ChatPanel.tsx -> 623 行
```

**解决方法**：

1. 将超长文件拆分为多个更小的模块/组件
2. 提取公共逻辑到独立的工具文件
3. 考虑是否有重复代码可以抽象

**注意**：代码行数统计**不包含**空行和注释行，只统计有效代码行数。

### 场景2：提交时检查失败

如果提交时看到类似以下错误：

```
Trailing whitespace..............................................Failed
- hook id: trailing-whitespace
- args: [--markdown-linebreak-ext=md]

Some files have trailing whitespace, please remove them.
```

**解决方法**：

1. 修复后重新添加文件：
   ```bash
   git add path/to/file.py
   ```

2. 重新提交：
   ```bash
   git commit -m "your message"
   ```

### 场景3：跳过检查（紧急情况）

**不推荐**，仅在紧急情况下使用：

```bash
git commit -m "emergency fix" --no-verify
```
---

## 配置说明

项目根目录的 `.pre-commit-config.yaml` 包含所有检查配置：

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
        files: ^lifetrace/
        types_or: [ python, pyi ]
        args: [ --fix ]
      # Run the formatter.
      - id: ruff-format
        language_version: python3.12
        files: ^lifetrace/
        types_or: [ python, pyi ]
  # Biome for frontend (JavaScript/TypeScript)
  - repo: https://github.com/biomejs/pre-commit
    rev: "v0.6.1"
    hooks:
      - id: biome-check
        additional_dependencies: ["@biomejs/biome@2.3.13"]
        files: ^(free-todo-frontend/)

  # Local hooks
  - repo: local
    hooks:
      # TypeScript 类型检查
      - id: tsc-free-todo-frontend
        name: TypeScript type check (free-todo-frontend)
        entry: bash -c 'cd free-todo-frontend && pnpm run type-check'
        language: system
        files: ^free-todo-frontend/.*\.(ts|tsx)$
        pass_filenames: false

      # 前端代码行数检查（有效代码行数上限 500 行）
      - id: check-frontend-code-lines
        name: Check frontend TS/TSX code lines (max 500)
        entry: node free-todo-frontend/scripts/check_code_lines.js --include apps,components,electron,lib --exclude lib/generated
        language: system
        files: ^free-todo-frontend/.*\.(ts|tsx)$
        pass_filenames: true

      # 后端代码行数检查（有效代码行数上限 500 行）
      - id: check-backend-code-lines
        name: Check backend Python code lines (max 500)
        entry: uv run python lifetrace/scripts/check_code_lines.py --include lifetrace --exclude lifetrace/__pycache__,lifetrace/dist,lifetrace/migrations/versions
        language: system
        files: ^lifetrace/.*\.py$
        pass_filenames: true
```

**主要配置**：
- `files: ^lifetrace/` - 只检查 `lifetrace/` 目录下的 Python 文件
- `files: ^free-todo-frontend/` - 只检查 `free-todo-frontend/` 目录下的前端文件
- `language_version: python3.12` - 指定 Python 版本
- `args: [ --fix ]` - 自动修复可修复的问题
- `additional_dependencies` - 为 Biome 指定依赖版本
- `pass_filenames: true/false` - 是否将暂存的文件列表传给脚本
  - `true`：脚本只检查传入的文件（代码行数检查使用此模式，只检查暂存的文件）
  - `false`：脚本自行决定检查范围（TypeScript 类型检查使用此模式，需要检查整个项目）

---

## 故障排除

### 问题：pre-commit: command not found

**原因**：虚拟环境未激活或 pre-commit 未安装

**解决**：
```bash
# 激活虚拟环境
source .venv/bin/activate

# uv run
uv run pre-commit --version
```

### 问题：提交时没有触发检查

**原因**：hooks 未配置或 `.githooks` 缺失

**解决**：
```bash
# 确认 hooksPath
git config --get core.hooksPath

# 重新配置 hooksPath（在仓库根目录）
git config core.hooksPath .githooks
```

### 问题：pre-commit install 报错 core.hooksPath

**原因**：本仓库使用 `.githooks/`，因此 `pre-commit install` 会拒绝执行。

**解决**：
```bash
# 不要运行 pre-commit install，直接使用：
pre-commit run --all-files
```

### 问题：检查速度太慢

**优化方法**：

1. 仅检查变更的文件：
   ```bash
   pre-commit run
   ```

2. 使用并行运行：
   ```bash
   pre-commit run --all-files --jobs 4
   ```

---

## 最佳实践

1. ✅ **每次提交前运行检查**
   ```bash
   pre-commit run --all-files
   ```

2. ✅ **及时更新检查工具**
   ```bash
   pre-commit autoupdate
   ```

3. ✅ **团队协作时确保每个人都配置了 hooks**
   ```bash
   git clone <repo>
   cd <repo>
   uv sync --group dev
   git config core.hooksPath .githooks
   pre-commit run --all-files
   ```

4. ✅ **不要使用 `--no-verify` 除非紧急情况**

5. ✅ **保持 Python 代码风格一致**

---

## 代码行数检查规则

### 规则说明

为了保持代码的可读性和可维护性，项目对单文件的有效代码行数进行限制：

- **前端（TS/TSX）**：单文件有效代码行数不超过 500 行
- **后端（Python）**：单文件有效代码行数不超过 500 行

### 计数规则

代码行数统计**不包含**以下内容：
- 空行（`trim()`/`strip()` 后为空字符串的行）
- 注释行：
  - 前端：以 `//`、`/*`、`*`、`*/` 开头的行
  - 后端：以 `#` 开头的行

### 检查范围

**前端检查目录**（可通过参数调整）：
- 包含：`apps/`、`components/`、`electron/`、`lib/`
- 排除：`lib/generated/`（Orval 自动生成的 API 代码）

**后端检查目录**（可通过参数调整）：
- 包含：`lifetrace/`
- 排除：`lifetrace/__pycache__/`、`lifetrace/dist/`、`lifetrace/migrations/versions/`

### 手动运行检查

脚本支持两种运行模式：

**模式 1：扫描整个目录（单独运行）**

```bash
# 检查前端所有 TS/TSX 文件
node free-todo-frontend/scripts/check_code_lines.js

# 检查后端所有 Python 文件
uv run python lifetrace/scripts/check_code_lines.py

# 使用自定义参数
node free-todo-frontend/scripts/check_code_lines.js --include apps,components,electron --exclude lib/generated --max 600
uv run python lifetrace/scripts/check_code_lines.py --include lifetrace --exclude lifetrace/__pycache__ --max 600
```

**模式 2：检查指定文件（pre-commit 模式）**

```bash
# 只检查指定的文件
node free-todo-frontend/scripts/check_code_lines.js apps/chat/ChatPanel.tsx apps/todo/TodoList.tsx
uv run python lifetrace/scripts/check_code_lines.py lifetrace/routers/chat.py lifetrace/services/todo.py
```

> **注意**：在 `git commit` 时，pre-commit 会自动传入暂存的文件，只检查这些文件而不是整个目录。

### 超限解决方案

当文件代码行数超过限制时，建议：

1. **拆分文件**：将大文件按功能模块拆分为多个小文件
2. **提取公共逻辑**：将重复代码抽象为独立的工具函数/组件
3. **使用组合模式**：将复杂组件拆分为多个子组件
4. **评估注释量**：适当增加注释（不计入行数）来解释复杂逻辑

---

## 相关资源

- [Pre-commit 官方文档](https://pre-commit.com/)
- [Ruff 文档](https://docs.astral.sh/ruff/)
- [Python 代码风格指南 (PEP 8)](https://peps.python.org/pep-0008/)

---

## 常见问题 FAQ

**Q: Pre-commit 会修改我的代码吗？**
A: 会的！Ruff 会自动修复可修复的问题，如不必要的 imports、未使用的变量等。检查您的修改后重新提交即可。

**Q: 我可以在不同分支上使用不同的 pre-commit 配置吗？**
A: 可以！`.pre-commit-config.yaml` 可以根据分支调整。

**Q: Pre-commit 支持哪些编程语言？**
A: 本项目配置支持 Python（通过 Ruff）、JavaScript/TypeScript（通过 Biome），Pre-commit 框架本身支持多种语言，包括 Go、Rust 等。

**Q: 如何添加自定义检查？**
A: 修改 `.pre-commit-config.yaml` 文件，添加新的 repository 或 hooks。

**Q: 代码行数检查的阈值可以调整吗？**
A: 可以！修改 `.pre-commit-config.yaml` 中对应 hook 的 `entry` 参数，添加 `--max <number>` 即可。例如：`--max 600` 将上限调整为 600 行。

**Q: 为什么某些目录不被检查？**
A: 为了避免检查自动生成的代码（如 Orval 生成的 API 代码），部分目录被排除在检查范围之外。可以通过 `--exclude` 参数调整排除列表。

---

## 联系方式

如果遇到问题或需要帮助，请：
1. 查看本指南的故障排除部分
2. 运行 `pre-commit run --all-files -v` 查看详细错误
3. 查看项目 Issue 或提交新的 Issue

---

**Happy Coding! 🎉**
