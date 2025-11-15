# 任务管理功能使用指南

## 功能概述

任务管理模块已完成开发，提供以下功能：

### 1. 项目详情页面
- 📋 显示项目信息（名称、目标）
- ✅ 展示项目下的所有任务
- ➕ 创建新任务按钮
- 🔙 返回项目列表功能

### 2. 层级任务列表
- 🌳 树形结构展示任务和子任务
- 📊 支持无限层级嵌套
- 🔽 可展开/收起子任务
- 🎯 显示每个任务的子任务数量
- 🎨 缩进显示层级关系

### 3. 任务状态管理
- 🔄 四种任务状态：
  - ⚪ 待办（pending）
  - 🔵 进行中（in_progress）
  - ✅ 已完成（completed）
  - ❌ 已取消（cancelled）
- 📱 下拉菜单快速切换状态
- 🎨 不同状态显示不同颜色和图标
- ⚡ 实时更新，无需刷新页面

### 4. 任务操作
- ➕ 创建子任务
- ✏️ 编辑任务
- 🗑️ 删除任务（包括所有子任务）
- 💡 悬停显示操作按钮

### 5. 创建/编辑任务
- 📝 任务名称（必填，最多200字符）
- 📄 任务描述（可选）
- 🔖 任务状态选择
- 🔗 自动关联父任务（创建子任务时）
- ✅ 表单验证和错误提示
- 🔔 成功/失败 toast 通知

## 页面访问

- 项目列表：`/project-management`
- 项目详情：`/project-management/{项目ID}`

## 使用流程

### 创建项目和任务
1. 访问项目管理页面
2. 点击"创建项目"按钮
3. 填写项目名称和目标
4. 点击项目卡片进入详情页
5. 点击"创建任务"按钮
6. 填写任务信息并保存

### 创建子任务
1. 在项目详情页，找到父任务
2. 悬停在任务上，点击"+"按钮
3. 填写子任务信息并保存
4. 子任务会显示在父任务下方（缩进显示）

### 更改任务状态
1. 点击任务左侧的状态按钮
2. 在下拉菜单中选择新状态
3. 状态立即更新

### 编辑任务
1. 悬停在任务上，点击"编辑"按钮
2. 修改任务信息
3. 保存更改

### 删除任务
1. 悬停在任务上，点击"删除"按钮
2. 确认删除（会同时删除所有子任务）

## 技术实现

### 已创建的文件

#### 1. 类型定义更新 - `frontend/lib/types.ts`
- `TaskStatus` - 任务状态类型
- `Task` - 任务数据类型
- `TaskWithChildren` - 带子任务的任务类型
- `TaskCreate` - 创建任务请求类型
- `TaskUpdate` - 更新任务请求类型
- `TaskListResponse` - 任务列表响应类型

#### 2. API 接口更新 - `frontend/lib/api.ts`
- `createTask()` - 创建任务
- `getProjectTasks()` - 获取项目任务列表
- `getTask()` - 获取单个任务
- `updateTask()` - 更新任务
- `deleteTask()` - 删除任务
- `getTaskChildren()` - 获取子任务

#### 3. 项目详情页 - `frontend/app/project-management/[id]/page.tsx`
- 动态路由（Next.js App Router）
- 加载项目信息和任务列表
- 统一的任务操作处理
- 空状态展示

#### 4. 任务列表组件 - `frontend/components/task/TaskList.tsx`
- 构建树形结构
- 递归渲染任务和子任务

#### 5. 任务项组件 - `frontend/components/task/TaskItem.tsx`
- 展示单个任务
- 支持展开/收起子任务
- 显示任务状态、操作按钮
- 递归渲染子任务（支持无限层级）

#### 6. 任务状态选择器 - `frontend/components/task/TaskStatusSelect.tsx`
- 下拉菜单选择状态
- 状态图标和颜色
- 点击外部自动关闭

#### 7. 创建/编辑任务模态框 - `frontend/components/task/CreateTaskModal.tsx`
- 支持创建和编辑两种模式
- 支持创建子任务
- 表单验证
- Toast 通知

#### 8. 项目卡片更新 - `frontend/components/project/ProjectCard.tsx`
- 添加点击跳转到详情页功能
- 阻止按钮事件冒泡

## 特性亮点

### 🌳 层级结构
- 支持无限层级的任务嵌套
- 清晰的缩进显示
- 可展开/收起控制

### 🎨 状态管理
- 四种任务状态
- 彩色图标区分
- 下拉菜单快速切换
- 已完成/已取消的任务显示删除线

### 💡 用户体验
- 悬停显示操作按钮（避免界面混乱）
- 点击卡片进入详情页
- 空状态友好提示
- 加载状态处理
- Toast 通知反馈
- 删除确认对话框

### 🚀 性能优化
- 组件递归渲染
- 树形结构缓存
- 状态变更实时更新

## 数据结构

### 任务树形结构
```
项目
├── 任务1（待办）
│   ├── 子任务1.1（进行中）
│   │   └── 子任务1.1.1（已完成）
│   └── 子任务1.2（待办）
├── 任务2（已完成）
└── 任务3（进行中）
    └── 子任务3.1（待办）
```

## API 端点

后端 API 端点：

- `POST /api/projects/{project_id}/tasks` - 创建任务
- `GET /api/projects/{project_id}/tasks` - 获取任务列表
- `GET /api/projects/{project_id}/tasks/{task_id}` - 获取单个任务
- `PUT /api/projects/{project_id}/tasks/{task_id}` - 更新任务
- `DELETE /api/projects/{project_id}/tasks/{task_id}` - 删除任务
- `GET /api/projects/{project_id}/tasks/{task_id}/children` - 获取子任务

## 启动项目

### 启动后端
```bash
# 激活 conda 环境
conda activate laptop_showcase

# 启动 FastAPI 服务器
cd lifetrace
python server.py
```

### 启动前端
```bash
cd frontend
pnpm dev
```

访问：
- 项目列表：http://localhost:3000/project-management
- 项目详情：http://localhost:3000/project-management/1

## 代码质量

- ✅ 通过 TypeScript 类型检查
- ✅ 通过 ESLint 检查（无错误）
- ✅ 组件遵循 shadcn/ui 设计规范
- ✅ 响应式设计
- ✅ 代码注释清晰

## 后续可扩展功能

- 📅 任务截止日期
- 👥 任务分配给成员
- 🏷️ 任务标签/优先级
- 📎 任务附件
- 💬 任务评论
- 📊 任务统计图表
- 🔍 任务搜索和筛选
- 📝 任务拖拽排序
- ⏱️ 任务时间跟踪
- 🔔 任务提醒通知

## 注意事项

1. 删除任务会同时删除所有子任务，需要确认
2. 任务状态变更是实时的，不需要刷新页面
3. 支持无限层级的子任务嵌套
4. 项目卡片点击可进入详情页，编辑/删除按钮会阻止事件冒泡

