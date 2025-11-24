# 前端开发规范

**语言**: [English](FRONTEND_GUIDELINES.md) | [中文](FRONTEND_GUIDELINES_CN.md)

## ⚛️ React + TypeScript 前端开发规范

本文档详细说明了 LifeTrace 项目前端（Next.js + React + TypeScript）的开发规范和最佳实践。

## 📋 目录

- [代码风格](#-代码风格)
- [项目结构](#-项目结构)
- [命名规范](#-命名规范)
- [TypeScript 规范](#-typescript-规范)
- [React 组件规范](#️-react-组件规范)
- [状态管理](#-状态管理)
- [API 调用](#-api-调用)
- [样式规范](#-样式规范)
- [性能优化](#-性能优化)
- [测试](#-测试)
- [可访问性](#-可访问性)
- [安全性](#-安全性)

## 🎨 代码风格

### ESLint 配置

```bash
# 检查代码
pnpm lint

# 自动修复问题
pnpm lint --fix

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
frontend/
├── app/                      # Next.js App Router
│   ├── layout.tsx           # 根布局
│   ├── page.tsx             # 首页
│   └── [feature]/           # 功能页面
├── components/              # React 组件
│   ├── common/             # 通用组件
│   ├── layout/             # 布局组件
│   └── [feature]/          # 功能组件
├── lib/                    # 工具库
│   ├── api.ts             # API 客户端
│   ├── types.ts           # 类型定义
│   ├── utils.ts           # 工具函数
│   └── store/             # 状态管理
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

### API 客户端

```typescript
// lib/api.ts
import axios from "axios"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json"
  }
})

// 请求拦截器
api.interceptors.request.use(
  config => {
    const token = localStorage.getItem("token")
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  error => Promise.reject(error)
)

// 响应拦截器
api.interceptors.response.use(
  response => response,
  error => {
    if (error.response?.status === 401) {
      window.location.href = "/login"
    }
    return Promise.reject(error)
  }
)
```

## 🎨 样式规范

### Tailwind CSS

```typescript
// ✅ 正确：使用 Tailwind 工具类
import clsx from "clsx"

function Button({ children, variant = "primary" }: ButtonProps) {
  return (
    <button
      className={clsx(
        "px-4 py-2 rounded-lg font-medium transition-colors",
        variant === "primary" && "bg-blue-500 hover:bg-blue-600 text-white",
        variant === "secondary" && "bg-gray-200 hover:bg-gray-300 text-gray-800"
      )}
    >
      {children}
    </button>
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

- [ ] 代码通过 ESLint 检查（`pnpm lint`）
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
- [ ] 代码有适当的注释
- [ ] 更新了相关文档

---

Happy Coding! ⚛️
