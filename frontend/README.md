# LifeTrace Frontend

LifeTrace 的前端界面，基于 Next.js 构建。

## 技术栈

- **框架**: Next.js 15 (App Router)
- **语言**: TypeScript
- **样式**: Tailwind CSS
- **HTTP 客户端**: Axios
- **Markdown**: marked
- **图标**: lucide-react

## 项目结构

```
frontend/
├── app/                      # Next.js App Router
│   ├── page.tsx             # 主页（截图浏览）
│   ├── layout.tsx           # 全局布局
│   ├── chat/                # 聊天页面
│   │   └── page.tsx
│   ├── events/              # 事件时间轴
│   │   └── page.tsx
│   ├── analytics/           # 行为分析
│   │   └── page.tsx
│   ├── app-usage/           # 应用使用统计
│   │   └── page.tsx
│   └── settings/            # 设置页面
│       └── page.tsx
├── components/              # React 组件
│   ├── common/             # 通用组件
│   │   ├── Button.tsx
│   │   ├── Card.tsx
│   │   ├── Input.tsx
│   │   ├── Loading.tsx
│   │   └── Pagination.tsx
│   ├── search/             # 搜索组件
│   │   └── SearchBar.tsx
│   └── screenshot/         # 截图组件
│       ├── ScreenshotCard.tsx
│       └── ScreenshotModal.tsx
├── lib/                    # 工具库
│   ├── api.ts             # API 接口封装
│   ├── types.ts           # TypeScript 类型定义
│   └── utils.ts           # 工具函数
├── public/                # 静态资源
├── package.json           # 项目配置
└── tsconfig.json         # TypeScript 配置
```

## 开发

### 环境要求

- **Node.js**: 20.19.0 或更高版本
- **包管理器**: pnpm

### 安装 pnpm

如果还没有安装 pnpm，可以使用以下方法：

**使用 npm 安装**:

```bash
npm install -g pnpm
```

更多安装方式请参考 [pnpm 官方文档](https://pnpm.io/installation)。

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

应用将在 `http://localhost:3000` 启动。

### 构建生产版本

```bash
pnpm build
```

### 启动生产服务器

```bash
pnpm start
```

## 环境变量

创建 `.env.local` 文件：

```env
# 后端 API 地址
NEXT_PUBLIC_API_URL=http://localhost:8000
```

对于生产环境，创建 `.env.production`:

```env
NEXT_PUBLIC_API_URL=https://your-production-api.com
```

## API 集成

所有 API 调用都在 `lib/api.ts` 中统一管理：

```typescript
import { api } from '@/lib/api';

// 获取截图列表
const screenshots = await api.getScreenshots({
  limit: 50,
  offset: 0
});

// 搜索
const results = await api.search({
  query: "关键词",
  searchType: 'semantic'
});

// 发送聊天消息
const response = await api.sendChatMessage({
  message: "你好",
  use_rag: true
});
```

## 主要功能

### 1. 截图浏览 (`/`)

- 展示所有截图的网格视图
- 支持分页浏览
- 点击查看详情
- 显示 OCR 文本

### 2. 搜索功能

支持多种搜索模式：

- **传统搜索**: 基于文本匹配
- **语义搜索**: 基于向量相似度
- **多模态搜索**: 结合文本和图像
- **事件搜索**: 在事件级别搜索

### 3. 事件时间轴 (`/events`)

- 按时间顺序展示事件
- 显示事件持续时间
- 展示关联的截图
- 支持图片轮播
- 显示 OCR 文本

### 4. 聊天对话 (`/chat`)

- 与 AI 助手对话
- 基于截图上下文的问答
- 支持会话历史
- Markdown 格式化响应
- 流式输出

### 5. 数据分析

**行为分析** (`/analytics`):

- 用户行为统计
- 时间分布图表
- 操作类型分布

**应用使用** (`/app-usage`):

- 应用使用时长统计
- 每日使用趋势
- 小时分布热力图
- Top 应用排行

## 组件说明

### 通用组件

#### Button

```tsx
<Button variant="primary" size="md" onClick={handleClick}>
  点击我
</Button>
```

#### Card

```tsx
<Card>
  <CardHeader>
    <CardTitle>标题</CardTitle>
  </CardHeader>
  <CardContent>
    内容
  </CardContent>
</Card>
```

#### Loading

```tsx
<Loading text="加载中..." size="md" />
```

#### Pagination

```tsx
<Pagination
  currentPage={page}
  totalPages={total}
  onPageChange={setPage}
/>
```

### 业务组件

#### ScreenshotCard

展示截图卡片，包含缩略图、应用信息、时间等。

#### ScreenshotModal

截图详情弹窗，显示完整图片和 OCR 文本。

#### SearchBar

搜索栏组件，支持多种搜索模式切换。

## 类型定义

所有数据类型在 `lib/types.ts` 中定义：

```typescript
interface Screenshot {
  id: number;
  file_path: string;
  app_name: string;
  window_title: string;
  created_at: string;
  text_content?: string;
  width: number;
  height: number;
}

interface Event {
  id: number;
  app_name: string;
  window_title: string;
  start_time: string;
  end_time?: string;
  screenshot_count: number;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}
```

## 样式定制

使用 Tailwind CSS 进行样式定制。主题配置在 `tailwind.config.ts`:

```typescript
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: '#8B5CF6',  // 紫色
        // 其他颜色...
      }
    }
  }
}
```

## 代码规范

### 命名约定

- 组件文件: PascalCase (如 `ScreenshotCard.tsx`)
- 工具函数: camelCase (如 `formatDateTime`)
- 常量: UPPER_SNAKE_CASE (如 `API_BASE_URL`)

### 导入顺序

1. React 相关
2. 第三方库
3. 本地组件
4. 类型定义
5. 工具函数
6. 样式

### TypeScript

- 优先使用 `interface` 而非 `type`
- 明确定义所有 props 类型
- 避免使用 `any`

## 性能优化

### 图片优化

- 使用 Next.js Image 组件（计划中）
- 懒加载
- 缩略图优先

### 代码分割

- 路由级别自动分割
- 动态导入大型组件

### 缓存策略

- API 响应缓存
- 图片浏览器缓存

## 故障排查

### 连接后端失败

1. 确认后端服务正在运行
2. 检查 `NEXT_PUBLIC_API_URL` 配置
3. 查看浏览器控制台错误

### 构建失败

1. 清理缓存: `rm -rf .next`
2. 重新安装依赖: `pnpm install`
3. 检查 TypeScript 错误: `pnpm tsc`

### 页面渲染问题

1. 检查组件 props 类型
2. 查看浏览器控制台
3. 确认 API 返回数据格式

## 开发建议

### 添加新页面

1. 在 `app/` 下创建目录和 `page.tsx`
2. 在 `components/` 中创建相关组件
3. 更新导航菜单（如有需要）

### 添加新 API

1. 在 `lib/api.ts` 中添加接口函数
2. 在 `lib/types.ts` 中定义类型
3. 在组件中使用

### 样式调整

1. 优先使用 Tailwind 工具类
2. 复杂样式使用 CSS 模块
3. 保持样式一致性

## 相关文档

- [Next.js 文档](https://nextjs.org/docs)
- [Tailwind CSS 文档](https://tailwindcss.com/docs)
- [LifeTrace 架构说明](../ARCHITECTURE.md)
- [API 文档](../README_API.md)
