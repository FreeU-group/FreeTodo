# Frontend Development Quick Commands (free-todo-frontend version)

## Tech Stack Information

- **Framework**: Next.js 16 + React 19 (App Router)
- **Language**: Node.js 22.x + TypeScript 5.x
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **State Management**: Zustand + React Hooks
- **Data Fetching**: TanStack Query (React Query) v5
- **API Generation**: Orval (auto-generated from OpenAPI)
- **Data Validation**: Zod (runtime type validation)
- **Theming**: next-themes (light/dark toggle)
- **Animation/Interaction**: framer-motion, @dnd-kit
- **Markdown**: react-markdown + remark-gfm
- **Icons**: lucide-react
- **Package Manager**: pnpm 10.x
- **Code Quality**: Biome (lint/format/check)

---

## 🎨 Component Development

### Creating New React Components

Create a new React component based on project conventions, including:
- TypeScript type definitions
- Complete comments
- Tailwind CSS styling
- Responsive design
- Internationalization support (if needed)

Please create components in the `free-todo-frontend/components/` directory and follow the project's code conventions.

### Creating Shadcn UI Components

Create custom components based on existing Shadcn UI components:
- Inherit Shadcn UI's styling system
- Add project-specific functionality extensions
- Maintain consistency with project theme
- Support dark mode

### Optimizing Existing Components

- Use `React.memo/useMemo/useCallback` to control rendering
- Use `tailwind-merge` to merge class names and avoid duplicate styles
- Unify interaction animations (framer-motion) and drag-and-drop (@dnd-kit)
- Add error handling and boundary states (loading/empty/error)
- Improve type definitions, remove unused props/variables

---

## 🌐 Internationalization

The project uses next-intl for internationalization, with language switching managed through Zustand store (no URL routing mode).

- **Translation Files**: `free-todo-frontend/messages/zh.json` and `en.json`
- **Request Configuration**: `free-todo-frontend/i18n/request.ts`
- **Language Management**: `lib/store/locale.ts` (syncs to cookie on switch)
- **Access Method**: `useTranslations(namespace)` imported from `next-intl`

### Adding/Modifying Copy

- Add translation keys in both `messages/zh.json` and `en.json`
- Use nested structures to organize translations, e.g., `page.settings.title`
- Support ICU MessageFormat interpolation syntax, e.g., `{count}` and plural forms

### Implementing Multilingual Components

- Use `useTranslations(namespace)` hook to get translation function
- Access translations via `t('key')`, supports `t('key', { param: value })` for parameters
- Do not hardcode Chinese/English text in components
- Do not use `locale === "zh" ? "中文" : "English"` ternary expressions

---

## 🎨 Styling Development

### Optimizing Tailwind CSS Styles

Improve component Tailwind CSS styles:
- Use project's custom theme variables
- Implement dark mode adaptation
- Optimize responsive breakpoints
- Follow DRY principles, extract reusable styles

### Implementing Dark Mode

Add dark mode support to components:
- Use `dark:` prefix
- Use CSS variables to define colors
- Ensure contrast meets accessibility standards
- Test theme switching effects

---

## 🔧 State Management

### Creating Custom Hooks

Create reusable React Hooks:
- Follow Hook naming conventions (use prefix)
- Add complete TypeScript types
- Include detailed comments
- Implement error handling and edge cases

### Implementing Global State

Use Context API to implement global state management:
- Create Context and Provider
- Implement state update logic
- Add performance optimizations (useMemo, useCallback)
- Provide type-safe hooks

---

## 📡 API and Data Fetching

The project uses **Orval + TanStack Query + Zod** to implement type-safe API calls and data validation.

### Orval Code Generation

- **Configuration File**: `orval.config.ts`
- **Generation Command**: `pnpm orval` (requires backend service running). When backend-frontend interaction APIs change, actively use this command to generate frontend-backend interaction APIs. Do not manually write APIs.
- **Generated Content**: TypeScript types, Zod schemas, React Query hooks
- **Output Directory**: `lib/generated/` (split by API tag, e.g., `todos/`, `chat/`)

**Main Configuration**:
- `input.target`: Backend OpenAPI schema address (http://localhost:8001/openapi.json)
- `output.client`: Generate hooks using react-query
- `output.mode`: tags-split to split files by functional modules
- `override.mutator`: Use custom fetcher (`lib/generated/fetcher.ts`)
- `override.zod.strict`: Enable strict runtime validation

### Using Orval Generated API Hooks

1. **Direct use of generated hooks**: Import from `lib/generated/[module]/`, includes complete type definitions
2. **Wrap hooks to add business logic**: Encapsulate in `lib/query/`, add custom query keys, data transformation, cache strategies, etc.
3. **Reference examples**: `lib/query/todos.ts`, `lib/query/chat.ts`

### TanStack Query Usage Conventions

- **Query Keys**: Managed uniformly in `lib/query/keys.ts`, using hierarchical structure (e.g., `todos.list()`, `todos.detail(id)`)
- **Optimistic Updates**: Update cache in `onMutate`, rollback in `onError`, refetch in `onSettled`
- **Debounced Updates**: Use 500ms debounce for frequently changing fields (e.g., description, notes)
- **Cache Strategy**: Set reasonable `staleTime` (e.g., 30 seconds) to avoid excessive requests

### Zod Data Validation

- **Generated schemas**: Located in `lib/generated/schemas/`, automatically generated by Orval
- **Runtime validation**: Automatically validate API response format in fetcher
- **Form validation**: Use with React Hook Form's `zodResolver`
- **Custom rules**: Can extend custom validation logic based on generated schema

### Custom Fetcher

Located in `lib/generated/fetcher.ts`, responsible for:
- Environment adaptation (client/server URL)
- **Automatic naming style conversion**:
  - Request: camelCase → snake_case (frontend style → backend style)
  - Response: snake_case → camelCase (backend style → frontend style)
- Time string normalization (handling timezone suffix)
- Unified error handling
- Zod schema runtime validation
- Extensible (auth tokens, logging, retry, etc.)

Conversion utilities located in `lib/generated/case-transform.ts`, frontend uniformly uses camelCase type definitions (`lib/types/index.ts`).

### Streaming API Handling

Orval does not support Server-Sent Events, need to manually implement in `lib/api.ts`:
- Use native `fetch` + `ReadableStream`
- Decode and callback chunk by chunk
- Examples: `sendChatMessageStream()`, `planQuestionnaireStream()`

### Type Safety Best Practices

1. Prioritize using camelCase types from `lib/types/index.ts` (fetcher automatically converts)
2. IDs uniformly use `number` type (consistent with backend database)
3. Orval-generated types only used for API layer, business layer uses unified type definitions

### Development Workflow

1. **Backend API changes**: Run `pnpm orval` to regenerate code, check `git diff lib/generated/`
2. **New API**: Backend updates OpenAPI → Generate code → Encapsulate in `lib/query/` → Component usage
3. **Debugging**: Add logs in fetcher to view request/response and validation errors

---

## 🚀 Performance Optimization

### Optimizing Component Performance

Analyze and optimize component performance:
- Use React DevTools Profiler for analysis
- Implement code splitting (dynamic import)
- Optimize image loading (Next.js Image)
- Reduce unnecessary re-renders
- Implement virtual scrolling (if needed)

### Optimizing Bundle Size

Reduce frontend bundle size:
- Analyze bundle size
- Remove unused dependencies
- Implement on-demand loading
- Optimize third-party library imports

---

## 🧪 Testing Development

### Writing Component Tests

Write test cases for components:
- Use React Testing Library
- Test user interactions
- Test edge cases
- Ensure test coverage

### Writing E2E Tests

Write end-to-end tests:
- Use Playwright or Cypress
- Test critical user flows
- Simulate real user scenarios
- Add visual regression tests

---

## 🔍 Debugging and Fixing

### Fixing TypeScript Errors

Fix TypeScript type errors in code:
- Analyze error messages
- Add correct type definitions
- Avoid using `any` type
- Ensure type safety

### Fixing ESLint Warnings

Fix ESLint warnings in code:
- Follow project's ESLint configuration
- Fix code style issues
- Remove unused imports
- Optimize code structure

### Debugging Runtime Errors

Analyze and fix runtime errors:
- Check browser console errors
- Analyze error stack traces
- Add error boundary handling
- Implement graceful degradation

---

## 📦 Dependency Management

### Adding New npm Packages

Safely add new npm dependencies:
1. Evaluate package necessity and security
2. Use `pnpm add <package>` to install
3. Update project documentation
4. Test if functionality works correctly

### Upgrading Dependencies

Upgrade project dependencies to latest versions:
1. Check breaking changes
2. Use `pnpm update` to upgrade
3. Run tests to ensure compatibility
4. Update related code

---

## 📚 Documentation Writing

### Writing Component Documentation

Write documentation for components:
- Explain component purpose and functionality
- List all Props and types
- Provide usage examples
- Include notes and considerations

### Updating README

Update frontend-related README documentation:
- Synchronize latest tech stack
- Update development commands
- Add new feature descriptions
- Improve troubleshooting guide
