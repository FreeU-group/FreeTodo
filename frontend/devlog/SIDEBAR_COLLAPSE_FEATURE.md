# 侧边栏折叠功能实现

## 更新日期
2025-11-12

## 功能描述
在内容区域的左上角添加了一个折叠/展开按钮，用户可以点击该按钮来隐藏或显示左侧导航菜单，以获得更大的内容显示空间。

## 功能特性

### 1. 折叠按钮位置
- **位置**：内容区域左上角
- **样式**：固定在顶部（sticky），不会随内容滚动
- **高度**：48px (h-12)，与 Header 高度保持一致
- **背景**：半透明毛玻璃效果 `bg-background/95 backdrop-blur`

### 2. 图标切换
使用 Lucide React 图标库：
- **展开状态**：显示 `PanelLeftClose` 图标（折叠菜单）
- **折叠状态**：显示 `PanelLeft` 图标（展开菜单）
- **图标大小**：5x5 (20px)

### 3. 动画效果
- **侧边栏宽度过渡**：300ms 缓动动画
- **展开状态**：宽度 256px (w-64)
- **折叠状态**：宽度 0，隐藏边框和溢出内容

```tsx
className={`flex-shrink-0 h-full transition-all duration-300 ${
  isSidebarCollapsed ? 'w-0 border-r-0 overflow-hidden' : 'w-64'
}`}
```

### 4. 状态持久化
- 使用 `localStorage` 保存用户的折叠偏好
- 键名：`sidebarCollapsed`
- 页面刷新后自动恢复上次的折叠状态
- 跨会话保持用户偏好设置

### 5. 无障碍支持
- **aria-label**：提供屏幕阅读器支持
- **title**：鼠标悬停时显示工具提示
- **focus-visible**：键盘导航时显示焦点环
- 语义化的按钮状态描述

## 实现细节

### 状态管理

```tsx
// 折叠状态
const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

// 从 localStorage 读取
useEffect(() => {
  const saved = localStorage.getItem('sidebarCollapsed');
  if (saved !== null) {
    setIsSidebarCollapsed(saved === 'true');
  }
}, []);

// 切换并保存
const toggleSidebar = () => {
  const newState = !isSidebarCollapsed;
  setIsSidebarCollapsed(newState);
  localStorage.setItem('sidebarCollapsed', String(newState));
};
```

### 布局结构

```tsx
<div className="flex flex-1 overflow-hidden h-full">
  {/* 侧边栏 - 可折叠 */}
  <Sidebar className={`... ${isSidebarCollapsed ? 'w-0' : 'w-64'}`}>
    ...
  </Sidebar>

  {/* 内容区 */}
  <div className="flex-1 ...">
    {/* 折叠按钮栏 */}
    <div className="sticky top-0 z-10 ...">
      <button onClick={toggleSidebar}>...</button>
    </div>

    {/* 页面内容 */}
    <div className="h-[calc(100%-3rem)]">
      {renderContent()}
    </div>
  </div>
</div>
```

### 样式细节

#### 折叠按钮样式
```tsx
className="
  rounded-md p-2
  text-muted-foreground
  transition-colors
  hover:bg-accent hover:text-accent-foreground
  focus-visible:outline-none
  focus-visible:ring-2
  focus-visible:ring-ring
"
```

#### 按钮栏样式
```tsx
className="
  sticky top-0 z-10
  flex items-center
  h-12 px-4
  border-b
  bg-background/95
  backdrop-blur
  supports-[backdrop-filter]:bg-background/60
"
```

## 用户体验优化

### 1. 视觉反馈
- **Hover 效果**：鼠标悬停时背景色变化
- **点击反馈**：按钮状态即时更新
- **流畅动画**：300ms 过渡，不会突兀

### 2. 空间利用
- **折叠后**：内容区域获得额外 256px 宽度
- **适用场景**：
  - 查看大量数据表格
  - 阅读长文本内容
  - 专注于单一任务

### 3. 记忆功能
- 自动记住用户的偏好设置
- 无需重复操作
- 提升使用效率

### 4. 响应式考虑
- 在小屏幕设备上更有价值
- 可以根据屏幕宽度自动调整
- 未来可扩展为响应式自动折叠

## 技术栈
- **React Hooks**：useState, useEffect
- **Next.js**：useRouter, usePathname
- **Lucide React**：图标库
- **Tailwind CSS**：样式系统
- **LocalStorage API**：状态持久化

## 兼容性
- ✅ 支持所有现代浏览器
- ✅ 支持键盘导航
- ✅ 支持屏幕阅读器
- ✅ 深色/浅色主题自适应

## 相关文件
- `frontend/components/layout/AppLayout.tsx` - 主要实现文件
- `frontend/components/ui/sidebar-nav.tsx` - 侧边栏组件

## 后续优化建议

### 1. 响应式自动折叠
```tsx
useEffect(() => {
  const handleResize = () => {
    if (window.innerWidth < 768 && !isSidebarCollapsed) {
      setIsSidebarCollapsed(true);
    }
  };
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, [isSidebarCollapsed]);
```

### 2. 手势支持
- 移动端滑动手势打开/关闭侧边栏
- 使用 `react-swipeable` 或类似库

### 3. 快捷键支持
```tsx
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'b') {
      e.preventDefault();
      toggleSidebar();
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, []);
```

### 4. 迷你侧边栏模式
- 折叠时不完全隐藏，显示仅图标的迷你版本
- 提供更好的导航体验

### 5. 动画增强
- 添加微交互动画
- 使用 Framer Motion 提升动画质量

## 测试场景
- [x] 点击按钮正确切换折叠状态
- [x] 刷新页面后状态保持
- [x] 动画流畅无闪烁
- [x] 图标正确切换
- [x] 键盘导航可用
- [x] 深色模式下样式正常
- [x] 内容区域高度计算正确

## 用户反馈点
如果用户反馈需要改进，可考虑：
1. 调整动画速度（当前 300ms）
2. 修改按钮位置或样式
3. 添加更多视觉提示
4. 支持双击或其他交互方式

## 参考资源
- [Shadcn/UI Sidebar Pattern](https://ui.shadcn.com/)
- [Lucide Icons - PanelLeft/PanelLeftClose](https://lucide.dev/)
- [Tailwind CSS Transitions](https://tailwindcss.com/docs/transition-property)
