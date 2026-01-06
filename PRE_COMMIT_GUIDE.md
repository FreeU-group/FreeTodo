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

---

## 安装与配置

### 1. 安装 pre-commit 依赖

#### 使用 uv（推荐）

```bash
# 同步pyproject.toml中的pre-commit依赖
uv sync --group dev
```

### 2. 安装 Git Hooks

**重要**：这一步必须在项目根目录执行！

```bash
# 确保虚拟环境已激活
source .venv/bin/activate

# 安装 pre-commit hooks
pre-commit install

# 验证安装
ls -la .git/hooks/pre-commit
```
---

## 使用方法

### 自动触发（推荐）

每次提交代码时，pre-commit 会自动运行：

```bash
git add .
git commit -m "your commit message"
```

如果检查通过，提交成功；如果检查失败，提交会被阻止，修复后需重新提交。

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
```

#### 查看详细输出

```bash
pre-commit run --all-files -v
```

---

## 常见场景

### 场景1：提交时检查失败

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

### 场景2：跳过检查（紧急情况）

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
        additional_dependencies: ["@biomejs/biome@2.3.8"]
        files: ^frontend/
```

**主要配置**：
- `files: ^lifetrace/` - 只检查 `lifetrace/` 目录下的 Python 文件
- `files: ^frontend/` - 只检查 `frontend/` 目录下的前端文件
- `language_version: python3.12` - 指定 Python 版本
- `args: [ --fix ]` - 自动修复可修复的问题
- `additional_dependencies` - 为 Biome 指定依赖版本

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

**原因**：hooks 未安装

**解决**：
```bash
# 重新安装 hooks
pre-commit install

# 检查 hooks 文件
ls -la .git/hooks/pre-commit
```

### 问题：hooks 没有执行权限

**原因**：文件权限不足

**解决**：
```bash
chmod +x .git/hooks/pre-commit
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

3. ✅ **团队协作时确保每个人都安装了 hooks**
   ```bash
   git clone <repo>
   cd <repo>
   uv sync --group dev
   pre-commit install
   pre-commit run --all-files
   ```

4. ✅ **不要使用 `--no-verify` 除非紧急情况**

5. ✅ **保持 Python 代码风格一致**

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

---

## 联系方式

如果遇到问题或需要帮助，请：
1. 查看本指南的故障排除部分
2. 运行 `pre-commit run --all-files -v` 查看详细错误
3. 查看项目 Issue 或提交新的 Issue

---

**Happy Coding! 🎉**
