# Shadcn 侧边栏组件快速开始

## 🚀 5 分钟快速上手

### 1. 已完成的改造

左侧 3 个菜单（事件管理、行为分析、工作计划）已经按照 shadcn 标准完成改造！

### 2. 改造后的效果

✨ **视觉升级**
- 激活状态左侧蓝色指示条
- 图标颜色动态变化
- 流畅的过渡动画
- 更现代的视觉设计

⌨️ **交互增强**
- 支持键盘导航（Enter/Space）
- 聚焦时显示高亮环
- 点击时有缩放反馈
- 完整的无障碍支持

### 3. 核心文件

```
frontend/
├── components/
│   ├── ui/
│   │   ├── sidebar-nav.tsx          # 新的 shadcn 组件
│   │   ├── sidebar-nav.example.tsx  # 使用示例
│   │   ├── navigation-menu.tsx      # Radix UI 导航菜单
│   │   └── README.md                # 组件文档
│   └── layout/
│       └── AppLayout.tsx            # 已更新使用新组件
├── lib/
│   └── utils.ts                     # 已更新 cn 函数
└── SIDEBAR_MIGRATION.md             # 详细迁移文档
```

### 4. 基础使用

```tsx
import { Sidebar, SidebarContent, SidebarNav } from '@/components/ui/sidebar-nav';
import { Calendar, BarChart2, FileText } from 'lucide-react';

// 定义菜单项
const menuItems = [
  { id: 'events', label: '事件管理', icon: Calendar },
  { id: 'analytics', label: '行为分析', icon: BarChart2 },
  { id: 'plan', label: '工作计划', icon: FileText },
];

// 使用组件
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

### 5. 添加 Badge（徽章）

```tsx
const menuItems = [
  { id: 'events', label: '事件管理', icon: Calendar, badge: 5 },
  { id: 'analytics', label: '行为分析', icon: BarChart2, badge: 'NEW' },
  { id: 'plan', label: '工作计划', icon: FileText },
];
```

### 6. 主题支持

组件自动适配深色/浅色主题，无需额外配置！

**浅色主题**
```css
--sidebar: 白色背景
--sidebar-accent: 浅灰色高亮
--sidebar-primary: 蓝色主题色
```

**深色主题**
```css
--sidebar: 深色背景
--sidebar-accent: 深灰色高亮  
--sidebar-primary: 蓝色主题色
```

### 7. 键盘快捷键

| 按键 | 功能 |
|------|------|
| Tab | 在菜单项之间切换焦点 |
| Enter | 激活当前菜单项 |
| Space | 激活当前菜单项 |
| Shift + Tab | 反向切换焦点 |

### 8. 组件 API

#### SidebarNav Props

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| items | SidebarNavItem[] | ✅ | 菜单项数组 |
| activeItem | string | ✅ | 当前激活的菜单 ID |
| onItemClick | (id: string) => void | ✅ | 点击回调 |
| className | string | ❌ | 自定义样式类 |

#### SidebarNavItem 接口

```typescript
interface SidebarNavItem {
  id: string;              // 唯一标识符
  label: string;           // 显示文本
  icon: LucideIcon;        // 图标组件
  disabled?: boolean;      // 是否禁用
  badge?: string | number; // 徽章（可选）
}
```

### 9. 样式自定义

所有组件都支持 `className` 注入：

```tsx
<Sidebar className="w-64 bg-gradient-to-b from-blue-50 to-white">
  <SidebarContent className="py-6">
    <SidebarNav
      items={menuItems}
      activeItem={activeMenu}
      onItemClick={setActiveMenu}
      className="space-y-2"
    />
  </SidebarContent>
</Sidebar>
```

### 10. 完整示例

查看 `components/ui/sidebar-nav.example.tsx` 获取更多示例：

- ✅ 基础用法
- ✅ 带 Badge
- ✅ 完整布局（头部+内容+底部）
- ✅ 禁用状态
- ✅ 响应式设计
- ✅ 实际应用案例

### 11. 常见问题

**Q: 如何更改侧边栏宽度？**
```tsx
<Sidebar className="w-64"> {/* 默认 w-56 */}
```

**Q: 如何添加分组？**
```tsx
<SidebarContent>
  <div className="space-y-4">
    <div>
      <p className="mb-2 px-3 text-xs text-muted-foreground">主要功能</p>
      <SidebarNav items={mainItems} ... />
    </div>
    <div>
      <p className="mb-2 px-3 text-xs text-muted-foreground">设置</p>
      <SidebarNav items={settingsItems} ... />
    </div>
  </div>
</SidebarContent>
```

**Q: 如何禁用某个菜单项？**
```tsx
{ id: 'analytics', label: '行为分析', icon: BarChart2, disabled: true }
```

**Q: 如何监听菜单切换？**
```tsx
const handleMenuClick = (id: string) => {
  console.log('切换到:', id);
  setActiveMenu(id);
  // 可以在这里添加路由跳转、数据加载等逻辑
};
```

### 12. 性能优化

组件已经内置了以下优化：

- ✅ CSS 过渡动画（GPU 加速）
- ✅ 最小化重渲染
- ✅ 事件处理器优化
- ✅ 合理的默认值

如需进一步优化，可以使用 `React.memo`：

```tsx
const MemoizedSidebarNav = React.memo(SidebarNav);
```

### 13. TypeScript 支持

所有组件都提供完整的类型定义，享受智能提示！

```typescript
import type { SidebarNavItem, SidebarNavProps } from '@/components/ui/sidebar-nav';
```

### 14. 浏览器支持

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

### 15. 相关文档

- 📖 [完整迁移文档](./SIDEBAR_MIGRATION.md) - 详细的改造说明
- 📖 [组件文档](./components/ui/README.md) - 组件 API 文档
- 🎨 [shadcn/ui](https://ui.shadcn.com/) - 官方文档
- 🎯 [示例代码](./components/ui/sidebar-nav.example.tsx) - 6 个实用示例

## 🎉 开始使用

现在你已经了解了所有基础知识，可以开始使用新的 shadcn 风格侧边栏组件了！

**提示**: 直接查看 `AppLayout.tsx` 中的实际使用案例，这是最好的学习方式！

---

有任何问题？查看详细文档或示例代码！
