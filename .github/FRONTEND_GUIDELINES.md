# Frontend Development Guidelines

**Language**: [English](FRONTEND_GUIDELINES.md) | [中文](FRONTEND_GUIDELINES_CN.md)

## ⚛️ React + TypeScript Frontend Development Standards

This document details the development standards and best practices for the FreeTodo project frontend (Next.js + React + TypeScript).

### Tech Stack

- **Framework**: Next.js 16 + React 19 (App Router)
- **Language**: Node.js 22.x + TypeScript 5.x
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **State Management**: Zustand + React Hooks
- **Data Fetching**: TanStack Query (React Query) v5
- **API Generation**: Orval (auto-generate from OpenAPI)
- **Data Validation**: Zod (runtime type validation)
- **Theming**: next-themes (light/dark mode toggle)
- **Animation/Interaction**: framer-motion, @dnd-kit
- **Markdown**: react-markdown + remark-gfm
- **Icons**: lucide-react
- **Internationalization**: next-intl
- **Package Manager**: pnpm 10.x
- **Code Quality**: Biome (lint/format/check)

## 📋 Table of Contents

- [Code Style](#-code-style)
- [Project Structure](#️-project-structure)
- [Naming Conventions](#-naming-conventions)
- [TypeScript Standards](#-typescript-standards)
- [React Component Standards](#️-react-component-standards)
- [State Management](#-state-management)
- [API Calls](#-api-calls)
- [Internationalization](#-internationalization)
- [Styling](#-styling)
- [Performance](#-performance)
- [Testing](#-testing)
- [Accessibility](#-accessibility)
- [Security](#-security)

## 🎨 Code Style

### Biome Configuration

The project uses [Biome](https://biomejs.dev/) as the linter, formatter, and type checker.

```bash
# Check code
pnpm lint

# Auto-fix issues
pnpm lint --fix

# Format code
pnpm format

# Type check
pnpm typecheck

# Build test
pnpm build
```

### Basic Rules

#### Indentation and Formatting

```typescript
// ✅ Correct: Use 2 spaces
function MyComponent() {
  const [count, setCount] = useState(0);

  if (count > 0) {
    return <div>Count: {count}</div>;
  }

  return null;
}

// ❌ Wrong: Use 4 spaces or tabs
function MyComponent() {
    const [count, setCount] = useState(0);
    return <div>Count: {count}</div>;
}
```

#### Quotes and Semicolons

```typescript
// ✅ Correct: Use double quotes, no semicolons
const message = "Hello, World!"
const name = "Alice"

// ❌ Wrong: Use single quotes and semicolons
const message = 'Hello, World!';
```

#### Imports

```typescript
// ✅ Correct: Import order and grouping
// 1. React and Next.js core
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"

// 2. Third-party libraries
import axios from "axios"
import clsx from "clsx"

// 3. Internal components
import { Button } from "@/components/common/Button"
import { Card } from "@/components/common/Card"

// 4. Utils and types
import { api } from "@/lib/api"
import type { Task } from "@/lib/types"

// 5. Styles
import styles from "./page.module.css"

// ❌ Wrong: Mixed order
import { Button } from "@/components/common/Button"
import { useState } from "react"
import axios from "axios"
```

## 🏗️ Project Structure

```
local-web/
├── app/                      # Next.js App Router
│   ├── layout.tsx           # Root layout
│   ├── page.tsx             # Home page
│   └── apps/                # Feature pages
│       ├── todo-list/       # Todo list
│       ├── todo-detail/     # Todo detail
│       └── [feature]/       # Other features
├── components/              # React components
│   ├── common/             # Common components
│   ├── layout/             # Layout components
│   └── [feature]/          # Feature components
├── lib/                    # Utilities
│   ├── api.ts             # API client (streaming APIs)
│   ├── generated/         # Orval-generated API code
│   │   ├── [module]/      # Split by feature modules
│   │   ├── fetcher.ts     # Custom Fetcher
│   │   └── schemas/       # Zod schemas
│   ├── query/             # TanStack Query hooks wrapper
│   │   └── keys.ts        # Query Keys management
│   ├── types/             # Unified type definitions (camelCase)
│   ├── store/             # Zustand state management
│   ├── hooks/             # Custom Hooks
│   └── utils.ts           # Utility functions
├── messages/              # Internationalization files
│   ├── zh.json            # Chinese translations
│   └── en.json            # English translations
└── public/                # Static assets
```

## 📝 Naming Conventions

### File Naming

```
# ✅ Correct: Components use PascalCase
Button.tsx
TaskCard.tsx
UserProfile.tsx

# ✅ Correct: Non-components use camelCase
api.ts
utils.ts
use-tasks.ts

# ❌ Wrong: Inconsistent naming
button.tsx
task_card.tsx
```

### Component Naming

```typescript
// ✅ Correct: PascalCase
export function TaskCard() {}
export function UserProfile() {}
export default function HomePage() {}

// ❌ Wrong: camelCase
export function taskCard() {}
```

### Variables and Functions

```typescript
// ✅ Correct: camelCase
const userName = "Alice"
const taskCount = 10

function getUserProfile() {}
function calculateTotal() {}

// ❌ Wrong: PascalCase or snake_case
const UserName = "Alice"
const task_count = 10
```

### Constants

```typescript
// ✅ Correct: UPPER_SNAKE_CASE
const MAX_RETRY_COUNT = 3
const API_BASE_URL = "https://api.example.com"
const DEFAULT_PAGE_SIZE = 10

// ❌ Wrong: camelCase
const maxRetryCount = 3
```

### Hooks

```typescript
// ✅ Correct: Start with "use"
function useTasks() {}
function useUser() {}
function useDebounce() {}

// ❌ Wrong: No "use" prefix
function getTasks() {}
```

### Event Handlers

```typescript
// ✅ Correct: Use "handle" prefix
function handleClick() {}
function handleSubmit() {}
function handleChange(e: ChangeEvent<HTMLInputElement>) {}

// ✅ Correct: Callback props use "on" prefix
<Button onClick={handleClick} />
<Input onChange={handleChange} />
```

## 🔤 TypeScript Standards

### Enable Strict Mode

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

### Type Definitions

```typescript
// ✅ Correct: Define clear types
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

// ❌ Wrong: Use any
interface Task {
  id: number
  title: string
  data: any  // Avoid any
}
```

### Component Props

```typescript
// ✅ Correct: Define Props interface
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
  // Component implementation
}

// ✅ Correct: Use generics
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

## ⚛️ React Component Standards

### Function Components

```typescript
// ✅ Correct: Use function components
interface UserProfileProps {
  user: User
  onUpdate: (user: User) => void
}

export function UserProfile({ user, onUpdate }: UserProfileProps) {
  const [isEditing, setIsEditing] = useState(false)

  return (
    <div>
      <h2>{user.name}</h2>
      {/* Component content */}
    </div>
  )
}

// ❌ Wrong: Use class components (unless necessary)
class UserProfile extends React.Component<UserProfileProps> {
  render() {
    return <div>{this.props.user.name}</div>
  }
}
```

### Custom Hooks

```typescript
// ✅ Correct: Create custom hooks
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

// Use custom hook
function TasksPage() {
  const { tasks, loading, error } = useTasks()

  if (loading) return <div>Loading...</div>
  if (error) return <div>Error: {error}</div>

  return <TaskList tasks={tasks} />
}
```

## 🎯 State Management

### Local State (useState)

```typescript
// ✅ Correct: Use functional updates
function Counter() {
  const [count, setCount] = useState(0)

  const increment = () => setCount(prev => prev + 1)
  const decrement = () => setCount(prev => prev - 1)

  return (
    <div>
      <p>Count: {count}</p>
      <button onClick={increment}>+</button>
      <button onClick={decrement}>-</button>
    </div>
  )
}
```

### Global State (Zustand)

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
      set({ error: "Failed to fetch tasks", loading: false })
    }
  },

  createTask: async (taskData: TaskCreate) => {
    try {
      const response = await api.post<Task>("/api/tasks", taskData)
      set(state => ({ tasks: [...state.tasks, response.data] }))
    } catch (error) {
      set({ error: "Failed to create task" })
      throw error
    }
  }
}))
```

## 🌐 API Calls

The project uses **Orval + TanStack Query + Zod** for type-safe API calls and data validation.

### Orval Code Generation

- **Config file**: `orval.config.ts`
- **Generate command**: `pnpm orval` (requires backend service running)
- **Generated content**: TypeScript types, Zod schemas, React Query hooks
- **Output directory**: `lib/generated/` (split by API tags, e.g., `todos/`, `chat/`)

**Main configuration**:
- `input.target`: Backend OpenAPI schema URL (http://localhost:8001/openapi.json)
- `output.client`: Use react-query to generate hooks
- `output.mode`: tags-split by feature modules
- `override.mutator`: Use custom fetcher (`lib/generated/fetcher.ts`)
- `override.zod.strict`: Enable strict runtime validation

### Using Orval-Generated API Hooks

```typescript
// 1. Use generated hooks directly
import { useGetTodos, useCreateTodo } from "@/lib/generated/todos"

function TodoList() {
  const { data: todos, isLoading } = useGetTodos()
  const createTodo = useCreateTodo()

  // Use generated hooks
}

// 2. Wrap hooks in lib/query/ to add business logic
// lib/query/todos.ts
import { useGetTodos as useGetTodosBase } from "@/lib/generated/todos"
import { queryKeys } from "./keys"

export function useTodos() {
  return useGetTodosBase({
    query: {
      queryKey: queryKeys.todos.list(),
      staleTime: 30000, // 30 seconds cache
    },
  })
}
```

### TanStack Query Usage Guidelines

- **Query Keys**: Manage in `lib/query/keys.ts` with hierarchical structure (e.g., `todos.list()`, `todos.detail(id)`)
- **Optimistic Updates**: Update cache in `onMutate`, rollback in `onError`, refetch in `onSettled`
- **Debounced Updates**: Use 500ms debounce for frequently changing fields (e.g., description, notes)
- **Cache Strategy**: Set reasonable `staleTime` (e.g., 30 seconds) to avoid excessive requests

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

### Zod Data Validation

- **Generated schemas**: Located in `lib/generated/schemas/`, auto-generated by Orval
- **Runtime validation**: Automatically validate API response format in fetcher
- **Form validation**: Use with React Hook Form's `zodResolver`

### Custom Fetcher

Located in `lib/generated/fetcher.ts`, responsible for:
- Environment adaptation (client/server URL)
- **Automatic naming style conversion**:
  - Request: camelCase → snake_case (frontend style → backend style)
  - Response: snake_case → camelCase (backend style → frontend style)
- Time string normalization (handle missing timezone suffix)
- Unified error handling
- Zod schema runtime validation

### Streaming API Handling

Orval doesn't support Server-Sent Events, implement manually in `lib/api.ts`:

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

### Type Safety Best Practices

1. Prefer camelCase types from `lib/types/index.ts` (fetcher automatically converts)
2. IDs use `number` type uniformly (consistent with backend database)
3. Orval-generated types only for API layer, business layer uses unified type definitions

### Development Workflow

1. **Backend API changes**: Run `pnpm orval` to regenerate code, check `git diff lib/generated/`
2. **New API**: Backend updates OpenAPI → Generate code → Wrap in `lib/query/` → Use in components
3. **Debugging**: Add logs in fetcher to view requests/responses and validation errors

## 🌍 Internationalization

The project uses **next-intl** for internationalization, managed through Zustand store (no URL routing mode).

- **Translation files**: `messages/zh.json` and `en.json`
- **Request config**: `i18n/request.ts`
- **Language management**: `lib/store/locale.ts` (syncs to cookie on change)
- **Access method**: `useTranslations(namespace)` imported from `next-intl`

### Using Internationalization

```typescript
// ✅ Correct: Use translation hook
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

// ❌ Wrong: Hard-coded text
function TaskList() {
  const locale = useLocale()
  return <h1>{locale === "zh" ? "任务列表" : "Task List"}</h1>
}
```

### Adding/Modifying Translations

- Add translation keys synchronously in `messages/zh.json` and `en.json`
- Use nested structure to organize translations, e.g., `page.settings.title`
- Support ICU MessageFormat interpolation syntax, e.g., `{count}` and plural forms

## 🎨 Styling

### Tailwind CSS 4

The project uses Tailwind CSS 4 and shadcn/ui component library.

```typescript
// ✅ Correct: Use Tailwind utility classes with clsx/tailwind-merge
import { cn } from "@/lib/utils" // tailwind-merge wrapper

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

### Dark Mode

Use `next-themes` to manage theme, use `dark:` prefix in components:

```typescript
function Card({ children }: CardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
      {children}
    </div>
  )
}
```

### shadcn/ui Components

Use shadcn/ui provided components, add via `npx shadcn@latest add [component]`:

```typescript
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

function MyComponent() {
  return (
    <Card>
      <Button variant="default">Click</Button>
    </Card>
  )
}
```

## ⚡ Performance

### React.memo

```typescript
// ✅ Correct: Use React.memo
export const TaskCard = React.memo(function TaskCard({ task }: TaskCardProps) {
  return (
    <div>
      <h3>{task.title}</h3>
      <p>{task.description}</p>
    </div>
  )
})
```

### useCallback and useMemo

```typescript
// ✅ Correct: Use useCallback
function TaskList({ tasks }: TaskListProps) {
  const handleTaskClick = useCallback((taskId: number) => {
    console.log("Task clicked:", taskId)
  }, [])

  return (
    <div>
      {tasks.map(task => (
        <TaskCard key={task.id} task={task} onClick={handleTaskClick} />
      ))}
    </div>
  )
}

// ✅ Correct: Use useMemo
function TaskStats({ tasks }: TaskStatsProps) {
  const stats = useMemo(() => ({
    total: tasks.length,
    completed: tasks.filter(t => t.status === "completed").length,
    pending: tasks.filter(t => t.status === "pending").length
  }), [tasks])

  return (
    <div>
      <p>Total: {stats.total}</p>
      <p>Completed: {stats.completed}</p>
      <p>Pending: {stats.pending}</p>
    </div>
  )
}
```

## 🧪 Testing

```typescript
// TaskCard.test.tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { TaskCard } from "./TaskCard"

describe("TaskCard", () => {
  const mockTask: Task = {
    id: 1,
    title: "Test Task",
    description: "Test Description",
    status: "pending",
    priority: 1,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z"
  }

  it("renders task title", () => {
    render(<TaskCard task={mockTask} />)
    expect(screen.getByText("Test Task")).toBeInTheDocument()
  })

  it("calls onEdit when edit button is clicked", () => {
    const handleEdit = jest.fn()
    render(<TaskCard task={mockTask} onEdit={handleEdit} />)

    fireEvent.click(screen.getByRole("button", { name: /edit/i }))
    expect(handleEdit).toHaveBeenCalledWith(mockTask)
  })
})
```

## ♿ Accessibility

### Semantic HTML

```typescript
// ✅ Correct: Use semantic tags
function TaskList({ tasks }: TaskListProps) {
  return (
    <section>
      <h2>Tasks</h2>
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

// ❌ Wrong: Overuse divs
function TaskList({ tasks }: TaskListProps) {
  return (
    <div>
      <div>Tasks</div>
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

### ARIA Attributes

```typescript
// ✅ Correct: Use ARIA attributes
function Button({ loading, children }: ButtonProps) {
  return (
    <button
      aria-busy={loading}
      aria-label={loading ? "Loading..." : undefined}
      disabled={loading}
    >
      {children}
    </button>
  )
}
```

## 🔒 Security

### XSS Protection

```typescript
// ✅ Correct: React auto-escapes
function TaskDescription({ description }: { description: string }) {
  return <p>{description}</p>
}

// ⚠️ Caution: Use dangerouslySetInnerHTML carefully
import DOMPurify from "dompurify"

function TaskDescription({ html }: { html: string }) {
  const sanitized = DOMPurify.sanitize(html)
  return <div dangerouslySetInnerHTML={{ __html: sanitized }} />
}
```

### Environment Variables

```typescript
// ✅ Correct: Use environment variables
const API_URL = process.env.NEXT_PUBLIC_API_URL
// NEXT_PUBLIC_ prefix exposes to client
// Without prefix, only available on server
```

## ✅ Code Review Checklist

Before submitting code, ensure:

- [ ] Code passes Biome (`pnpm lint`)
- [ ] Code is formatted (`pnpm format`)
- [ ] Code builds successfully (`pnpm build`)
- [ ] All components have TypeScript types
- [ ] Props interfaces are complete
- [ ] Follow naming conventions
- [ ] No `any` types (unless necessary)
- [ ] Large components are split
- [ ] Proper React Hooks usage
- [ ] Key props added to lists
- [ ] Semantic HTML used
- [ ] Accessibility considered
- [ ] API calls use Orval-generated hooks (no manual implementation)
- [ ] Translation text uses `useTranslations`, no hard-coded text
- [ ] TanStack Query Query Keys managed in `lib/query/keys.ts`
- [ ] Streaming APIs use manual implementation in `lib/api.ts`
- [ ] Code has appropriate comments
- [ ] Documentation updated

---

Happy Coding! ⚛️
