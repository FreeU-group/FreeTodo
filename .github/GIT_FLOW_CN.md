# Git Flow 工作流程

**语言**: [English](GIT_FLOW.md) | [中文](GIT_FLOW_CN.md)

## 📋 目录

- [概述](#-概述)
- [分支策略](#-分支策略)
- [工作流程](#-工作流程)
- [分支命名规范](#-分支命名规范)
- [常见场景](#-常见场景)
- [最佳实践](#-最佳实践)
- [常见问题](#-常见问题)

## 📖 概述

FreeTodo 项目采用基于 Git Flow 的分支管理策略，以确保代码质量和开发流程的规范性。本文档详细描述了我们的分支模型和工作流程。

### 核心理念

- 🔒 **保护主分支**：`main` 分支始终保持稳定和可发布状态
- 🔄 **持续集成**：通过 `dev` 分支进行持续的功能集成
- 🧪 **充分测试**：在 `test` 分支进行完整的测试验证
- 🌿 **特性隔离**：每个功能或修复都在独立的分支中开发
- 👥 **协作开发**：清晰的分支策略便于团队协作

## 🌳 分支策略

### 长期分支

我们维护以下长期存在的分支：

#### 1. `main` 分支

- **用途**：生产环境分支，包含最稳定的代码
- **特点**：
  - 🔒 受保护，不允许直接推送
  - ✅ 所有代码必须经过完整的审查和测试
  - 🏷️ 每次合并都应该打上版本标签（如 `v1.0.0`）
  - 🚀 可以直接部署到生产环境
- **合并来源**：仅接受来自 `test` 分支的合并

#### 2. `dev` 分支

- **用途**：开发环境分支，用于日常开发和功能集成
- **特点**：
  - 🔄 持续集成新功能
  - 👥 团队成员的主要协作分支
  - 🧪 相对稳定但可能包含未完全测试的功能
  - 📦 可以部署到开发环境进行内部测试
- **合并来源**：接受来自 `feat/*` 和 `fix/*` 分支的合并

#### 3. `test` 分支

- **用途**：测试环境分支，用于完整的集成测试和验收测试
- **特点**：
  - 🧪 用于 QA 测试和用户验收测试（UAT）
  - ✅ 必须通过所有测试用例
  - 🔍 进行性能测试和兼容性测试
  - 📋 测试通过后才能合并到 `main`
- **合并来源**：接受来自 `dev` 分支的合并

### 临时分支

以下分支类型是临时的，完成任务后应该删除：

#### 4. `feat/*` 分支

- **用途**：开发新功能
- **命名规范**：`feat/功能简短描述`
- **示例**：
  - `feat/task-auto-association`
  - `feat/dark-mode`
  - `feat/export-data`
- **生命周期**：
  - 从 `dev` 分支创建
  - 完成后合并回 `dev` 分支
  - 合并后删除

#### 5. `fix/*` 分支

- **用途**：修复 Bug
- **命名规范**：`fix/bug简短描述`
- **示例**：
  - `fix/screenshot-capture-error`
  - `fix/memory-leak`
  - `fix/login-redirect`
- **生命周期**：
  - 从 `dev` 分支创建（开发环境的 Bug）
  - 从 `test` 分支创建（测试环境的 Bug）
  - 从 `main` 分支创建（生产环境的紧急 Bug，见 Hotfix）
  - 完成后合并回原始分支
  - 合并后删除

#### 6. `hotfix/*` 分支（特殊情况）

- **用途**：修复生产环境的紧急 Bug
- **命名规范**：`hotfix/紧急bug描述`
- **示例**：
  - `hotfix/critical-security-issue`
  - `hotfix/data-loss-bug`
- **生命周期**：
  - 从 `main` 分支创建
  - 完成后合并回 `main` 和 `dev` 分支
  - 在 `main` 分支打上 patch 版本标签
  - 合并后删除

## 🔄 工作流程

### 功能开发流程

```mermaid
graph LR
    A[dev] -->|创建| B[feat/*]
    B -->|开发| C[提交代码]
    C -->|完成| D[创建 PR]
    D -->|审查通过| E[合并到 dev]
    E -->|集成测试| F[合并到 test]
    F -->|测试通过| G[合并到 main]
    G -->|打标签| H[v1.0.0]
```

### 详细步骤

#### 步骤 1：创建功能分支

```bash
# 确保本地 dev 分支是最新的
git checkout dev
git pull origin dev

# 创建并切换到新的功能分支
git checkout -b feat/your-feature-name
```

#### 步骤 2：开发功能

```bash
# 进行开发工作
# ... 编写代码 ...

# 定期提交更改
git add .
git commit -m "feat: add new feature description"

# 定期推送到远程仓库（备份和协作）
git push origin feat/your-feature-name
```

#### 步骤 3：保持分支更新

```bash
# 定期同步 dev 分支的最新更改
git checkout dev
git pull origin dev

# 切换回功能分支
git checkout feat/your-feature-name

# 合并 dev 的更新（推荐使用 rebase）
git rebase dev
# 或者使用 merge
git merge dev

# 推送更新
git push origin feat/your-feature-name --force-with-lease  # rebase 后需要
```

#### 步骤 4：创建 Pull Request

1. 推送您的分支到 GitHub
2. 在 GitHub 上创建 Pull Request
3. 选择目标分支为 `dev`
4. 填写 PR 模板，描述您的更改
5. 等待代码审查

#### 步骤 5：代码审查和合并

1. 维护者审查代码
2. 根据反馈进行修改
3. 审查通过后，维护者合并 PR
4. 删除功能分支

```bash
# PR 合并后，删除本地和远程分支
git checkout dev
git pull origin dev
git branch -d feat/your-feature-name
git push origin --delete feat/your-feature-name
```

### Bug 修复流程

#### 开发环境 Bug（在 dev 分支发现）

```bash
# 从 dev 创建修复分支
git checkout dev
git pull origin dev
git checkout -b fix/bug-description

# 修复 Bug
# ... 编写代码 ...

git add .
git commit -m "fix: resolve bug description"
git push origin fix/bug-description

# 创建 PR 到 dev 分支
```

#### 测试环境 Bug（在 test 分支发现）

```bash
# 从 test 创建修复分支
git checkout test
git pull origin test
git checkout -b fix/test-bug-description

# 修复 Bug 后，合并回 test
# 同时需要合并到 dev，避免回归
```

#### 生产环境 Bug（在 main 分支发现）

```bash
# 从 main 创建 hotfix 分支
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug

# 修复 Bug
# ... 编写代码 ...

git add .
git commit -m "fix: resolve critical bug"
git push origin hotfix/critical-bug

# 创建 PR 到 main 分支
# 合并后，也需要合并到 dev 和 test 分支
```

### 发布流程

#### 从 dev 到 test

```bash
# 当 dev 分支积累了足够的功能，准备发布时
git checkout test
git pull origin test

# 合并 dev 分支
git merge dev

# 推送到远程
git push origin test

# 通知测试团队开始测试
```

#### 从 test 到 main

```bash
# test 分支测试通过后
git checkout main
git pull origin main

# 合并 test 分支
git merge test

# 打上版本标签
git tag -a v1.0.0 -m "Release version 1.0.0"

# 推送到远程（包括标签）
git push origin main
git push origin v1.0.0

# 发布新版本
```

### 版本标签规范

我们使用 [语义化版本](https://semver.org/lang/zh-CN/)（Semantic Versioning）：

- **格式**：`v主版本号.次版本号.修订号`
- **示例**：`v1.2.3`

**版本号递增规则**：

- **主版本号（MAJOR）**：不兼容的 API 修改
- **次版本号（MINOR）**：向下兼容的功能性新增
- **修订号（PATCH）**：向下兼容的问题修正

```bash
# 示例
v1.0.0  # 首个正式版本
v1.1.0  # 添加新功能
v1.1.1  # Bug 修复
v2.0.0  # 重大更新，可能不兼容旧版本
```

## 📝 分支命名规范

### 命名格式

```
<type>/<description>
```

### Type 类型

| Type | 用途 | 示例 |
|------|------|------|
| `feature` | 新功能开发 | `feat/user-authentication` |
| `fix` | Bug 修复 | `fix/login-error` |
| `hotfix` | 紧急修复 | `hotfix/security-patch` |
| `docs` | 文档更新 | `docs/api-documentation` |
| `refactor` | 代码重构 | `refactor/database-layer` |
| `test` | 测试相关 | `test/unit-tests` |
| `chore` | 构建/工具相关 | `chore/update-dependencies` |
| `perf` | 性能优化 | `perf/query-optimization` |

### 描述命名规则

- ✅ 使用小写字母
- ✅ 使用连字符 `-` 分隔单词
- ✅ 简洁明了，描述分支目的
- ✅ 使用英文（项目国际化考虑）
- ❌ 避免使用特殊字符
- ❌ 避免使用空格
- ❌ 避免过长的名称（建议不超过 50 个字符）

### 命名示例

```bash
# 好的命名
feat/task-auto-association
fix/screenshot-capture-windows
docs/contribution-guide
refactor/api-error-handling
test/integration-tests
perf/vector-search-optimization

# 不好的命名
feat/new_feature  # 不要使用下划线
fix/bug              # 太模糊
feat/SOMETHING    # 不要使用大写
feat/这是一个新功能  # 不要使用中文
```

## 🎯 常见场景

### 场景 1：开发新功能

```bash
# 1. 更新 dev 分支
git checkout dev
git pull origin dev

# 2. 创建功能分支
git checkout -b feat/new-export-function

# 3. 开发功能
# ... 编写代码 ...

# 4. 提交更改
git add .
git commit -m "feat(backend): add data export API"

# 5. 推送分支
git push origin feat/new-export-function

# 6. 在 GitHub 创建 PR 到 dev 分支
```

### 场景 2：修复开发环境 Bug

```bash
# 1. 更新 dev 分支
git checkout dev
git pull origin dev

# 2. 创建修复分支
git checkout -b fix/api-response-error

# 3. 修复 Bug
# ... 编写代码 ...

# 4. 提交更改
git add .
git commit -m "fix(api): correct error response format"

# 5. 推送并创建 PR
git push origin fix/api-response-error
```

### 场景 3：紧急修复生产环境 Bug

```bash
# 1. 从 main 创建 hotfix 分支
git checkout main
git pull origin main
git checkout -b hotfix/critical-data-loss

# 2. 修复 Bug
# ... 编写代码 ...

# 3. 提交更改
git add .
git commit -m "fix: prevent data loss in edge case"

# 4. 推送并创建 PR 到 main
git push origin hotfix/critical-data-loss

# 5. 合并到 main 后，打上 patch 标签
git checkout main
git pull origin main
git tag -a v1.0.1 -m "Hotfix: critical data loss"
git push origin v1.0.1

# 6. 同步到 dev 分支
git checkout dev
git merge main
git push origin dev
```

### 场景 4：解决合并冲突

```bash
# 1. 尝试合并或 rebase 时遇到冲突
git checkout feat/your-feature
git rebase dev
# 冲突提示

# 2. 查看冲突文件
git status

# 3. 手动解决冲突
# 编辑冲突文件，移除冲突标记
# <<<<<<< HEAD
# =======
# >>>>>>> dev

# 4. 标记冲突已解决
git add <resolved-file>

# 5. 继续 rebase
git rebase --continue

# 6. 强制推送（因为历史已改变）
git push origin feat/your-feature --force-with-lease
```

### 场景 5：同步多个分支的 Hotfix

```bash
# Hotfix 已合并到 main
git checkout main
git pull origin main

# 1. 合并到 test
git checkout test
git pull origin test
git merge main
git push origin test

# 2. 合并到 dev
git checkout dev
git pull origin dev
git merge main
git push origin dev
```

## 💡 最佳实践

### 1. 及时同步上游更新

```bash
# 每天开始工作前，同步 dev 分支
git checkout dev
git pull origin dev

# 定期将 dev 的更新合并到功能分支
git checkout feat/your-feature
git rebase dev  # 推荐使用 rebase 保持历史清晰
```

### 2. 保持提交历史清晰

```bash
# 使用有意义的提交信息
git commit -m "feat(ui): add dark mode toggle button"

# 合并小的提交（在推送前）
git rebase -i HEAD~3  # 交互式 rebase 最近 3 个提交

# 在 PR 合并时使用 squash（可选）
# 将多个提交合并为一个逻辑单元
```

### 3. 代码审查前的检查清单

- [ ] 代码遵循项目编码规范
- [ ] 所有测试通过
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] 提交信息符合规范
- [ ] 分支已同步最新的 dev 代码
- [ ] 没有无关的文件或调试代码

### 4. 分支保护规则

在 GitHub 上为长期分支设置保护规则：

**main 分支**：

- ✅ 要求 PR 审查（至少 1 人批准）
- ✅ 要求状态检查通过（CI/CD）
- ✅ 要求分支是最新的
- ✅ 限制可以推送的人员
- ✅ 不允许强制推送

**dev 分支**：

- ✅ 要求 PR 审查
- ✅ 要求状态检查通过
- ⚠️ 允许维护者绕过规则（特殊情况）

**test 分支**：

- ✅ 要求状态检查通过
- ⚠️ 可以直接推送（测试需求）

### 5. 定期清理分支

```bash
# 查看已合并的本地分支
git branch --merged dev

# 删除已合并的本地分支
git branch -d feat/old-feature

# 查看远程已删除但本地还存在的分支
git remote prune origin --dry-run

# 清理这些分支
git remote prune origin

# 删除所有本地的已合并分支（谨慎使用）
git branch --merged dev | grep -v "\* dev" | xargs -n 1 git branch -d
```

### 6. 使用 Git 别名提高效率

在 `~/.gitconfig` 中添加：

```ini
[alias]
    # 常用命令简写
    co = checkout
    br = branch
    ci = commit
    st = status

    # 查看图形化日志
    lg = log --graph --pretty=format:'%Cred%h%Creset -%C(yellow)%d%Creset %s %Cgreen(%cr) %C(bold blue)<%an>%Creset' --abbrev-commit

    # 查看分支关系
    tree = log --graph --oneline --all

    # 同步远程分支
    sync = !git fetch origin && git rebase origin/dev

    # 清理已合并的分支
    cleanup = !git branch --merged dev | grep -v '\\* dev' | xargs -n 1 git branch -d
```

使用示例：

```bash
git co dev          # checkout dev
git lg              # 查看美化的日志
git tree            # 查看分支树
git sync            # 同步 dev 分支
git cleanup         # 清理已合并的分支
```

## ❓ 常见问题

### Q1: 我应该使用 merge 还是 rebase？

**推荐做法**：

- **功能分支同步 dev**：使用 `rebase`

  ```bash
  git checkout feat/your-feature
  git rebase dev
  ```

- **合并到主分支**：使用 `merge`（通过 PR）

  ```bash
  # 在 GitHub PR 中使用 "Squash and merge" 或 "Merge commit"
  ```

**原因**：

- `rebase` 保持历史线性，易于理解
- `merge` 保留分支历史，便于追踪功能开发过程

### Q2: 我的功能分支落后 dev 很多个版本，怎么办？

```bash
# 方法 1：Rebase（推荐，保持历史清晰）
git checkout feat/your-feature
git fetch origin
git rebase origin/dev

# 如果有冲突，解决后继续
git add <resolved-files>
git rebase --continue

# 推送（需要强制推送，因为历史已改变）
git push origin feat/your-feature --force-with-lease

# 方法 2：Merge（简单，但历史会有分叉）
git checkout feat/your-feature
git merge origin/dev
git push origin feat/your-feature
```

### Q3: 我不小心在 main 分支上开发了，怎么办？

```bash
# 1. 创建新的功能分支，保存当前工作
git checkout -b feat/accidental-work

# 2. 推送到远程
git push origin feat/accidental-work

# 3. 重置 main 分支到远程状态
git checkout main
git reset --hard origin/main

# 4. 继续在功能分支上工作
git checkout feat/accidental-work
```

### Q4: 如何撤销已经推送的提交？

```bash
# 方法 1：Revert（推荐，创建新的提交来撤销）
git revert <commit-hash>
git push origin your-branch

# 方法 2：Reset + Force Push（危险，仅用于个人分支）
git reset --hard <commit-hash>
git push origin your-branch --force-with-lease
```

⚠️ **警告**：永远不要在共享分支（main、dev、test）上使用 `--force` 推送！

### Q5: PR 审查时被要求修改，如何更新？

```bash
# 1. 在您的功能分支上继续修改
git checkout feat/your-feature

# 2. 进行修改并提交
git add .
git commit -m "fix: address PR review comments"

# 3. 推送（会自动更新 PR）
git push origin feat/your-feature

# 如果想合并多个小修改到一个提交
git rebase -i HEAD~3  # 合并最近 3 个提交
git push origin feat/your-feature --force-with-lease
```

### Q6: 如何处理长期运行的功能分支？

```bash
# 1. 定期（每天）从 dev 同步更新
git checkout feat/long-running
git fetch origin
git rebase origin/dev

# 2. 考虑拆分为多个小的 PR
# 创建子功能分支
git checkout -b feat/long-running-part1
# 提交部分功能的 PR

# 3. 与团队沟通，避免冲突
# 在 Issue 或讨论区告知正在开发的功能
```

### Q7: 团队成员同时修改了同一个文件，如何协作？

**最佳实践**：

1. **事前沟通**：在开始前讨论，分配不同的任务
2. **小步快跑**：频繁提交小的更改，减少冲突
3. **及时合并**：尽快审查和合并 PR
4. **解决冲突**：遇到冲突时，与相关开发者沟通

```bash
# 如果确实需要同时修改
# 1. 频繁同步
git checkout feat/your-work
git fetch origin
git rebase origin/dev

# 2. 解决冲突时与同事讨论
# 3. 考虑将文件拆分为更小的模块
```

### Q8: 什么时候应该创建 hotfix 分支？

**创建 hotfix 的场景**：

- 🚨 生产环境出现严重 Bug
- 🔒 安全漏洞需要立即修复
- 💥 数据完整性问题
- 🛑 服务中断或严重性能问题

**不需要 hotfix 的场景**：

- 普通 Bug（使用 `fix/*` 分支走正常流程）
- 小的 UI 问题
- 功能改进
- 文档更新

### Q9: 如何查看某个功能是在哪个版本引入的？

```bash
# 查看某个文件的修改历史
git log --follow -- path/to/file

# 查看包含某个功能的标签
git tag --contains <commit-hash>

# 查看两个版本之间的差异
git log v1.0.0..v1.1.0 --oneline

# 搜索提交信息
git log --grep="feature name"
```

### Q10: 我的分支太乱了，想重新开始怎么办？

```bash
# 1. 备份当前工作（如果有未提交的更改）
git stash

# 2. 创建新的干净分支
git checkout dev
git pull origin dev
git checkout -b feat/clean-start

# 3. 挑选需要的提交（cherry-pick）
git cherry-pick <commit-hash1>
git cherry-pick <commit-hash2>

# 4. 或者重新开始开发
# 手动复制代码，重新提交

# 5. 删除旧分支
git branch -D feat/old-messy-branch
git push origin --delete feat/old-messy-branch
```

## 📚 参考资源

### Git 学习资源

- [Pro Git 中文版](https://git-scm.com/book/zh/v2)
- [Git 简明教程](https://rogerdudler.github.io/git-guide/index.zh.html)
- [Git 分支管理策略](https://nvie.com/posts/a-successful-git-branching-model/)
- [GitHub Flow](https://docs.github.com/cn/get-started/quickstart/github-flow)

### Git 工具推荐

- **命令行工具**：
  - [tig](https://jonas.github.io/tig/) - 文本界面的 Git 仓库浏览器
  - [lazygit](https://github.com/jesseduffield/lazygit) - 终端 UI 工具

- **图形界面**：
  - [GitKraken](https://www.gitkraken.com/) - 跨平台 Git 客户端
  - [Sourcetree](https://www.sourcetreeapp.com/) - 免费的 Git 客户端
  - [GitHub Desktop](https://desktop.github.com/) - GitHub 官方客户端

- **VS Code 插件**：
  - GitLens - 增强 Git 功能
  - Git Graph - 可视化分支图
  - Git History - 查看文件历史

## 🎓 Git 命令速查表

### 基础操作

```bash
# 克隆仓库
git clone <repository-url>

# 查看状态
git status

# 添加文件到暂存区
git add <file>
git add .

# 提交更改
git commit -m "message"

# 推送到远程
git push origin <branch>

# 拉取远程更改
git pull origin <branch>
```

### 分支操作

```bash
# 查看分支
git branch
git branch -a  # 包括远程分支

# 创建分支
git branch <branch-name>

# 切换分支
git checkout <branch-name>

# 创建并切换到新分支
git checkout -b <branch-name>

# 删除本地分支
git branch -d <branch-name>
git branch -D <branch-name>  # 强制删除

# 删除远程分支
git push origin --delete <branch-name>
```

### 合并与变基

```bash
# 合并分支
git merge <branch-name>

# Rebase
git rebase <branch-name>

# 交互式 rebase
git rebase -i HEAD~3

# 解决冲突后继续
git rebase --continue

# 中止 rebase
git rebase --abort
```

### 远程操作

```bash
# 查看远程仓库
git remote -v

# 添加远程仓库
git remote add origin <url>

# 获取远程更新
git fetch origin

# 同步远程已删除的分支
git remote prune origin
```

### 撤销与重置

```bash
# 撤销工作区的修改
git checkout -- <file>

# 取消暂存
git reset HEAD <file>

# 撤销提交（保留更改）
git reset --soft HEAD~1

# 撤销提交（丢弃更改）
git reset --hard HEAD~1

# Revert 提交（创建新提交）
git revert <commit-hash>
```

### 查看历史

```bash
# 查看提交历史
git log
git log --oneline
git log --graph --all

# 查看某个文件的历史
git log -- <file>

# 查看某次提交的详情
git show <commit-hash>

# 查看两个提交的差异
git diff <commit1> <commit2>
```

### 标签操作

```bash
# 创建标签
git tag v1.0.0
git tag -a v1.0.0 -m "Release version 1.0.0"

# 推送标签
git push origin v1.0.0
git push origin --tags  # 推送所有标签

# 删除标签
git tag -d v1.0.0
git push origin --delete v1.0.0
```

## 🚦 工作流程图

### 完整的功能开发流程

```
开发者 Fork 仓库
    ↓
克隆到本地
    ↓
创建 feat/* 分支 ← dev 分支
    ↓
本地开发和测试
    ↓
提交代码
    ↓
推送到 GitHub
    ↓
创建 Pull Request → dev 分支
    ↓
代码审查
    ↓
CI/CD 自动测试
    ↓
审查通过
    ↓
合并到 dev 分支
    ↓
集成测试
    ↓
合并到 test 分支
    ↓
完整测试
    ↓
合并到 main 分支
    ↓
打版本标签
    ↓
发布
```

---

## 📞 获取帮助

如果您对 Git Flow 有任何疑问：

1. 📖 查看本文档的常见问题部分
2. 💬 在 GitHub Discussions 中提问
3. 🐛 如果发现文档错误，创建 Issue
4. 👥 咨询项目维护者或经验丰富的贡献者

---

**记住**：好的 Git 工作流程不仅仅是技术问题，更是团队协作的基础。遵循规范，保持沟通，我们一起构建更好的 FreeTodo！🚀
