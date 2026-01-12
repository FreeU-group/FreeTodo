# 贡献指南

**语言**: [English](CONTRIBUTING.md) | [中文](CONTRIBUTING_CN.md)

> ⚠️ **重要提示**：在开始贡献之前，请务必阅读并配置 [**Pre-commit 使用指南**](PRE_COMMIT_GUIDE_CN.md)。Pre-commit 会在每次 `git commit` 时自动运行代码检查和格式化，确保代码质量和风格一致性。这是项目代码质量保障的重要工具，请务必完成安装和配置。

## 🎉 欢迎贡献

感谢您对 FreeTodo 项目的关注！我们非常欢迎并感谢任何形式的贡献。无论您是修复一个拼写错误、报告一个 bug，还是提出一个重大的新功能，我们都非常感激。

## 📋 目录

- [如何开始贡献](#-如何开始贡献)
- [开发环境设置](#️-开发环境设置)
- [Git Flow 工作流程](#-git-flow-工作流程)
- [贡献流程](#-贡献流程)
- [编码规范](#-编码规范)
- [提交信息规范](#-提交信息规范)
- [Pull Request 指南](#-pull-request-指南)
- [报告问题](#-报告问题)
- [社区讨论](#-社区讨论)

## 🚀 如何开始贡献

### 寻找合适的任务

1. **浏览 Issues**：查看 [Issues 页面](https://github.com/FreeU-group/FreeTodo/issues)
2. **查找标签**：
   - `good first issue` - 适合新手的简单任务
   - `help wanted` - 需要帮助的任务
   - `bug` - Bug 修复
   - `enhancement` - 新功能
   - `documentation` - 文档改进
3. **提出想法**：如果有新的想法，先创建一个 Issue 进行讨论

### 贡献类型

#### 🐛 报告 Bug

- 使用 Bug 报告模板
- 提供详细的复现步骤
- 包含环境信息（操作系统、Python 版本、Node.js 版本等）
- 如果可能，提供截图或日志

#### 💡 功能建议

- 使用功能请求模板
- 清晰描述功能的目的和价值
- 提供使用场景示例
- 考虑技术可行性

#### 📝 改进文档

- 修复文档中的错误
- 添加缺失的文档
- 改进代码注释
- 翻译文档

#### 🧪 编写测试

- 增加测试覆盖率
- 修复失败的测试
- 添加边界情况测试

#### 🔧 代码贡献

- 修复 Bug
- 实现新功能
- 性能优化
- 代码重构

## 🛠️ 开发环境设置

### 先决条件

#### 后端开发

- Python 3.12
- [uv](https://github.com/astral-sh/uv) 包管理器
- Git

#### 前端开发

- Node.js 20+
- pnpm 包管理器
- Git

### 克隆仓库

```bash
# 克隆您 fork 的仓库
git clone https://github.com/YOUR_USERNAME/FreeTodo.git
cd FreeTodo

# 添加上游仓库
git remote add upstream https://github.com/FreeU-group/FreeTodo.git
```

### 后端设置

```bash
# 安装 uv（如果还没有安装）
# macOS/Linux
curl -LsSf https://astral.sh/uv/install.sh | sh

# Windows
powershell -c "irm https://astral.sh/uv/install.ps1 | iex"

# 安装依赖
uv sync

# 激活虚拟环境
# macOS/Linux
source .venv/bin/activate

# Windows
.venv\Scripts\activate

# 启动后端服务
python -m lifetrace.server
```

### 前端设置

```bash
# 进入前端目录
cd frontend

# 安装 pnpm（如果还没有安装）
npm install -g pnpm

# 安装依赖
pnpm install

# 启动开发服务器
pnpm dev
```

### 验证设置

1. 后端应该从 `8001` 端口开始查找可用端口（默认运行在 `http://localhost:8001`）
2. 前端应该从 `3001` 端口开始查找可用端口（默认运行在 `http://localhost:3001`）
3. 前端会自动通过检查 `/health` 端点检测运行中的后端端口
4. 实际使用的端口会在控制台显示
5. 访问控制台显示的 API 文档地址（通常为 `http://localhost:8001/docs`）查看 API 文档
6. 访问控制台显示的前端地址（通常为 `http://localhost:3001`）查看前端界面

> **注意**：如果端口被占用，前端和后端都会自动查找下一个可用端口。控制台会显示实际使用的端口。

## 🌿 Git Flow 工作流程

FreeTodo 项目采用规范的 Git Flow 分支管理策略，以确保代码质量和开发流程的规范性。

### 分支结构

我们维护以下分支：

- **`main`** - 生产环境分支，包含最稳定的代码，可直接部署
- **`dev`** - 开发环境分支，用于日常开发和功能集成
- **`test`** - 测试环境分支，用于完整的集成测试
- **`feat/*`** - 功能开发分支，从 `dev` 创建
- **`fix/*`** - Bug 修复分支，从 `dev`、`test` 或 `main` 创建
- **`hotfix/*`** - 紧急修复分支，从 `main` 创建

### 详细工作流程

关于 Git Flow 的完整说明，包括分支策略、工作流程、命名规范、常见场景和最佳实践，请参考：

📖 **[Git Flow 工作流程详细文档](GIT_FLOW_CN.md)**

该文档包含：

- 🌳 完整的分支策略说明
- 🔄 各种场景的详细工作流程
- 📝 分支命名规范
- 🎯 常见开发场景示例
- 💡 最佳实践和技巧
- ❓ 常见问题解答
- 🚦 工作流程图
- 📚 Git 命令速查表

### 快速开始

如果您已经熟悉 Git Flow，以下是快速参考：

```bash
# 1. 从 dev 创建功能分支
git checkout dev
git pull origin dev
git checkout -b feat/your-feature-name

# 2. 开发并提交
git add .
git commit -m "feat: your feature description"

# 3. 推送并创建 PR
git push origin feat/your-feature-name
# 在 GitHub 上创建 PR 到 dev 分支
```

## 📝 贡献流程

### 1. 创建分支

始终从最新的 `main` 分支创建新分支：

```bash
# 更新本地 main 分支
git checkout main
git pull upstream main

# 创建新分支
git checkout -b feat/your-feature-name
# 或
git checkout -b fix/your-bug-fix
```

分支命名规范：

- `feat/xxx` - 新功能
- `fix/xxx` - Bug 修复
- `docs/xxx` - 文档更新
- `refactor/xxx` - 代码重构
- `test/xxx` - 测试相关
- `chore/xxx` - 构建工具或辅助工具的变动

### 2. 进行更改

- 遵循项目的编码规范（见下文）
- 编写清晰的代码注释
- 确保代码可以正常运行
- 添加或更新相关测试
- 更新相关文档

### 3. 提交更改

```bash
# 添加更改的文件
git add .

# 提交更改（遵循提交信息规范）
git commit -m "feat: add new feature"

# 推送到您的 fork
git push origin feat/your-feature-name
```

### 4. 创建 Pull Request

1. 访问您的 fork 在 GitHub 上的页面
2. 点击 "Compare & pull request" 按钮
3. 填写 PR 模板
4. 等待审查和反馈

## 📐 编码规范

### 后端规范（Python）

详细的后端开发规范请参考：[**后端开发规范**](BACKEND_GUIDELINES_CN.md)

**核心要点**：

- 遵循 PEP 8 风格指南
- 使用类型注解（Type Hints）
- 函数和类需要有文档字符串
- 使用 Ruff 进行代码检查和格式化
- 行长度限制为 100 个字符

**快速检查**：

```bash
# 运行代码检查
uv run ruff check .

# 自动格式化代码
uv run ruff format .
```

### 前端规范（TypeScript/React）

详细的前端开发规范请参考：[**前端开发规范**](FRONTEND_GUIDELINES_CN.md)

**核心要点**：

- 使用 TypeScript 严格模式
- 遵循 React Hooks 最佳实践
- 组件使用函数式组件
- 使用 ESLint 进行代码检查
- 使用 Tailwind CSS 进行样式管理

**快速检查**：

```bash
cd frontend

# 运行 ESLint 检查
pnpm lint

# 构建测试
pnpm build
```

## 💬 提交信息规范

我们使用 [Conventional Commits](https://www.conventionalcommits.org/) 规范。

### 格式

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type 类型

- `feat`: 新功能
- `fix`: Bug 修复
- `docs`: 文档更新
- `style`: 代码格式（不影响代码运行的变动）
- `refactor`: 重构（既不是新增功能，也不是修改 bug 的代码变动）
- `perf`: 性能优化
- `test`: 增加测试
- `chore`: 构建过程或辅助工具的变动
- `ci`: CI 配置文件和脚本的变动
- `revert`: 回滚之前的提交

### Scope 范围（可选）

- `backend`: 后端相关
- `frontend`: 前端相关
- `api`: API 相关
- `ui`: UI 相关
- `db`: 数据库相关
- `config`: 配置相关

### 示例

```bash
# 新功能
git commit -m "feat(frontend): add dark mode toggle button"

# Bug 修复
git commit -m "fix(backend): resolve screenshot capture error on Windows"

# 文档更新
git commit -m "docs: update installation guide"

# 性能优化
git commit -m "perf(api): improve vector search performance"

# 多行提交信息
git commit -m "feat(backend): add task auto-association

- Implement background job for task context mapping
- Add configuration options for auto-association
- Update API endpoints to support new feature

Closes #123"
```

## 🔍 Pull Request 指南

### PR 标题

PR 标题应该遵循与提交信息相同的规范：

```
<type>(<scope>): <description>
```

### PR 描述模板

```markdown
## 📝 描述
<!-- 简要描述本 PR 的目的和内容 -->

## 🔗 相关 Issue
<!-- 关联相关的 Issue，例如：Closes #123 -->

## 🎯 变更类型
<!-- 在适用的选项前打勾 -->
- [ ] Bug 修复
- [ ] 新功能
- [ ] 性能优化
- [ ] 代码重构
- [ ] 文档更新
- [ ] 测试相关
- [ ] 其他（请说明）

## 🧪 测试
<!-- 描述如何测试这些更改 -->
- [ ] 已在本地测试
- [ ] 已添加单元测试
- [ ] 已添加集成测试
- [ ] 已更新文档

## 📸 截图（如适用）
<!-- 如果是 UI 相关的更改，请提供截图 -->

## ✅ 检查清单
- [ ] 代码遵循项目的编码规范
- [ ] 已进行自我代码审查
- [ ] 代码有适当的注释
- [ ] 已更新相关文档
- [ ] 我的更改没有产生新的警告
- [ ] 已添加证明修复有效或功能正常的测试
- [ ] 新的和现有的单元测试在本地通过
- [ ] 任何依赖的更改已经合并和发布

## 📚 额外说明
<!-- 任何其他需要审查者知道的信息 -->
```

### 审查流程

1. **自动检查**：CI/CD 会自动运行测试和检查
2. **代码审查**：维护者会审查您的代码
3. **反馈处理**：根据反馈进行修改
4. **合并**：通过审查后，维护者会合并您的 PR

### 审查标准

- ✅ 代码质量和可读性
- ✅ 遵循项目编码规范
- ✅ 功能完整性
- ✅ 测试覆盖率
- ✅ 文档完整性
- ✅ 性能影响
- ✅ 向后兼容性

## 🐛 报告问题

### Bug 报告

创建 Bug 报告时，请包含以下信息：

1. **问题描述**：清晰简洁地描述问题
2. **复现步骤**：
   - 第一步
   - 第二步
   - ...
3. **期望行为**：描述您期望发生什么
4. **实际行为**：描述实际发生了什么
5. **环境信息**：
   - 操作系统：[例如 Windows 11, macOS 13.0, Ubuntu 22.04]
   - Python 版本：[例如 3.13.0]
   - Node.js 版本：[例如 18.17.0]
   - 浏览器：[例如 Chrome 120.0]
6. **截图或日志**：如果适用，添加截图或日志信息
7. **附加信息**：任何其他相关的上下文信息

### 功能请求

创建功能请求时，请包含以下信息：

1. **功能描述**：清晰描述您想要的功能
2. **问题背景**：这个功能解决什么问题？
3. **建议的解决方案**：您期望如何实现这个功能？
4. **替代方案**：您考虑过的其他解决方案
5. **使用场景**：提供具体的使用示例
6. **附加信息**：任何其他相关的上下文或截图

## 💬 社区讨论

### 获取帮助

- **GitHub Issues**：报告问题和提出功能请求
- **GitHub Discussions**：参与社区讨论
- **微信群**：加入我们的微信群（见 README）
- **飞书群**：加入我们的飞书群（见 README）

### 保持联系

- 🌟 给项目点 Star 以表示支持
- 👀 Watch 仓库以获取更新通知
- 🐦 在社交媒体上分享项目
- 📝 撰写博客文章介绍项目

## 🎓 学习资源

### 后端相关

- [FastAPI 文档](https://fastapi.tiangolo.com/)
- [SQLAlchemy 文档](https://docs.sqlalchemy.org/)
- [Pydantic 文档](https://docs.pydantic.dev/)
- [Python 类型注解](https://docs.python.org/3/library/typing.html)

### 前端相关

- [Next.js 文档](https://nextjs.org/docs)
- [React 文档](https://react.dev/)
- [TypeScript 文档](https://www.typescriptlang.org/docs/)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)

### Git 相关

- [FreeTodo Git Flow 工作流程](GIT_FLOW_CN.md) - 项目专用 Git 工作流程文档
- [Git 简明教程](https://rogerdudler.github.io/git-guide/index.zh.html)
- [如何使用 Git 和 GitHub](https://www.freecodecamp.org/chinese/news/git-and-github-for-beginners/)

## 📊 贡献者统计

感谢所有为 FreeTodo 做出贡献的人！

![Contributors](https://contrib.rocks/image?repo=FreeU-group/FreeTodo)

## ❓ 常见问题

### 我是编程新手，可以贡献吗？

当然可以！我们欢迎所有级别的贡献者。您可以从以下方面开始：

- 修复文档中的拼写错误
- 改进文档和注释
- 处理标记为 `good first issue` 的问题
- 报告 Bug 和提出建议

### 我的 PR 需要多长时间才能被审查？

我们会尽快审查 PR，通常在 3-7 天内。如果超过一周没有响应，请在 PR 中留言提醒我们。

### 我可以同时处理多个 Issue 吗？

可以，但建议先专注于一个 Issue，完成后再开始下一个。这样可以确保工作质量和效率。

### 如何保持我的 Fork 与上游同步？

```bash
# 获取上游更新
git fetch upstream

# 合并到本地 main 分支
git checkout main
git merge upstream/main

# 推送到您的 fork
git push origin main
```

### 我的 PR 被拒绝了怎么办？

不要灰心！这是正常的开发流程。维护者会提供反馈和建议。根据反馈进行修改，或者在讨论中寻求澄清。

## 📜 许可证

FreeTodo 采用 **FreeU Community License** 许可证，该许可证基于 Apache License 2.0，并附加了关于商业使用的条件。

通过贡献代码，您同意：

1. **您的贡献将在 FreeU Community License 下许可**
   - 该许可证基于 Apache License 2.0，同时包含额外的商业使用条款
   - 有关详细的许可证条款，请参阅 [LICENSE](../LICENSE) 文件

2. **作为贡献者，您同意：**
   - 生产者可以根据需要调整开源协议（使其更严格或更宽松）
   - 您贡献的代码可能用于商业目的，包括但不限于其云版本

有关详细的许可证条款和贡献者条件，请参阅 [LICENSE](../LICENSE) 文件。

---

## 🙏 感谢

感谢您花时间阅读我们的贡献指南！我们期待您的贡献，让 FreeTodo 变得更好！

如果您有任何问题，请随时在 Issues 中提问或加入我们的社区群组。

Happy Coding! 🎉
