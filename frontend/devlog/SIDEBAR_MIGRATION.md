# 侧边栏菜单 Shadcn 标准改造

## 概述

将左侧的 3 个菜单按钮（事件管理、行为分析、工作计划）从自定义样式迁移到 shadcn/ui 标准组件。

## 改造内容

### 1. 新增依赖

```bash
pnpm add tailwind-merge @radix-ui/react-navigation-menu
```

- `tailwind-merge`: 用于合并 Tailwind CSS 类名，避免冲突
- `@radix-ui/react-navigation-menu`: Radix UI 导航菜单组件（可选）

### 2. 更新工具函数

**文件**: `lib/utils.ts`

```typescript
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

使用 `twMerge` 替代简单的 `clsx`，确保样式类正确合并。

### 3. 创建 Shadcn 标准组件

**文件**: `components/ui/sidebar-nav.tsx`

创建了以下组件：

#### SidebarNav 主导航组件
- ✅ 完整的键盘导航支持（Enter/Space）
- ✅ ARIA 无障碍标签
- ✅ 流畅的过渡动画（200ms）
- ✅ 点击反馈（缩放效果）
- ✅ 激活状态左侧指示条
- ✅ 图标颜色动态变化
- ✅ 支持 badge 徽章（可选）
- ✅ 支持禁用状态

#### Sidebar 容器组件
- 使用 CSS 变量主题系统
- 自动适配深色/浅色主题
- 平滑过渡动画

#### SidebarHeader / SidebarContent / SidebarFooter
- 语义化布局组件
- 内置滚动处理
- 主题边框样式

### 4. 更新布局文件

**文件**: `components/layout/AppLayout.tsx`

#### 改造前

```tsx
<aside className="w-48 border-r bg-card flex-shrink-0 h-full overflow-y-auto">
  <nav className="p-4 space-y-2">
    {menuItems.map((item) => {
      const Icon = item.icon;
      const isActive = activeMenu === item.id;
      return (
        <button
          key={item.id}
          onClick={() => setActiveMenu(item.id)}
          className={cn(
            'w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors',
            isActive
              ? 'bg-primary text-primary-foreground'
              : 'text-foreground hover:bg-muted'
          )}
        >
          <Icon className="h-5 w-5" />
          <span className="font-medium">{item.label}</span>
        </button>
      );
    })}
  </nav>
</aside>
```

#### 改造后

```tsx
<Sidebar className="w-56 flex-shrink-0 h-full">
  <SidebarContent>
    <SidebarNav
      items={menuItems}
      activeItem={activeMenu}
      onItemClick={(id) => setActiveMenu(id as MenuType)}
    />
  </SidebarContent>
</Sidebar>
```

## 改进点对比

### 视觉效果

| 特性 | 改造前 | 改造后 |
|-----|--------|--------|
| 激活指示 | 整个按钮背景变色 | 左侧指示条 + 背景色 |
| 图标颜色 | 单一颜色 | 动态颜色（主题色/灰色） |
| 过渡动画 | 简单的颜色过渡 | 多重动画（颜色、缩放、指示条） |
| 宽度 | 48 (12rem) | 56 (14rem) |

### 交互体验

| 特性 | 改造前 | 改造后 |
|-----|--------|--------|
| 键盘导航 | ❌ 无 | ✅ Enter/Space 支持 |
| 聚焦样式 | ❌ 无 | ✅ Ring 聚焦环 |
| 点击反馈 | ❌ 无 | ✅ 缩放效果 |
| 无障碍 | ❌ 基础 | ✅ 完整 ARIA |

### 代码质量

| 特性 | 改造前 | 改造后 |
|-----|--------|--------|
| 组件化 | ❌ 内联代码 | ✅ 独立组件 |
| 可复用性 | ❌ 低 | ✅ 高 |
| TypeScript | ✅ 基础 | ✅ 完整类型 |
| 主题集成 | ✅ 部分 | ✅ 完整 CSS 变量 |

### 可扩展性

| 特性 | 改造前 | 改造后 |
|-----|--------|--------|
| Badge 支持 | ❌ 无 | ✅ 内置 |
| 禁用状态 | ❌ 无 | ✅ 支持 |
| 自定义样式 | ⚠️ 需修改代码 | ✅ className 注入 |
| 嵌套菜单 | ❌ 无 | ✅ 可扩展 |

## 样式系统

### 使用的 CSS 变量

```css
--sidebar: oklch(0.985 0 0);
--sidebar-foreground: oklch(0.141 0.005 285.823);
--sidebar-primary: oklch(0.546 0.245 262.881);
--sidebar-primary-foreground: oklch(0.97 0.014 254.604);
--sidebar-accent: oklch(0.967 0.001 286.375);
--sidebar-accent-foreground: oklch(0.21 0.006 285.885);
--sidebar-border: oklch(0.92 0.004 286.32);
--sidebar-ring: oklch(0.708 0 0);
```

这些变量已在 `app/globals.css` 中定义，支持深色和浅色主题自动切换。

## 动画效果

### 按钮状态转换

```css
transition-all duration-200
```

- 颜色变化: 200ms
- 缩放效果: scale-[0.98]
- 指示条: 200ms

### 指示条动画

```css
before:absolute before:left-0 before:top-1/2
before:h-8 before:w-1 before:-translate-y-1/2
before:rounded-r-full before:bg-primary
before:transition-all before:duration-200
```

## 使用示例

### 基础用法

```tsx
import { Sidebar, SidebarContent, SidebarNav } from '@/components/ui/sidebar-nav';
import { Calendar, BarChart2, FileText } from 'lucide-react';

const menuItems = [
  { id: 'events', label: '事件管理', icon: Calendar },
  { id: 'analytics', label: '行为分析', icon: BarChart2 },
  { id: 'plan', label: '工作计划', icon: FileText },
];

function App() {
  const [activeMenu, setActiveMenu] = useState('events');

  return (
    <Sidebar className="w-56">
      <SidebarContent>
        <SidebarNav
          items={menuItems}
          activeItem={activeMenu}
          onItemClick={setActiveMenu}
        />
      </SidebarContent>
    </Sidebar>
  );
}
```

### 带 Badge

```tsx
const menuItems = [
  { id: 'events', label: '事件管理', icon: Calendar, badge: 5 },
  { id: 'analytics', label: '行为分析', icon: BarChart2, badge: 'NEW' },
  { id: 'plan', label: '工作计划', icon: FileText },
];
```

### 带禁用状态

```tsx
const menuItems = [
  { id: 'events', label: '事件管理', icon: Calendar },
  { id: 'analytics', label: '行为分析', icon: BarChart2, disabled: true },
  { id: 'plan', label: '工作计划', icon: FileText },
];
```

### 完整布局

```tsx
<Sidebar className="w-64">
  <SidebarHeader>
    <div className="flex items-center gap-2">
      <Logo />
      <h2 className="font-semibold">我的应用</h2>
    </div>
  </SidebarHeader>

  <SidebarContent>
    <SidebarNav
      items={menuItems}
      activeItem={activeMenu}
      onItemClick={setActiveMenu}
    />
  </SidebarContent>

  <SidebarFooter>
    <div className="text-xs text-muted-foreground">
      版本 1.0.0
    </div>
  </SidebarFooter>
</Sidebar>
```

## TypeScript 类型

```typescript
export interface SidebarNavItem {
  id: string;              // 唯一标识符
  label: string;           // 显示文本
  icon: LucideIcon;        // 图标组件
  disabled?: boolean;      // 是否禁用
  badge?: string | number; // 徽章文本/数字
}

interface SidebarNavProps {
  items: SidebarNavItem[];
  activeItem: string;
  onItemClick: (itemId: string) => void;
  className?: string;
}
```

## 无障碍性

- ✅ `role="navigation"` 导航地标
- ✅ `aria-label="主导航"` 导航标签
- ✅ `aria-current="page"` 当前页面
- ✅ `aria-label` 每个菜单项
- ✅ 键盘导航支持
- ✅ 聚焦指示器
- ✅ 屏幕阅读器友好

## 浏览器兼容性

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## 性能优化

- ✅ CSS 过渡动画（GPU 加速）
- ✅ React.memo 优化（可选）
- ✅ 事件处理器优化
- ✅ 最小重渲染

## 迁移检查清单

- [x] 安装依赖包
- [x] 更新 `utils.ts`
- [x] 创建 `sidebar-nav.tsx` 组件
- [x] 更新 `AppLayout.tsx`
- [x] 验证样式正常
- [x] 测试键盘导航
- [x] 测试深色/浅色主题
- [x] 编写文档

## 后续优化建议

1. **可折叠侧边栏**
   - 添加展开/收起功能
   - 图标模式显示

2. **二级菜单**
   - 支持嵌套菜单
   - 手风琴展开效果

3. **拖拽排序**
   - 允许用户自定义菜单顺序
   - 持久化配置

4. **快捷键**
   - 添加快捷键提示
   - 支持 Cmd/Ctrl + 数字快速切换

## 参考资料

- [shadcn/ui Documentation](https://ui.shadcn.com/)
- [Radix UI Primitives](https://www.radix-ui.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [WAI-ARIA Practices](https://www.w3.org/WAI/ARIA/apg/)
