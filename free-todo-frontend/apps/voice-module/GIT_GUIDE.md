# Git 使用指南 - 语音模块开发

## 一、当前状态

你现在在 `feat/zy/voice_module` 分支上，已经完成了部分语音模块代码。

## 二、提交当前代码

### 1. 查看当前状态

```bash
# 查看当前分支
git branch

# 查看修改的文件
git status

# 查看具体修改内容
git diff
```

### 2. 提交代码

```bash
# 1. 添加所有修改的文件
git add .

# 或者只添加特定文件
git add free-todo-frontend/apps/voice-module/
git add lifetrace/routers/audio.py
git add lifetrace/routers/deepseek.py

# 2. 提交（写清楚提交信息）
git commit -m "feat: 实现语音模块基础功能

- 添加录音、识别、优化、日程提取服务
- 实现实时转录显示
- 集成后端 API（音频上传、DeepSeek 代理）
- 支持麦克风和系统音频输入
- 添加聊天助手功能"

# 3. 推送到远程仓库
git push origin feat/zy/voice_module
```

### 3. 提交信息规范

推荐使用以下格式：

```
<type>: <subject>

<body>

<footer>
```

**Type 类型**：
- `feat`: 新功能
- `fix`: 修复 bug
- `docs`: 文档更新
- `style`: 代码格式（不影响功能）
- `refactor`: 重构
- `test`: 测试相关
- `chore`: 构建/工具相关

**示例**：
```bash
git commit -m "feat: 添加系统音频支持

- 支持选择麦克风或系统音频作为输入源
- 在音频片段中标注音频来源
- 更新 UI 添加音频源选择器"
```

---

## 三、继续开发流程

### 场景 1：在当前分支继续开发

```bash
# 1. 确保在正确的分支
git checkout feat/zy/voice_module

# 2. 拉取最新代码（如果有其他人也在开发）
git pull origin feat/zy/voice_module

# 3. 开始开发新功能
# ... 修改代码 ...

# 4. 提交
git add .
git commit -m "feat: 添加日程自动创建 Todo 功能"
git push origin feat/zy/voice_module
```

### 场景 2：从主分支获取最新代码

```bash
# 1. 保存当前工作（如果有未提交的修改）
git stash push -m "临时保存：正在开发的功能"

# 2. 切换到主分支
git checkout main  # 或 master，取决于你的主分支名

# 3. 拉取最新代码
git pull origin main

# 4. 切换回你的分支
git checkout feat/zy/voice_module

# 5. 合并主分支的更新
git merge main

# 6. 如果有冲突，解决冲突后
git add .
git commit -m "merge: 合并主分支最新代码"

# 7. 恢复之前的工作
git stash pop
```

---

## 四、版本恢复（出现问题时的处理）

### 方法 1：撤销未提交的修改

```bash
# 查看修改的文件
git status

# 撤销单个文件的修改
git checkout -- <文件名>

# 撤销所有未提交的修改（危险！）
git checkout -- .

# 或者使用 reset（更彻底）
git reset --hard HEAD
```

### 方法 2：撤销已提交但未推送的提交

```bash
# 查看提交历史
git log --oneline

# 撤销最后一次提交（保留修改）
git reset --soft HEAD~1

# 撤销最后一次提交（不保留修改）
git reset --hard HEAD~1

# 撤销多个提交
git reset --hard HEAD~3  # 撤销最近 3 次提交
```

### 方法 3：恢复到特定提交

```bash
# 1. 查看提交历史
git log --oneline

# 输出示例：
# abc1234 feat: 添加系统音频支持
# def5678 feat: 实现实时转录
# ghi9012 feat: 基础录音功能

# 2. 恢复到特定提交（创建新提交）
git revert <提交hash>
# 例如：git revert def5678

# 3. 或者直接重置到某个提交（危险！会丢失之后的提交）
git reset --hard <提交hash>
```

### 方法 4：创建备份分支（推荐）

在开始重大修改前，先创建备份：

```bash
# 1. 创建备份分支
git branch feat/zy/voice_module-backup

# 2. 继续在当前分支开发
# ... 修改代码 ...

# 3. 如果出现问题，切换回备份分支
git checkout feat/zy/voice_module-backup

# 4. 或者从备份分支恢复
git checkout feat/zy/voice_module
git reset --hard feat/zy/voice_module-backup
```

---

## 五、常见场景处理

### 场景 1：提交后发现漏了文件

```bash
# 1. 添加漏掉的文件
git add <漏掉的文件>

# 2. 修改最后一次提交（不创建新提交）
git commit --amend --no-edit

# 3. 如果已经推送，需要强制推送（谨慎使用！）
git push origin feat/zy/voice_module --force
```

### 场景 2：提交信息写错了

```bash
# 修改最后一次提交的信息
git commit --amend -m "新的提交信息"

# 如果已经推送，需要强制推送
git push origin feat/zy/voice_module --force
```

### 场景 3：合并冲突

```bash
# 1. 尝试合并
git merge main

# 2. 如果有冲突，Git 会提示
# 打开冲突文件，找到 <<<<<<< ======= >>>>>>> 标记
# 手动解决冲突

# 3. 解决冲突后
git add <解决冲突的文件>
git commit -m "merge: 解决合并冲突"
```

### 场景 4：误删文件

```bash
# 恢复被删除的文件
git checkout HEAD -- <被删除的文件>

# 或者恢复所有被删除的文件
git checkout HEAD -- .
```

---

## 六、最佳实践

### 1. 频繁提交

```bash
# 不要等到所有功能完成才提交
# 每完成一个小功能就提交一次

git add .
git commit -m "feat: 添加音频源选择器"
git push origin feat/zy/voice_module
```

### 2. 提交前检查

```bash
# 提交前先检查
git status        # 查看要提交的文件
git diff          # 查看具体修改
git diff --staged # 查看已暂存的修改
```

### 3. 使用分支保护

```bash
# 重要：不要直接在主分支开发
# 始终在功能分支开发

git checkout -b feat/zy/new-feature
# ... 开发 ...
git push origin feat/zy/new-feature
```

### 4. 定期备份

```bash
# 定期创建备份分支
git branch backup-$(date +%Y%m%d)
```

---

## 七、完整工作流程示例

### 开始新功能开发

```bash
# 1. 确保在最新代码基础上
git checkout feat/zy/voice_module
git pull origin feat/zy/voice_module

# 2. 创建新功能分支（可选）
git checkout -b feat/zy/voice-todo-integration

# 3. 开发功能
# ... 编写代码 ...

# 4. 测试功能
# ... 测试 ...

# 5. 提交
git add .
git commit -m "feat: 实现日程自动创建 Todo"
git push origin feat/zy/voice-todo-integration

# 6. 合并回主功能分支（如果创建了新分支）
git checkout feat/zy/voice_module
git merge feat/zy/voice-todo-integration
git push origin feat/zy/voice_module
```

### 出现问题时的恢复

```bash
# 1. 查看提交历史，找到出问题前的提交
git log --oneline

# 2. 创建备份（以防万一）
git branch backup-before-fix

# 3. 恢复到出问题前的提交
git reset --hard <提交hash>

# 4. 或者使用 revert（更安全）
git revert <有问题的提交hash>
```

---

## 八、常用命令速查

```bash
# 查看状态
git status

# 查看提交历史
git log --oneline
git log --graph --oneline --all

# 查看差异
git diff
git diff HEAD~1  # 与上一次提交对比

# 分支操作
git branch                    # 查看所有分支
git branch -a                 # 查看所有分支（包括远程）
git checkout <分支名>          # 切换分支
git checkout -b <新分支名>    # 创建并切换分支

# 提交操作
git add .                     # 添加所有修改
git commit -m "提交信息"      # 提交
git push origin <分支名>       # 推送到远程

# 撤销操作
git checkout -- <文件>        # 撤销文件修改
git reset --soft HEAD~1       # 撤销提交（保留修改）
git reset --hard HEAD~1       # 撤销提交（不保留修改）

# 备份和恢复
git branch <备份分支名>        # 创建备份分支
git stash                     # 临时保存修改
git stash pop                 # 恢复临时保存的修改
```

---

## 九、注意事项

### ⚠️ 危险操作

以下操作会丢失代码，使用前请确认：

```bash
# 1. 强制推送（会覆盖远程代码）
git push --force

# 2. 硬重置（会丢失未提交的修改）
git reset --hard HEAD

# 3. 删除分支（会丢失分支上的代码）
git branch -D <分支名>
```

### ✅ 安全操作

以下操作不会丢失代码：

```bash
# 1. 查看操作（只读）
git log
git status
git diff

# 2. 创建分支（不会影响当前分支）
git branch <新分支名>

# 3. 切换分支（会保留所有修改）
git checkout <分支名>

# 4. 暂存修改（可以恢复）
git stash
git stash pop
```

---

## 十、推荐工作流程

### 日常开发

```bash
# 1. 每天开始前
git checkout feat/zy/voice_module
git pull origin feat/zy/voice_module

# 2. 开发功能
# ... 编写代码 ...

# 3. 完成一个小功能后
git add .
git commit -m "feat: 功能描述"
git push origin feat/zy/voice_module

# 4. 重复步骤 2-3
```

### 遇到问题时

```bash
# 1. 先创建备份
git branch backup-$(date +%Y%m%d-%H%M%S)

# 2. 尝试恢复
git log --oneline  # 找到出问题前的提交
git reset --hard <提交hash>

# 3. 如果恢复成功，继续开发
# 如果恢复失败，从备份分支恢复
git checkout backup-*
```

---

## 总结

1. **提交当前代码**：`git add .` → `git commit -m "..."` → `git push`
2. **继续开发**：在同一个分支上继续提交
3. **版本恢复**：使用 `git log` 找到提交，然后用 `git reset` 或 `git revert`
4. **最佳实践**：频繁提交、创建备份、不要强制推送

有问题随时可以查看这个文档！

---

**文档版本**：v1.0  
**最后更新**：2025-12-21  
**维护者**：LifeTrace Team From zy

