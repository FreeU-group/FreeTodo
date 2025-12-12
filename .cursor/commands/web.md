# 前端开发快捷命令（free-todo-frontend 版）

## 技术栈信息

- **框架**: Next.js 16 + React 19（App Router）
- **语言**: Node.js 22.x + TypeScript 5.x
- **样式**: Tailwind CSS 4 + shadcn/ui
- **状态管理**: Zustand + React Hooks
- **主题**: next-themes（浅/深色切换）
- **动画/交互**: framer-motion、@dnd-kit
- **Markdown**: react-markdown + remark-gfm
- **图标**: lucide-react
- **包管理**: pnpm 10.x
- **代码质量**: Biome（lint/format/check）

---

## 🎨 组件开发

### 创建新的 React 组件

基于项目规范创建一个新的 React 组件，包含：
- TypeScript 类型定义
- 完整的中文注释
- Tailwind CSS 样式
- 响应式设计
- 国际化支持（如需要）

请在 `free-todo-frontend/components/` 目录下创建组件，并遵循项目的代码规范。

### 创建 Shadcn UI 组件

在现有的 Shadcn UI 组件基础上创建自定义组件：
- 继承 Shadcn UI 的样式系统
- 添加项目特定的功能扩展
- 保持与项目主题的一致性
- 支持深色模式

### 优化现有组件

- 使用 `React.memo/useMemo/useCallback` 控制渲染
- 使用 `tailwind-merge` 合并类名，避免重复样式
- 统一交互动画（framer-motion）与拖拽（@dnd-kit）
- 补充错误处理与边界状态（loading/empty/error）
- 完善类型定义，移除未用 props/变量

---

## 🌐 国际化

项目使用本地类型化字典（非 next-intl）：

- 翻译文件：`free-todo-frontend/lib/i18n/en.ts` 与 `zh.ts`
- 类型定义：`free-todo-frontend/lib/i18n/types.ts`
- 访问方法：`useTranslations(locale)`（从 `lib/i18n/index.ts`，未知 locale 默认回退 `zh`）

### 添加/修改文案

- 先在 `types.ts` 补充字段，确保双语键一致
- 同步在 `en.ts` 与 `zh.ts` 填入对应文案，保持 key 结构匹配
- 避免遗漏插值占位（如 `{count}`），双语保持一致

### 实现多语言组件

为组件添加国际化支持：
- 使用 `useTranslations` hook
- 提取所有硬编码文本
- 添加翻译 key 到 messages 文件
- 测试中英文显示效果

---

## 🎨 样式开发

### 优化 Tailwind CSS 样式

改进组件的 Tailwind CSS 样式：
- 使用项目的自定义主题变量
- 实现深色模式适配
- 优化响应式断点
- 遵循 DRY 原则，提取可复用样式

### 实现深色模式

为组件添加深色模式支持：
- 使用 `dark:` 前缀
- 使用 CSS 变量定义颜色
- 确保对比度符合可访问性标准
- 测试主题切换效果

---

## 🔧 状态管理

### 创建自定义 Hook

创建可复用的 React Hook：
- 遵循 Hook 命名规范（use 前缀）
- 添加完整的 TypeScript 类型
- 包含详细的中文注释
- 实现错误处理和边界情况

### 实现全局状态

使用 Context API 实现全局状态管理：
- 创建 Context 和 Provider
- 实现状态更新逻辑
- 添加性能优化（useMemo、useCallback）
- 提供类型安全的 hook

---

## 🚀 性能优化

### 优化组件性能

分析并优化组件性能：
- 使用 React DevTools Profiler 分析
- 实现代码分割（dynamic import）
- 优化图片加载（Next.js Image）
- 减少不必要的重渲染
- 实现虚拟滚动（如需要）

### 优化包体积

减少前端包体积：
- 分析 bundle 大小
- 移除未使用的依赖
- 实现按需加载
- 优化第三方库引入

---

## 🧪 测试开发

### 编写组件测试

为组件编写测试用例：
- 使用 React Testing Library
- 测试用户交互
- 测试边界情况
- 确保测试覆盖率

### 编写 E2E 测试

编写端到端测试：
- 使用 Playwright 或 Cypress
- 测试关键用户流程
- 模拟真实用户场景
- 添加视觉回归测试

---

## 🔍 调试和修复

### 修复 TypeScript 错误

修复代码中的 TypeScript 类型错误：
- 分析错误信息
- 添加正确的类型定义
- 避免使用 `any` 类型
- 确保类型安全

### 修复 ESLint 警告

修复代码中的 ESLint 警告：
- 遵循项目的 ESLint 配置
- 修复代码风格问题
- 移除未使用的导入
- 优化代码结构

### 调试运行时错误

分析并修复运行时错误：
- 检查浏览器控制台错误
- 分析错误堆栈信息
- 添加错误边界处理
- 实现优雅降级

---

## 📦 依赖管理

### 添加新的 npm 包

安全地添加新的 npm 依赖：
1. 评估包的必要性和安全性
2. 使用 `pnpm add <package>` 安装
3. 更新项目文档
4. 测试功能是否正常

### 升级依赖版本

升级项目依赖到最新版本：
1. 检查 breaking changes
2. 使用 `pnpm update` 升级
3. 运行测试确保兼容性
4. 更新相关代码

---

## 📚 文档编写

### 编写组件文档

为组件编写文档：
- 说明组件用途和功能
- 列出所有 Props 和类型
- 提供使用示例
- 包含注意事项

### 更新 README

更新前端相关的 README 文档：
- 同步最新的技术栈
- 更新开发命令
- 添加新功能说明
- 完善故障排查指南
