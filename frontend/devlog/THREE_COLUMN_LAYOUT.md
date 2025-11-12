# 三栏布局重构

## 更新日期
2025-11-12

## 功能描述
将整体页面布局从"顶部 Header + 左右布局"改为"左中右三栏布局"，提供更现代的应用体验。Logo 和导航菜单统一放在左侧栏，主题切换和设置按钮放在右侧栏。

## 布局结构

### 新布局（左中右三栏）
```
┌──────────┬─────────────────────────┬────┐
│          │  [⬅] 折叠按钮            │    │
│  Logo    ├─────────────────────────┤ 主  │
│  标题    │                         │ 题  │
│          │                         │    │
│ ────── │                         │ 设  │
│          │    页面内容区域          │ 置  │
│  菜单    │                         │    │
│  导航    │                         │    │
│          │                         │    │
└──────────┴─────────────────────────┴────┘
  左侧栏           中间内容区           右侧栏
  (256px)          (flex-1)         (64px)
```

### 旧布局（顶部 + 左右）
```
┌───────────────────────────────────────────┐
│  Logo  LifeTrace               设置  主题  │  Header
├──────────┬────────────────────────────────┤
│          │                                │
│  菜单    │        页面内容区域             │
│  导航    │                                │
│          │                                │
└──────────┴────────────────────────────────┘
  左侧栏              内容区
```

## 实现细节

### 1. 左侧栏（侧边栏）- 256px

#### Logo 区域（SidebarHeader）
```tsx
<SidebarHeader>
  <div className="flex items-center gap-3">
    <div className="relative h-8 w-8 flex-shrink-0">
      <Image src="/logo.png" alt="LifeTrace Logo" fill />
    </div>
    <div>
      <h1 className="text-lg font-bold">LifeTrace</h1>
      <p className="text-xs text-muted-foreground">生活追踪系统</p>
    </div>
  </div>
</SidebarHeader>
```

**特点：**
- Logo + 标题 + 副标题垂直布局
- 使用 SidebarHeader 组件，自带分隔线
- Logo 尺寸：32x32px
- 标题字体：lg bold
- 副标题：xs 灰色

#### 导航菜单（SidebarContent）
- 事件管理
- 项目管理
- 定时任务（可选）

**折叠行为：**
- 折叠时宽度变为 0
- 边框消失
- 300ms 过渡动画

### 2. 中间内容区（flex-1）

#### 顶部工具栏（56px）
```tsx
<div className="flex items-center h-14 px-4 border-b bg-background">
  <button onClick={toggleSidebar}>
    {/* 折叠/展开按钮 */}
  </button>
</div>
```

**特点：**
- 固定高度 56px (h-14)
- 底部边框分隔
- 左对齐的折叠按钮
- 简洁的设计，未来可扩展添加面包屑等

#### 内容区域（flex-1）
```tsx
<div className="flex-1 overflow-y-auto">
  {renderContent()}
</div>
```

**特点：**
- 自动占满剩余高度
- 可滚动
- 背景色为 bg-background

### 3. 右侧栏 - 64px

```tsx
<div className="w-16 flex-shrink-0 h-full border-l bg-background
     flex flex-col items-center py-4 gap-2">
  {/* 主题切换 */}
  <ThemeToggle />

  {/* 设置按钮 */}
  <button onClick={onSettingsClick}>
    <Settings className="h-5 w-5" />
  </button>
</div>
```

**特点：**
- 固定宽度 64px
- 垂直居中排列
- 图标大小统一 20x20px
- 左边框分隔
- 可扩展添加更多功能按钮

## 组件变更

### MainLayout.tsx
**修改前：**
```tsx
<div className="flex h-screen flex-col">
  <Header onSettingsClick={handleSettingsClick} />
  <main className="flex-1">
    <AppLayout>{children}</AppLayout>
  </main>
</div>
```

**修改后：**
```tsx
<div className="flex h-screen">
  <AppLayout onSettingsClick={handleSettingsClick}>
    {children}
  </AppLayout>
</div>
```

**变更说明：**
- 移除了 Header 组件
- 从 flex-col（垂直）改为 flex（水平）
- 将 onSettingsClick 传递给 AppLayout

### AppLayout.tsx
**主要变更：**
1. 添加 `onSettingsClick` prop
2. 导入 `Image`、`Settings`、`SidebarHeader`、`ThemeToggle`
3. 实现三栏布局结构
4. 将 Logo 移到侧边栏顶部
5. 添加右侧栏

### ThemeToggle.tsx
**样式更新：**
```tsx
// 修改前（为 Header 设计）
className="... border-white/20 bg-white/10 text-white ..."

// 修改后（符合 shadcn 风格）
className="rounded-md p-2 text-muted-foreground
  hover:bg-accent hover:text-accent-foreground
  focus-visible:ring-2 focus-visible:ring-ring"
```

**变更说明：**
- 移除白色主题样式
- 使用标准的 shadcn 颜色变量
- 添加无障碍支持（aria-label）
- 统一按钮样式

## 布局优势

### 1. 空间利用更高效
- **左侧栏**：固定宽度，专注导航
- **中间**：弹性宽度，内容优先
- **右侧栏**：固定宽度，快捷操作

### 2. 视觉层次更清晰
- Logo 和导航在同一区域，逻辑统一
- 主题和设置在右侧，符合操作习惯
- 内容区域更加突出

### 3. 可扩展性强
- 右侧栏可添加更多快捷按钮
- 中间顶部栏可添加面包屑、搜索等
- 左侧栏可添加用户信息、快捷链接等

### 4. 响应式友好
- 侧边栏可折叠，小屏幕更友好
- 三栏布局在宽屏上体验更好
- 可根据屏幕宽度自动调整

## 样式规范

### 宽度定义
```tsx
左侧栏（展开）：w-64 (256px)
左侧栏（折叠）：w-0
中间内容区：  flex-1
右侧栏：      w-16 (64px)
```

### 高度定义
```tsx
整体高度：     h-screen (100vh)
Logo 区域：    h-auto（内容撑开）
导航内容：     flex-1
顶部工具栏：   h-14 (56px)
内容区域：     flex-1
```

### 间距规范
```tsx
SidebarHeader：px-4 py-4
SidebarContent：px-3 py-4
右侧栏：       py-4 gap-2
内容区顶栏：   px-4
```

### 颜色系统
```tsx
背景色：       bg-background
边框色：       border-border
文字色：       text-foreground
次要文字：     text-muted-foreground
悬停背景：     hover:bg-accent
悬停文字：     hover:text-accent-foreground
```

## 交互细节

### 1. 侧边栏折叠
- 点击折叠按钮
- 300ms 动画过渡
- 宽度从 256px → 0
- 边框同步消失
- 状态保存到 localStorage

### 2. 主题切换
- 点击图标循环切换
- 浅色 → 深色 → 跟随系统
- 即时生效
- 图标动态更新

### 3. 设置对话框
- 点击设置按钮
- 打开模态对话框
- 背景遮罩
- ESC 关闭

## 无障碍支持

### 键盘导航
- Tab：在按钮间切换
- Enter/Space：激活按钮
- ESC：关闭对话框

### 屏幕阅读器
- 所有按钮都有 aria-label
- 图标按钮有 title 提示
- 语义化的 HTML 结构

### 焦点管理
- focus-visible:ring-2：清晰的焦点指示器
- 符合 WCAG 2.1 标准

## 测试场景

- [x] 页面正常加载，三栏布局正确显示
- [x] Logo 在左侧栏顶部显示
- [x] 导航菜单功能正常
- [x] 侧边栏折叠/展开流畅
- [x] 主题切换正常工作
- [x] 设置按钮可以打开对话框
- [x] 深色/浅色模式样式正常
- [x] 内容区域滚动正常
- [x] 响应式布局（侧边栏折叠后）

## 后续优化建议

### 1. 右侧栏扩展
可以添加：
- 通知中心（Bell 图标）
- 快捷搜索（Search 图标）
- 用户头像（Avatar）
- 帮助文档（HelpCircle 图标）

### 2. 中间顶部栏增强
可以添加：
- 面包屑导航
- 全局搜索框
- 页面标题
- 快捷操作按钮

### 3. 左侧栏增强
可以添加：
- 用户信息卡片（底部）
- 收藏/快捷访问
- 菜单分组标题
- 徽章提示（未读消息等）

### 4. 响应式优化
```tsx
// 小屏幕自动折叠
useEffect(() => {
  const handleResize = () => {
    if (window.innerWidth < 1024) {
      setIsSidebarCollapsed(true);
    }
  };
  // ...
}, []);
```

### 5. 动画增强
- 使用 Framer Motion 优化动画
- 添加页面切换过渡
- 菜单项交错动画

## 相关文件

### 修改的文件
- `frontend/components/layout/MainLayout.tsx` - 布局容器
- `frontend/components/layout/AppLayout.tsx` - 主布局组件
- `frontend/components/common/ThemeToggle.tsx` - 主题切换组件

### 未修改（仍可使用）
- `frontend/components/layout/Header.tsx` - 备用（如需恢复）
- `frontend/components/ui/sidebar-nav.tsx` - 侧边栏组件
- `frontend/components/common/SettingsModal.tsx` - 设置对话框

### 文档
- `frontend/devlog/SIDEBAR_STYLE_UPDATE.md` - 侧边栏样式优化
- `frontend/devlog/SIDEBAR_COLLAPSE_FEATURE.md` - 折叠功能
- `frontend/devlog/THREE_COLUMN_LAYOUT.md` - 本文档

## 兼容性

- ✅ 支持所有现代浏览器
- ✅ 深色/浅色主题完美适配
- ✅ 键盘导航完全可用
- ✅ 屏幕阅读器友好
- ✅ 响应式布局（配合折叠功能）

## 参考资源

- [Shadcn/UI Layout Patterns](https://ui.shadcn.com/)
- [Three Column Layout Best Practices](https://web.dev/patterns/layout/three-column/)
- [Lucide Icons](https://lucide.dev/)
- [Next.js Image Optimization](https://nextjs.org/docs/app/building-your-application/optimizing/images)
