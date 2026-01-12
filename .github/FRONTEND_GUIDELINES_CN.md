# 前端开发规范

**语言**: [English](FRONTEND_GUIDELINES.md) | [中文](FRONTEND_GUIDELINES_CN.md)

## ⚛️ React + TypeScript 前端开发规范

本文档详细说明了 FreeTodo 项目前端（Next.js + React + TypeScript）的开发规范和最佳实践。

### 技术栈

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
- **国际化**: next-intl
- **包管理**: pnpm 10.x
- **代码质量**: Biome（lint/format/check）

## 📋 目录

- [代码风格](#-代码风格)
- [项目结构](#-项目结构)
- [命名规范](#-命名规范)
- [TypeScript 规范](#-typescript-规范)
- [React 组件规范](#️-react-组件规范)
- [状态管理](#-状态管理)
- [API 调用](#-api-调用)
- [国际化](#-国际化)
- [样式规范](#-样式规范)
- [性能优化](#-性能优化)
- [测试](#-测试)
- [可访问性](#-可访问性)
- [安全性](#-安全性)

## 🎨 代码风格

### Biome 配置

项目使用 [Biome](https://biomejs.dev/) 作为代码检查器、格式化工具和类型检查器。

```bash
# 检查代码
pnpm lint

# 自动修复问题
pnpm lint --fix

# 格式化代码
pnpm format

# 类型检查
pnpm typecheck

# 构建测试
pnpm build
```

### 基本规则

#### 缩进和格式

```typescript
// ✅ 正确：使用 2 个空格缩进
function MyComponent() {
  const [count, setCount] = useState(0);

  if (count > 0) {
    return <div>Count: {count}</div>;
  }

  return null;
}

// ❌ 错误：使用 4 个空格或 Tab
function MyComponent() {
    const [count, setCount] = useState(0);
    return <div>Count: {count}</div>;
}
```

#### 引号和分号

```typescript
// ✅ 正确：使用双引号，不使用分号
const message = "Hello, World!"
const name = "Alice"

// ❌ 错误：使用单引号和分号
const message = 'Hello, World!';
```

#### 导入语句

```typescript
// ✅ 正确：导入顺序和分组
// 1. React 和 Next.js 核心
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"

// 2. 第三方库
import axios from "axios"
import clsx from "clsx"

// 3. 内部组件
import { Button } from "@/components/common/Button"
import { Card } from "@/components/common/Card"

// 4. 工具函数和类型
import { api } from "@/lib/api"
import type { Task } from "@/lib/types"

// 5. 样式
import styles from "./page.module.css"

// ❌ 错误：混乱的导入顺序
import { Button } from "@/components/common/Button"
import { useState } from "react"
import axios from "axios"
```

## 📦 项目结构

```
free-todo-frontend/
├── app/                      # Next.js App Router
│   ├── layout.tsx           # 根布局
│   ├── page.tsx             # 首页
│   └── apps/                # 功能页面
│       ├── todo-list/       # 待办列表
│       ├── todo-detail/     # 待办详情
│       └── [feature]/       # 其他功能
├── components/              # React 组件
│   ├── common/             # 通用组件
│   ├── layout/             # 布局组件
│   └── [feature]/          # 功能组件
├── lib/                    # 工具库
│   ├── api.ts             # API 客户端（流式 API）
│   ├── generated/         # Orval 生成的 API 代码
│   │   ├── [module]/      # 按功能模块分文件
│   │   ├── fetcher.ts     # 自定义 Fetcher
│   │   └── schemas/       # Zod schemas
│   ├── query/             # TanStack Query hooks 封装
│   │   └── keys.ts        # Query Keys 管理
│   ├── types/             # 统一类型定义（camelCase）
│   ├── store/             # Zustand 状态管理
│   ├── hooks/             # 自定义 Hooks
│   └── utils.ts           # 工具函数
├── messages/              # 国际化翻译文件
│   ├── zh.json            # 中文翻译
│   └── en.json            # 英文翻译
└── public/                # 静态资源
```

## 📝 命名规范

### 文件命名

```
# ✅ 正确：组件使用 PascalCase
Button.tsx
TaskCard.tsx
UserProfile.tsx

# ✅ 正确：非组件使用 camelCase
api.ts
utils.ts
use-tasks.ts

# ❌ 错误：不一致的命名
button.tsx
task_card.tsx
```

### 组件命名

```typescript
// ✅ 正确：使用 PascalCase
export function TaskCard() {}
export function UserProfile() {}
export default function HomePage() {}

// ❌ 错误：使用 camelCase
export function taskCard() {}
```

### 变量和函数命名

```typescript
// ✅ 正确：使用 camelCase
const userName = "Alice"
const taskCount = 10

function getUserProfile() {}
function calculateTotal() {}

// ❌ 错误：使用 PascalCase 或 snake_case
const UserName = "Alice"
const task_count = 10
```

### 常量命名

```typescript
// ✅ 正确：使用 UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3
const API_BASE_URL = "https://api.example.com"
const DEFAULT_PAGE_SIZE = 10

// ❌ 错误：使用 camelCase
const maxRetryCount = 3
```

### Hooks 命名

```typescript
// ✅ 正确：自定义 Hook 以 use 开头
function useTasks() {}
function useUser() {}
function useDebounce() {}

// ❌ 错误：不以 use 开头
function getTasks() {}
```

### 事件处理函数命名

```typescript
// ✅ 正确：使用 handle 前缀
function handleClick() {}
function handleSubmit() {}
function handleChange(e: ChangeEvent<HTMLInputElement>) {}

// ✅ 正确：传递给子组件的回调使用 on 前缀
<Button onClick={handleClick} />
<Input onChange={handleChange} />
```

## 🔤 TypeScript 规范

### 启用严格模式

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### 类型定义

```typescript
// ✅ 正确：定义清晰的类型
interface Task {
  id: number
  title: string
  description: string | null
  status: "pending" | "in_progress" | "completed"
  priority: number
  createdAt: string
  updatedAt: string
}

type TaskStatus = "pending" | "in_progress" | "completed"

// ❌ 错误：使用 any
interface Task {
  id: number
  title: string
  data: any  // 避免使用 any
}
```

### 组件 Props 类型

```typescript
// ✅ 正确：定义 Props 接口
interface TaskCardProps {
  task: Task
  onEdit?: (task: Task) => void
  onDelete?: (taskId: number) => void
  className?: string
}

export function TaskCard({
  task,
  onEdit,
  onDelete,
  className
}: TaskCardProps) {
  // 组件实现
}

// ✅ 正确：使用泛型
interface ListProps<T> {
  items: T[]
  renderItem: (item: T) => React.ReactNode
  keyExtractor: (item: T) => string | number
}

export function List<T>({ items, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <div>
      {items.map(item => (
        <div key={keyExtractor(item)}>
          {renderItem(item)}
        </div>
      ))}
    </div>
  )
}
```

## ⚛️ React 组件规范

### 函数组件

```typescript
// ✅ 正确：使用函数组件
interface UserProfileProps {
  user: User
  onUpdate: (user: User) => void
}

export function UserProfile({ user, onUpdate }: UserProfileProps) {
  const [isEditing, setIsEditing] = useState(false)

  return (
    <div>
      <h2>{user.name}</h2>
      {/* 组件内容 */}
    </div>
  )
}

// ❌ 错误：使用类组件（除非必要）
class UserProfile extends React.Component<UserProfileProps> {
  render() {
    return <div>{this.props.user.name}</div>
  }
}
```

### 自定义 Hooks

```typescript
// ✅ 正确：创建自定义 Hook
function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchTasks()
  }, [])

  const fetchTasks = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.get<Task[]>("/api/tasks")
      setTasks(response.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch tasks")
    } finally {
      setLoading(false)
    }
  }

  return { tasks, loading, error, fetchTasks }
}

// 使用自定义 Hook
function TasksPage() {
  const { tasks, loading, error } = useTasks()

  if (loading) return <div>加载中...</div>
  if (error) return <div>错误: {error}</div>

  return <TaskList tasks={tasks} />
}
```

## 🎯 状态管理

### 本地状态（useState）

```typescript
// ✅ 正确：使用函数式更新
function Counter() {
  const [count, setCount] = useState(0)

  const increment = () => setCount(prev => prev + 1)
  const decrement = () => setCount(prev => prev - 1)

  return (
    <div>
      <p>计数: {count}</p>
      <button onClick={increment}>+</button>
      <button onClick={decrement}>-</button>
    </div>
  )
}
```

### 全局状态（Zustand）

```typescript
// lib/store/taskStore.ts
import { create } from "zustand"

interface TaskState {
  tasks: Task[]
  loading: boolean
  error: string | null
  fetchTasks: () => Promise<void>
  createTask: (task: TaskCreate) => Promise<void>
}

export const useTaskStore = create<TaskState>((set) => ({
  tasks: [],
  loading: false,
  error: null,

  fetchTasks: async () => {
    set({ loading: true, error: null })
    try {
      const response = await api.get<Task[]>("/api/tasks")
      set({ tasks: response.data, loading: false })
    } catch (error) {
      set({ error: "获取任务失败", loading: false })
    }
  },

  createTask: async (taskData: TaskCreate) => {
    try {
      const response = await api.post<Task>("/api/tasks", taskData)
      set(state => ({ tasks: [...state.tasks, response.data] }))
    } catch (error) {
      set({ error: "创建任务失败" })
      throw error
    }
  }
}))
```

## 🌐 API 调用

项目使用 **Orval + TanStack Query + Zod** 实现类型安全的 API 调用和数据验证。

### Orval 代码生成

- **配置文件**: `orval.config.ts`
- **生成命令**: `pnpm orval`（需后端服务运行）
- **生成内容**: TypeScript 类型、Zod schemas、React Query hooks
- **输出目录**: `lib/generated/`（按 API tag 分割，如 `todos/`, `chat/`）

**主要配置**:
- `input.target`: 后端 OpenAPI schema 地址（http://localhost:8001/openapi.json）
- `output.client`: 使用 react-query 生成 hooks
- `output.mode`: tags-split 按功能模块分文件
- `override.mutator`: 使用自定义 fetcher（`lib/generated/fetcher.ts`）
- `override.zod.strict`: 启用严格的运行时验证

### 使用 Orval 生成的 API Hooks

```typescript
// 1. 直接使用生成的 hooks
import { useGetTodos, useCreateTodo } from "@/lib/generated/todos"

function TodoList() {
  const { data: todos, isLoading } = useGetTodos()
  const createTodo = useCreateTodo()

  // 使用生成的 hooks
}

// 2. 在 lib/query/ 中封装，添加业务逻辑
// lib/query/todos.ts
import { useGetTodos as useGetTodosBase } from "@/lib/generated/todos"
import { queryKeys } from "./keys"

export function useTodos() {
  return useGetTodosBase({
    query: {
      queryKey: queryKeys.todos.list(),
      staleTime: 30000, // 30 秒缓存
    },
  })
}
```

### TanStack Query 使用规范

- **Query Keys**: 统一在 `lib/query/keys.ts` 管理，使用层级结构（如 `todos.list()`, `todos.detail(id)`）
- **乐观更新**: 在 `onMutate` 中更新缓存，`onError` 回滚，`onSettled` 重新获取
- **防抖更新**: 针对频繁变化字段（如描述、备注）使用 500ms 防抖
- **缓存策略**: 设置合理的 `staleTime`（如 30 秒），避免过度请求

```typescript
// lib/query/keys.ts
export const queryKeys = {
  todos: {
    all: () => ["todos"] as const,
    lists: () => [...queryKeys.todos.all(), "list"] as const,
    list: (filters?: string) => [...queryKeys.todos.lists(), { filters }] as const,
    details: () => [...queryKeys.todos.all(), "detail"] as const,
    detail: (id: number) => [...queryKeys.todos.details(), id] as const,
  },
}
```

### Zod 数据验证

- **生成的 schemas**: 位于 `lib/generated/schemas/`，由 Orval 自动生成
- **运行时验证**: 在 fetcher 中自动验证 API 响应格式
- **表单验证**: 配合 React Hook Form 的 `zodResolver` 使用

### 自定义 Fetcher

位于 `lib/generated/fetcher.ts`，负责：
- 环境适配（客户端/服务端 URL）
- **命名风格自动转换**:
  - 请求时：camelCase → snake_case（前端风格 → 后端风格）
  - 响应时：snake_case → camelCase（后端风格 → 前端风格）
- 时间字符串标准化（处理无时区后缀）
- 统一错误处理
- Zod schema 运行时验证

### 流式 API 处理

Orval 不支持 Server-Sent Events，需在 `lib/api.ts` 手动实现：

```typescript
// lib/api.ts
export async function sendChatMessageStream(
  message: string,
  onChunk: (chunk: string) => void
) {
  const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  })

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()

  if (!reader) return

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    const chunk = decoder.decode(value, { stream: true })
    onChunk(chunk)
  }
}
```

### 类型安全最佳实践

1. 优先使用 `lib/types/index.ts` 中的 camelCase 类型（fetcher 已自动转换）
2. ID 统一使用 `number` 类型（与后端数据库一致）
3. Orval 生成的类型仅用于 API 层，业务层使用统一类型定义

### 开发工作流

1. **后端 API 变更**: 运行 `pnpm orval` 重新生成代码，检查 `git diff lib/generated/`
2. **新增 API**: 后端更新 OpenAPI → 生成代码 → 在 `lib/query/` 封装 → 组件使用
3. **调试**: 在 fetcher 中添加日志，查看请求/响应和验证错误

## 🌍 国际化

项目使用 **next-intl** 实现国际化，通过 Zustand store 管理语言切换（无 URL 路由模式）。

- **翻译文件**: `messages/zh.json` 与 `en.json`
- **请求配置**: `i18n/request.ts`
- **语言管理**: `lib/store/locale.ts`（切换时同步到 cookie）
- **访问方法**: `useTranslations(namespace)` 从 `next-intl` 导入

### 使用国际化

```typescript
// ✅ 正确：使用翻译 hook
import { useTranslations } from "next-intl"

function TaskList() {
  const t = useTranslations("page.todo")

  return (
    <div>
      <h1>{t("title")}</h1>
      <p>{t("description", { count: tasks.length })}</p>
    </div>
  )
}

// ❌ 错误：硬编码文本
function TaskList() {
  const locale = useLocale()
  return <h1>{locale === "zh" ? "任务列表" : "Task List"}</h1>
}
```

### 添加/修改文案

- 在 `messages/zh.json` 和 `en.json` 中同步添加翻译 key
- 使用嵌套结构组织翻译，如 `page.settings.title`
- 支持 ICU MessageFormat 插值语法，如 `{count}` 和复数形式

## 🎨 样式规范

### Tailwind CSS 4

项目使用 Tailwind CSS 4 和 shadcn/ui 组件库。

```typescript
// ✅ 正确：使用 Tailwind 工具类和 clsx/tailwind-merge
import { cn } from "@/lib/utils" // tailwind-merge 封装

function Button({ children, variant = "primary", className }: ButtonProps) {
  return (
    <button
      className={cn(
        "px-4 py-2 rounded-lg font-medium transition-colors",
        variant === "primary" && "bg-blue-500 hover:bg-blue-600 text-white",
        variant === "secondary" && "bg-gray-200 hover:bg-gray-300 text-gray-800",
        className
      )}
    >
      {children}
    </button>
  )
}
```

### 深色模式

使用 `next-themes` 管理主题，组件中使用 `dark:` 前缀：

```typescript
function Card({ children }: CardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
      {children}
    </div>
  )
}
```

### shadcn/ui 组件

使用 shadcn/ui 提供的组件，可通过 `npx shadcn@latest add [component]` 添加：

```typescript
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

function MyComponent() {
  return (
    <Card>
      <Button variant="default">点击</Button>
    </Card>
  )
}
```

## ⚡ 性能优化

### React.memo

```typescript
// ✅ 正确：使用 React.memo
export const TaskCard = React.memo(function TaskCard({ task }: TaskCardProps) {
  return (
    <div>
      <h3>{task.title}</h3>
      <p>{task.description}</p>
    </div>
  )
})
```

### useCallback 和 useMemo

```typescript
// ✅ 正确：使用 useCallback
function TaskList({ tasks }: TaskListProps) {
  const handleTaskClick = useCallback((taskId: number) => {
    console.log("任务点击:", taskId)
  }, [])

  return (
    <div>
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} onClick={handleTaskClick} />
      ))}
    </div>
  )
}

// ✅ 正确：使用 useMemo
function TaskStats({ tasks }: TaskStatsProps) {
  const stats = useMemo(() => ({
    total: tasks.length,
    completed: tasks.filter(t => t.status === "completed").length,
    pending: tasks.filter(t => t.status === "pending").length
  }), [tasks])

  return (
    <div>
      <p>总计: {stats.total}</p>
      <p>已完成: {stats.completed}</p>
      <p>待处理: {stats.pending}</p>
    </div>
  )
}
```

## 🧪 测试

```typescript
// TaskCard.test.tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { TaskCard } from "./TaskCard"

describe("TaskCard", () => {
  const mockTask: Task = {
    id: 1,
    title: "测试任务",
    description: "测试描述",
    status: "pending",
    priority: 1,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  }

  it("渲染任务标题", () => {
    render(<TaskCard task={mockTask} />)
    expect(screen.getByText("测试任务")).toBeInTheDocument()
  })

  it("点击编辑按钮时调用 onEdit", () => {
    const handleEdit = jest.fn()
    render(<TaskCard task={mockTask} onEdit={handleEdit} />)

    fireEvent.click(screen.getByRole("button", { name: /编辑/i }))
    expect(handleEdit).toHaveBeenCalledWith(mockTask)
  })
})
```

## ♿ 可访问性

### 语义化 HTML

```typescript
// ✅ 正确：使用语义化标签
function TaskList({ tasks }: TaskListProps) {
  return (
    <section>
      <h2>任务列表</h2>
      <ul>
        {tasks.map(task => (
          <li key={task.id}>
            <article>
              <h3>{task.title}</h3>
              <p>{task.description}</p>
            </article>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ❌ 错误：过度使用 div
function TaskList({ tasks }: TaskListProps) {
  return (
    <div>
      <div>任务列表</div>
      <div>
        {tasks.map(task => (
          <div key={task.id}>
            <div>{task.title}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

### ARIA 属性

```typescript
// ✅ 正确：使用 ARIA 属性
function Button({ loading, children }: ButtonProps) {
  return (
    <button
      aria-busy={loading}
      aria-label={loading ? "加载中..." : undefined}
      disabled={loading}
    >
      {children}
    </button>
  )
}
```

## 🔒 安全性

### XSS 防护

```typescript
// ✅ 正确：React 自动转义
function TaskDescription({ description }: { description: string }) {
  return <p>{description}</p>
}

// ⚠️ 注意：使用 dangerouslySetInnerHTML 需谨慎
import DOMPurify from "dompurify"

function TaskDescription({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html)
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />
}
```

### 环境变量

```typescript
// ✅ 正确：使用环境变量
const API_URL = process.env.NEXT_PUBLIC_API_URL
// NEXT_PUBLIC_ 前缀的变量会暴露给客户端
// 没有前缀的变量只在服务端可用
```

## ✅ 代码检查清单

在提交代码前，请确保：

- [ ] 代码通过 Biome 检查（`pnpm lint`）
- [ ] 代码已格式化（`pnpm format`）
- [ ] 代码可以成功构建（`pnpm build`）
- [ ] 所有组件和函数都有 TypeScript 类型
- [ ] Props 接口定义完整
- [ ] 遵循命名规范
- [ ] 没有使用 `any` 类型（除非必要）
- [ ] 大组件已拆分为小组件
- [ ] 正确使用 React Hooks
- [ ] 添加了必要的 key 属性
- [ ] 使用了语义化 HTML 标签
- [ ] 考虑了可访问性
- [ ] API 调用使用 Orval 生成的 hooks（不要手写）
- [ ] 翻译文本使用 `useTranslations`，禁止硬编码
- [ ] TanStack Query 的 Query Keys 在 `lib/query/keys.ts` 中管理
- [ ] 流式 API 使用 `lib/api.ts` 中的手动实现
- [ ] 代码有适当的注释
- [ ] 更新了相关文档

---

Happy Coding! ⚛️
