# 前端开发快捷命令（free-todo-frontend 版）

## 技术栈信息

- **框架**: Next.js 16 + React 19（App Router）
- **语言**: Node.js 22.x + TypeScript 5.x
- **样式**: Tailwind CSS 4 + shadcn/ui
- **状态管理**: Zustand + React Hooks
- **数据获取**: TanStack Query (React Query) v5
- **API 生成**: Orval（根据 OpenAPI 自动生成）
- **数据验证**: Zod（运行时类型验证）
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

## 📡 API 与数据获取

项目使用 **Orval + TanStack Query + Zod** 实现类型安全的 API 调用和数据验证。

### Orval 代码生成

- **配置文件**：`orval.config.ts`
- **生成命令**：`pnpm orval`（需后端服务运行）
- **生成内容**：TypeScript 类型、Zod schemas、React Query hooks
- **输出目录**：`lib/generated/`（按 API tag 分割，如 `todos/`, `chat/`）

**主要配置**：
- `input.target`：后端 OpenAPI schema 地址（http://localhost:8000/openapi.json）
- `output.client`：使用 react-query 生成 hooks
- `output.mode`：tags-split 按功能模块分文件
- `override.mutator`：使用自定义 fetcher（`lib/generated/fetcher.ts`）
- `override.zod.strict`：启用严格的运行时验证

### 使用 Orval 生成的 API Hooks

1. **直接使用生成的 hooks**：从 `lib/generated/[module]/` 导入，已包含完整类型定义
2. **包装 hooks 添加业务逻辑**：在 `lib/query/` 中封装，添加自定义 query key、数据转换、缓存策略等
3. **参考示例**：`lib/query/todos.ts`、`lib/query/chat.ts`

### TanStack Query 使用规范

- **Query Keys**：统一在 `lib/query/keys.ts` 管理，使用层级结构（如 `todos.list()`, `todos.detail(id)`）
- **乐观更新**：在 `onMutate` 中更新缓存，`onError` 回滚，`onSettled` 重新获取
- **防抖更新**：针对频繁变化字段（如描述、备注）使用 500ms 防抖
- **缓存策略**：设置合理的 `staleTime`（如 30 秒），避免过度请求

### Zod 数据验证

- **生成的 schemas**：位于 `lib/generated/schemas/`，由 Orval 自动生成
- **运行时验证**：在 fetcher 中自动验证 API 响应格式
- **表单验证**：配合 React Hook Form 的 `zodResolver` 使用
- **自定义规则**：可基于生成的 schema 扩展自定义验证逻辑

### 自定义 Fetcher

位于 `lib/generated/fetcher.ts`，负责：
- 环境适配（客户端/服务端 URL）
- 时间字符串标准化（处理无时区后缀）
- Zod schema 运行时验证
- 统一错误处理
- 可扩展（认证 token、日志、重试等）

### 流式 API 处理

Orval 不支持 Server-Sent Events，需在 `lib/api.ts` 手动实现：
- 使用原生 `fetch` + `ReadableStream`
- 逐块解码并回调处理
- 示例：`sendChatMessageStream()`, `planQuestionnaireStream()`

### 类型安全最佳实践

1. 优先使用 Orval 生成的类型，避免重复定义
2. 在查询层做类型转换（如后端 number id → 前端 string id）
3. 统一类型导出点（`lib/api.ts`），便于重用

### 开发工作流

1. **后端 API 变更**：运行 `pnpm orval` 重新生成代码，检查 `git diff lib/generated/`
2. **新增 API**：后端更新 OpenAPI → 生成代码 → 在 `lib/query/` 封装 → 组件使用
3. **调试**：在 fetcher 中添加日志，查看请求/响应和验证错误

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
