# Next.js → Vite 迁移分析

## 📊 项目规模评估

### 代码规模
- **组件数量**: 80+ 个 React 组件
- **页面数量**: 1 个主页面（App Router）
- **应用模块**: 10+ 个功能模块（chat, todo-list, voice-module, calendar 等）
- **代码行数**: 估计 15,000+ 行 TypeScript/TSX 代码

### Next.js 特性使用情况

#### ✅ 已使用
1. **App Router** - 使用 `app/` 目录结构
2. **next-intl** - 国际化支持（`lib/i18n/request.ts`）
3. **next-themes** - 主题切换
4. **next/image** - 图片优化（需要检查使用频率）
5. **next/link** - 路由导航（需要检查使用频率）
6. **Metadata API** - SEO 元数据（`app/layout.tsx`）

#### ❌ 未使用
1. **API Routes** - 没有 `/app/api/` 目录
2. **Server Components** - 所有组件都是 `"use client"`
3. **getServerSideProps/getStaticProps** - 未使用
4. **ISR (Incremental Static Regeneration)** - 未使用
5. **Middleware** - 未使用

## 🔄 迁移工作量评估

### 1. 路由系统迁移 ⭐⭐⭐⭐ (高工作量)

**当前**: Next.js App Router
```typescript
// app/layout.tsx
export default async function RootLayout({ children }) {
  // ...
}

// app/page.tsx
export default function HomePage() {
  // ...
}
```

**迁移到**: React Router v6 或 TanStack Router
```typescript
// src/App.tsx
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

**工作量**: 
- 创建路由配置文件
- 修改所有路由相关代码
- 测试路由功能
- **估计时间**: 2-3 天

### 2. 国际化迁移 ⭐⭐⭐ (中等工作量)

**当前**: next-intl
```typescript
import { getLocale, getMessages } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
```

**迁移到**: react-intl 或 i18next
```typescript
import { IntlProvider } from 'react-intl';
// 或
import { useTranslation } from 'react-i18next';
```

**工作量**:
- 替换国际化库
- 修改所有使用国际化的组件
- 调整消息文件结构
- **估计时间**: 1-2 天

### 3. 图片优化迁移 ⭐⭐ (低-中等工作量)

**当前**: next/image
```typescript
import Image from 'next/image';
<Image src="/logo.png" alt="Logo" width={32} height={32} />
```

**迁移到**: 普通 img 标签或 vite-imagetools
```typescript
<img src="/logo.png" alt="Logo" width={32} height={32} />
// 或使用 vite-imagetools 进行优化
```

**工作量**:
- 查找所有 `next/image` 使用
- 替换为普通 img 或配置 vite-imagetools
- **估计时间**: 0.5-1 天

### 4. 构建配置迁移 ⭐⭐ (低工作量)

**当前**: `next.config.ts`
```typescript
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // ...
};
```

**迁移到**: `vite.config.ts`
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // ...
});
```

**工作量**:
- 创建 vite.config.ts
- 配置路径别名（@/）
- 配置环境变量
- 配置代理（API rewrites）
- **估计时间**: 0.5-1 天

### 5. 环境变量迁移 ⭐ (低工作量)

**当前**: Next.js 环境变量（`NEXT_PUBLIC_*`）
```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL;
```

**迁移到**: Vite 环境变量（`VITE_*`）
```typescript
const API_URL = import.meta.env.VITE_API_URL;
```

**工作量**:
- 重命名环境变量
- 更新所有使用环境变量的代码
- **估计时间**: 0.5 天

### 6. Electron 集成调整 ⭐⭐ (低-中等工作量)

**当前**: 
```typescript
mainWindow.loadURL('http://localhost:3000');
```

**迁移到**:
```typescript
// Vite 默认端口是 5173
mainWindow.loadURL('http://localhost:5173');
// 或使用 file:// 协议加载构建后的文件
```

**工作量**:
- 更新 Electron main.ts 中的 URL
- 调整开发/生产环境的加载逻辑
- **估计时间**: 0.5 天

### 7. 样式和 CSS 迁移 ⭐ (低工作量)

**当前**: Tailwind CSS + globals.css
- Vite 完全支持 Tailwind CSS
- 只需要调整导入方式

**工作量**: 几乎无需改动
**估计时间**: 0.5 天

## 📈 总工作量估算

| 任务 | 工作量 | 估计时间 |
|------|--------|----------|
| 路由系统迁移 | ⭐⭐⭐⭐ | 2-3 天 |
| 国际化迁移 | ⭐⭐⭐ | 1-2 天 |
| 图片优化迁移 | ⭐⭐ | 0.5-1 天 |
| 构建配置迁移 | ⭐⭐ | 0.5-1 天 |
| 环境变量迁移 | ⭐ | 0.5 天 |
| Electron 集成调整 | ⭐⭐ | 0.5 天 |
| 样式和 CSS | ⭐ | 0.5 天 |
| **测试和调试** | ⭐⭐⭐⭐ | 2-3 天 |
| **总计** | | **7-12 天** |

## ✅ 可行性分析

### 优势
1. ✅ **没有使用 Server Components** - 所有组件都是客户端组件，迁移更容易
2. ✅ **没有 API Routes** - 不需要迁移后端逻辑
3. ✅ **没有复杂的 SSR** - 主要是客户端渲染
4. ✅ **Vite 性能更好** - 开发体验和构建速度更快
5. ✅ **解决 SSR 问题** - 完全避免 SSR 导致的窗口显示问题

### 挑战
1. ⚠️ **路由系统重构** - 需要完全重写路由逻辑
2. ⚠️ **国际化库替换** - 需要学习新的 API
3. ⚠️ **测试工作量大** - 需要全面测试所有功能
4. ⚠️ **可能引入新 bug** - 迁移过程中可能发现隐藏问题

## 🎯 建议

### 方案 1: 完全迁移到 Vite（推荐）
**优点**:
- 彻底解决 SSR 问题
- 更好的开发体验
- 更快的构建速度

**缺点**:
- 工作量大（7-12 天）
- 需要全面测试

### 方案 2: 继续使用 Next.js + insertCSS（当前方案）
**优点**:
- 工作量小（已完成）
- 不需要重构代码
- 风险低

**缺点**:
- 可能仍有 SSR 问题
- 需要持续调试

### 方案 3: 混合方案
- 保留 Next.js 作为构建工具
- 完全禁用 SSR（使用 `output: 'export'`）
- 使用静态导出模式

**优点**:
- 工作量中等（1-2 天）
- 保留 Next.js 生态
- 避免 SSR

**缺点**:
- 失去 Next.js 的一些优势
- 仍然需要处理路由

## 💡 最终建议

**如果 SSR 问题无法通过 `insertCSS` 解决，建议采用方案 1（完全迁移到 Vite）**，因为：

1. **长期收益**: Vite 更适合 Electron 应用（无 SSR 需求）
2. **性能提升**: 开发体验和构建速度都会提升
3. **问题解决**: 彻底解决 SSR 导致的窗口显示问题
4. **工作量可接受**: 7-12 天的工作量对于长期项目来说是可以接受的

**如果 `insertCSS` 方案能解决问题，建议继续使用方案 2**，因为：
1. 工作量最小
2. 风险最低
3. 不需要重构代码














